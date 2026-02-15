import { useAuthStore } from '../stores/authStore';
import type { UserRole } from '../types';

/**
 * Hook for role-based UI visibility.
 *
 * Role hierarchy:
 *   admin > moderator > viewer
 *
 * - admin: full access (create/delete servers, manage users, all actions)
 * - moderator: operational access (start/stop, commands, plugins, backups, kick/ban)
 * - viewer: read-only (view dashboards, consoles, player lists)
 */
export function useRole() {
  const user = useAuthStore((s) => s.user);
  const role: UserRole = (user?.role as UserRole) || 'viewer';

  return {
    role,
    isAdmin: role === 'admin',
    isMod: role === 'moderator',
    isViewer: role === 'viewer',
    /** admin or moderator */
    canOperate: role === 'admin' || role === 'moderator',
    /** admin only */
    canManage: role === 'admin',
  };
}
