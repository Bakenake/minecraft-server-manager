import { FastifyInstance } from 'fastify';
import { authMiddleware, requireRole } from '../auth/middleware';
import { getDb } from '../db';
import { userPermissions, users } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { createChildLogger } from '../utils/logger';

const log = createChildLogger('permissions');

// All available permissions grouped by category
export const PERMISSION_DEFINITIONS = {
  server: {
    label: 'Server Management',
    permissions: [
      { key: 'server.start', label: 'Start Server' },
      { key: 'server.stop', label: 'Stop Server' },
      { key: 'server.restart', label: 'Restart Server' },
      { key: 'server.console', label: 'Access Console' },
      { key: 'server.settings', label: 'Edit Server Settings' },
      { key: 'server.delete', label: 'Delete Server' },
    ],
  },
  files: {
    label: 'File Management',
    permissions: [
      { key: 'files.view', label: 'View Files' },
      { key: 'files.edit', label: 'Edit Files' },
      { key: 'files.upload', label: 'Upload Files' },
      { key: 'files.delete', label: 'Delete Files' },
      { key: 'files.sftp', label: 'SFTP Access' },
    ],
  },
  plugins: {
    label: 'Plugins & Mods',
    permissions: [
      { key: 'plugins.view', label: 'View Plugins' },
      { key: 'plugins.install', label: 'Install Plugins' },
      { key: 'plugins.remove', label: 'Remove Plugins' },
      { key: 'plugins.toggle', label: 'Enable/Disable Plugins' },
    ],
  },
  players: {
    label: 'Player Management',
    permissions: [
      { key: 'players.view', label: 'View Players' },
      { key: 'players.kick', label: 'Kick Players' },
      { key: 'players.ban', label: 'Ban/Unban Players' },
      { key: 'players.whitelist', label: 'Manage Whitelist' },
    ],
  },
  backups: {
    label: 'Backups',
    permissions: [
      { key: 'backups.view', label: 'View Backups' },
      { key: 'backups.create', label: 'Create Backups' },
      { key: 'backups.restore', label: 'Restore Backups' },
      { key: 'backups.delete', label: 'Delete Backups' },
      { key: 'backups.download', label: 'Download Backups' },
    ],
  },
  tasks: {
    label: 'Scheduled Tasks',
    permissions: [
      { key: 'tasks.view', label: 'View Tasks' },
      { key: 'tasks.manage', label: 'Create/Edit/Delete Tasks' },
    ],
  },
  admin: {
    label: 'Administration',
    permissions: [
      { key: 'admin.users', label: 'Manage Users' },
      { key: 'admin.settings', label: 'App Settings' },
      { key: 'admin.audit', label: 'View Audit Log' },
    ],
  },
};

// Flatten permissions into a list for validation
export const ALL_PERMISSION_KEYS = Object.values(PERMISSION_DEFINITIONS)
  .flatMap((cat) => cat.permissions.map((p) => p.key));

export function registerPermissionRoutes(app: FastifyInstance): void {
  // Get all available permission definitions
  app.get(
    '/api/permissions/definitions',
    { preHandler: [authMiddleware, requireRole('admin')] },
    async () => {
      return PERMISSION_DEFINITIONS;
    }
  );

  // Get permissions for a specific user
  app.get(
    '/api/users/:userId/permissions',
    { preHandler: [authMiddleware, requireRole('admin')] },
    async (request, reply) => {
      const { userId } = request.params as { userId: string };
      const db = getDb();

      // Ensure user exists
      const user = (await db.select().from(users).where(eq(users.id, userId)))[0];
      if (!user) return reply.status(404).send({ error: 'User not found' });

      const perms = await db.select().from(userPermissions).where(eq(userPermissions.userId, userId));
      return perms;
    }
  );

  // Set permissions for a user (replaces all permissions)
  app.put(
    '/api/users/:userId/permissions',
    { preHandler: [authMiddleware, requireRole('admin')] },
    async (request, reply) => {
      const { userId } = request.params as { userId: string };
      const body = request.body as {
        permissions: Array<{
          permission: string;
          serverId?: string | null;
          granted: boolean;
        }>;
      };

      if (!body.permissions || !Array.isArray(body.permissions)) {
        return reply.status(400).send({ error: 'permissions array is required' });
      }

      const db = getDb();

      // Ensure user exists and is not admin (admins have all permissions)
      const user = (await db.select().from(users).where(eq(users.id, userId)))[0];
      if (!user) return reply.status(404).send({ error: 'User not found' });
      if (user.role === 'admin') {
        return reply.status(400).send({ error: 'Cannot set permissions for admin users — they have full access' });
      }

      // Can't edit own permissions
      if (userId === request.user!.userId) {
        return reply.status(400).send({ error: 'Cannot modify your own permissions' });
      }

      // Validate permission keys
      for (const p of body.permissions) {
        if (!ALL_PERMISSION_KEYS.includes(p.permission)) {
          return reply.status(400).send({ error: `Invalid permission: ${p.permission}` });
        }
      }

      // Delete existing permissions and insert new ones
      await db.delete(userPermissions).where(eq(userPermissions.userId, userId));

      if (body.permissions.length > 0) {
        const now = new Date();
        await db.insert(userPermissions).values(
          body.permissions.map((p) => ({
            userId,
            permission: p.permission,
            serverId: p.serverId || null,
            granted: p.granted,
            createdAt: now,
          }))
        );
      }

      log.info({ userId, permissionCount: body.permissions.length }, 'Updated user permissions');
      return { message: 'Permissions updated', count: body.permissions.length };
    }
  );
}

// Helper to check if a user has a specific permission
export async function hasPermission(
  userId: string,
  role: string,
  permission: string,
  serverId?: string
): Promise<boolean> {
  // Admins always have all permissions
  if (role === 'admin') return true;

  const db = getDb();
  const perms = await db.select().from(userPermissions).where(eq(userPermissions.userId, userId));

  // If no permissions are configured, fall back to role-based defaults
  if (perms.length === 0) {
    return getDefaultPermission(role, permission);
  }

  // Check for server-specific permission first
  if (serverId) {
    const serverPerm = perms.find(
      (p) => p.permission === permission && p.serverId === serverId
    );
    if (serverPerm) return serverPerm.granted;
  }

  // Check for global permission (serverId is null)
  const globalPerm = perms.find(
    (p) => p.permission === permission && !p.serverId
  );
  if (globalPerm) return globalPerm.granted;

  // Default: deny for viewers, allow most for moderators
  return getDefaultPermission(role, permission);
}

function getDefaultPermission(role: string, permission: string): boolean {
  if (role === 'admin') return true;

  if (role === 'moderator') {
    // Moderators can do most things except admin-specific actions
    const denied = ['server.delete', 'admin.users', 'admin.settings'];
    return !denied.includes(permission);
  }

  // Viewers can only view
  const allowed = [
    'files.view', 'plugins.view', 'players.view',
    'backups.view', 'tasks.view',
  ];
  return allowed.includes(permission);
}
