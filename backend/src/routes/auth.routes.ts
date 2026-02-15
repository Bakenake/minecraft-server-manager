import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';
import { eq } from 'drizzle-orm';
import { getDb } from '../db';
import { users, apiKeys, userPermissions } from '../db/schema';
import { hashPassword, verifyPassword, validatePasswordStrength } from '../auth/password';
import { signToken } from '../auth/jwt';
import { generateTotpSecret, verifyTotp, generateTotpQrCode } from '../auth/totp';
import { authMiddleware, requireRole } from '../auth/middleware';
import { config } from '../config';
import { createChildLogger } from '../utils/logger';
import { audit } from '../services/audit.service';
import crypto from 'crypto';

const log = createChildLogger('auth-routes');

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // ─── Setup (create initial admin) ──────────────────────────
  app.post('/api/auth/setup', async (request, reply) => {
    const db = getDb();
    const existingUsers = await db.select().from(users);
    if (existingUsers.length > 0) {
      return reply.status(400).send({ error: 'Setup already completed' });
    }

    const schema = z.object({
      username: z.string().min(3).max(32),
      email: z.string().email(),
      password: z.string().min(8),
    });

    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation failed', details: parsed.error.flatten() });
    }

    const { username, email, password } = parsed.data;

    const strength = validatePasswordStrength(password);
    if (!strength.valid) {
      return reply.status(400).send({ error: 'Weak password', details: strength.errors });
    }

    const passwordHash = await hashPassword(password);
    const now = new Date();

    await db.insert(users).values({
      id: uuid(),
      username,
      email,
      passwordHash,
      role: 'admin',
      createdAt: now,
      updatedAt: now,
    });

    log.info({ username }, 'Initial admin user created');
    return { message: 'Admin user created successfully' };
  });

  // ─── Login ─────────────────────────────────────────────────
  app.post('/api/auth/login', async (request, reply) => {
    const schema = z.object({
      username: z.string(),
      password: z.string(),
      totpToken: z.string().optional(),
    });

    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid request' });
    }

    const { username, password, totpToken } = parsed.data;
    const db = getDb();

    const user = (await db.select().from(users).where(eq(users.username, username)))[0];
    if (!user || !user.isActive) {
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    const validPassword = await verifyPassword(password, user.passwordHash);
    if (!validPassword) {
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    // Check 2FA
    if (user.totpEnabled && user.totpSecret) {
      if (!totpToken) {
        return reply.status(200).send({ requiresTwoFactor: true });
      }
      if (!verifyTotp(totpToken, user.totpSecret)) {
        return reply.status(401).send({ error: 'Invalid 2FA token' });
      }
    }

    // Update last login
    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));

    const token = signToken({
      userId: user.id,
      username: user.username,
      role: user.role as 'admin' | 'moderator' | 'viewer',
    });

    log.info({ username }, 'User logged in');
    audit({ userId: user.id, action: 'login', resource: 'auth', ipAddress: request.ip });

    return {
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        totpEnabled: user.totpEnabled,
      },
    };
  });

  // ─── Check setup status ──────────────────────────────────
  app.get('/api/auth/status', async () => {
    const db = getDb();
    const existingUsers = await db.select().from(users);
    return {
      setupRequired: existingUsers.length === 0,
      version: config.version,
    };
  });

  // ─── Get current user ────────────────────────────────────
  app.get('/api/auth/me', { preHandler: authMiddleware }, async (request) => {
    const db = getDb();
    const user = (await db.select().from(users).where(eq(users.id, request.user!.userId)))[0];
    if (!user) throw new Error('User not found');

    return {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      totpEnabled: user.totpEnabled,
      createdAt: user.createdAt,
    };
  });

  // ─── Get current user permissions ────────────────────────
  app.get('/api/auth/me/permissions', { preHandler: authMiddleware }, async (request) => {
    // Admins have all permissions
    if (request.user!.role === 'admin') {
      return { role: 'admin', permissions: [], hasAllAccess: true };
    }
    const db = getDb();
    const perms = await db.select().from(userPermissions).where(eq(userPermissions.userId, request.user!.userId));
    return { role: request.user!.role, permissions: perms, hasAllAccess: false };
  });

  // ─── Change password ─────────────────────────────────────
  app.post('/api/auth/change-password', { preHandler: authMiddleware }, async (request, reply) => {
    const schema = z.object({
      currentPassword: z.string(),
      newPassword: z.string().min(8),
    });

    const parsed = schema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Validation failed' });

    const { currentPassword, newPassword } = parsed.data;
    const db = getDb();

    const user = (await db.select().from(users).where(eq(users.id, request.user!.userId)))[0];
    if (!user) return reply.status(404).send({ error: 'User not found' });

    const valid = await verifyPassword(currentPassword, user.passwordHash);
    if (!valid) return reply.status(401).send({ error: 'Current password is incorrect' });

    const strength = validatePasswordStrength(newPassword);
    if (!strength.valid) return reply.status(400).send({ error: 'Weak password', details: strength.errors });

    const hash = await hashPassword(newPassword);
    await db.update(users).set({ passwordHash: hash, updatedAt: new Date() }).where(eq(users.id, user.id));
    audit({ userId: request.user!.userId, action: 'change_password', resource: 'auth', ipAddress: request.ip });

    return { message: 'Password changed successfully' };
  });

  // ─── 2FA Setup ────────────────────────────────────────────
  app.post('/api/auth/2fa/enable', { preHandler: authMiddleware }, async (request, reply) => {
    if (!config.features.twoFactor) {
      return reply.status(400).send({ error: '2FA is disabled' });
    }

    const secret = generateTotpSecret();
    const qrCode = await generateTotpQrCode(request.user!.username, secret);

    // Store secret temporarily (will be confirmed with a verify step)
    const db = getDb();
    await db
      .update(users)
      .set({ totpSecret: secret })
      .where(eq(users.id, request.user!.userId));

    return { secret, qrCode };
  });

  app.post('/api/auth/2fa/verify', { preHandler: authMiddleware }, async (request, reply) => {
    const schema = z.object({ token: z.string().length(6) });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid token format' });

    const db = getDb();
    const user = (await db.select().from(users).where(eq(users.id, request.user!.userId)))[0];
    if (!user?.totpSecret) return reply.status(400).send({ error: '2FA setup not initiated' });

    if (!verifyTotp(parsed.data.token, user.totpSecret)) {
      return reply.status(400).send({ error: 'Invalid verification token' });
    }

    await db
      .update(users)
      .set({ totpEnabled: true, updatedAt: new Date() })
      .where(eq(users.id, user.id));
    audit({ userId: request.user!.userId, action: '2fa_enabled', resource: 'auth', ipAddress: request.ip });

    return { message: '2FA enabled successfully' };
  });

  app.post('/api/auth/2fa/disable', { preHandler: authMiddleware }, async (request, reply) => {
    const schema = z.object({ password: z.string() });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Password required' });

    const db = getDb();
    const user = (await db.select().from(users).where(eq(users.id, request.user!.userId)))[0];
    if (!user) return reply.status(404).send({ error: 'User not found' });

    const valid = await verifyPassword(parsed.data.password, user.passwordHash);
    if (!valid) return reply.status(401).send({ error: 'Invalid password' });

    await db
      .update(users)
      .set({ totpEnabled: false, totpSecret: null, updatedAt: new Date() })
      .where(eq(users.id, user.id));
    audit({ userId: request.user!.userId, action: '2fa_disabled', resource: 'auth', ipAddress: request.ip });

    return { message: '2FA disabled successfully' };
  });

  // ─── User management (admin) ──────────────────────────────
  app.get(
    '/api/auth/users',
    { preHandler: [authMiddleware, requireRole('admin')] },
    async () => {
      const db = getDb();
      const allUsers = await db.select().from(users);
      return allUsers.map((u) => ({
        id: u.id,
        username: u.username,
        email: u.email,
        role: u.role,
        isActive: u.isActive,
        totpEnabled: u.totpEnabled,
        lastLoginAt: u.lastLoginAt,
        createdAt: u.createdAt,
      }));
    }
  );

  app.post(
    '/api/auth/users',
    { preHandler: [authMiddleware, requireRole('admin')] },
    async (request, reply) => {
      const schema = z.object({
        username: z.string().min(3).max(32),
        email: z.string().email(),
        password: z.string().min(8),
        role: z.enum(['admin', 'moderator', 'viewer']),
      });

      const parsed = schema.safeParse(request.body);
      if (!parsed.success) return reply.status(400).send({ error: 'Validation failed', details: parsed.error.flatten() });

      const { username, email, password, role } = parsed.data;
      const db = getDb();

      // Check for duplicates
      const existing = await db.select().from(users).where(eq(users.username, username));
      if (existing.length > 0) {
        return reply.status(409).send({ error: 'Username already taken' });
      }

      const passwordHash = await hashPassword(password);
      const now = new Date();
      const id = uuid();

      await db.insert(users).values({
        id,
        username,
        email,
        passwordHash,
        role,
        createdAt: now,
        updatedAt: now,
      });

      log.info({ username, role, createdBy: request.user!.username }, 'User created');
      audit({ userId: request.user!.userId, action: 'create_user', resource: 'user', resourceId: id, details: { username, role }, ipAddress: request.ip });
      return { id, username, email, role };
    }
  );

  app.delete(
    '/api/auth/users/:userId',
    { preHandler: [authMiddleware, requireRole('admin')] },
    async (request, reply) => {
      const { userId } = request.params as { userId: string };

      if (userId === request.user!.userId) {
        return reply.status(400).send({ error: 'Cannot delete your own account' });
      }

      const db = getDb();
      await db.delete(users).where(eq(users.id, userId));
      audit({ userId: request.user!.userId, action: 'delete_user', resource: 'user', resourceId: userId, ipAddress: request.ip });
      return { message: 'User deleted' };
    }
  );

  // ─── API Keys ────────────────────────────────────────────
  app.get(
    '/api/auth/api-keys',
    { preHandler: [authMiddleware] },
    async (request) => {
      const db = getDb();
      const keys = await db.select({
        id: apiKeys.id,
        name: apiKeys.name,
        keyPrefix: apiKeys.keyPrefix,
        role: apiKeys.role,
        lastUsedAt: apiKeys.lastUsedAt,
        expiresAt: apiKeys.expiresAt,
        createdAt: apiKeys.createdAt,
      }).from(apiKeys).where(eq(apiKeys.userId, request.user!.userId));
      return keys;
    }
  );

  app.post(
    '/api/auth/api-keys',
    { preHandler: [authMiddleware] },
    async (request, reply) => {
      const schema = z.object({
        name: z.string().min(1).max(64),
        role: z.enum(['admin', 'moderator', 'viewer']).optional(),
        expiresInDays: z.number().int().min(1).max(365).optional(),
      });

      const parsed = schema.safeParse(request.body);
      if (!parsed.success) return reply.status(400).send({ error: 'Invalid request' });

      // Cannot create a key with higher role than the user's own
      const roleHierarchy = { admin: 3, moderator: 2, viewer: 1 };
      const requestedRole = parsed.data.role || request.user!.role;
      if (roleHierarchy[requestedRole] > roleHierarchy[request.user!.role]) {
        return reply.status(403).send({ error: 'Cannot create API key with higher role than your own' });
      }

      const id = uuid();
      const rawKey = `cos_${crypto.randomBytes(32).toString('hex')}`;
      const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
      const keyPrefix = rawKey.substring(0, 12);

      const expiresAt = parsed.data.expiresInDays
        ? new Date(Date.now() + parsed.data.expiresInDays * 86400000)
        : null;

      const db = getDb();
      await db.insert(apiKeys).values({
        id,
        userId: request.user!.userId,
        name: parsed.data.name,
        keyHash,
        keyPrefix,
        role: requestedRole,
        expiresAt,
        createdAt: new Date(),
      });

      // Return the raw key only once - it cannot be retrieved later
      return { id, name: parsed.data.name, key: rawKey, role: requestedRole, expiresAt };
    }
  );

  app.delete(
    '/api/auth/api-keys/:keyId',
    { preHandler: [authMiddleware] },
    async (request, reply) => {
      const { keyId } = request.params as { keyId: string };
      const db = getDb();

      // Can only delete own keys (or admin can delete any)
      const key = (await db.select().from(apiKeys).where(eq(apiKeys.id, keyId)))[0];
      if (!key) return reply.status(404).send({ error: 'API key not found' });

      if (key.userId !== request.user!.userId && request.user!.role !== 'admin') {
        return reply.status(403).send({ error: 'Cannot delete this API key' });
      }

      await db.delete(apiKeys).where(eq(apiKeys.id, keyId));
      return { message: 'API key deleted' };
    }
  );
}
