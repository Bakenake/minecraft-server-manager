import { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from 'fastify';
import { LicenseService, FeatureFlags } from '../services/license.service';
import { createChildLogger } from '../utils/logger';

const log = createChildLogger('feature-gate');

/**
 * Middleware factory that gates a route behind a premium feature.
 * If the user doesn't have the required feature, returns 403 with upgrade info.
 *
 * Usage:
 *   { preHandler: [authenticate, requireFeature('analytics')] }
 */
export function requireFeature(feature: keyof FeatureFlags) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const licenseService = LicenseService.getInstance();
    const hasAccess = await licenseService.hasFeature(feature);

    if (!hasAccess) {
      const { tier } = await licenseService.getCurrentTier();
      log.debug({ feature, tier, url: request.url }, 'Feature gated - access denied');

      return reply.code(403).send({
        error: 'Premium feature required',
        code: 'PREMIUM_REQUIRED',
        feature,
        currentTier: tier,
        requiredTier: 'premium',
        message: `This feature requires a Premium subscription. You are currently on the ${tier} tier.`,
        upgradeUrl: '/subscription',
      });
    }
  };
}

/**
 * Middleware that checks if the user can create additional servers
 * based on their tier's server limit.
 */
export function requireServerSlot() {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const licenseService = LicenseService.getInstance();
    const { getDb } = await import('../db');
    const { servers } = await import('../db/schema');

    const db = getDb();
    const serverCount = await db.select().from(servers);

    const check = await licenseService.canCreateServer(serverCount.length);
    if (!check.allowed) {
      return reply.code(403).send({
        error: 'Server limit reached',
        code: 'SERVER_LIMIT',
        message: check.reason,
        currentTier: (await licenseService.getCurrentTier()).tier,
        upgradeUrl: '/subscription',
      });
    }
  };
}

/**
 * Middleware that checks if the requested RAM allocation is within tier limits.
 * Expects `maxRam` or `max_ram` in the request body.
 */
export function requireRamLimit() {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as any;
    const ramMb = body?.maxRam || body?.max_ram;

    if (ramMb) {
      const licenseService = LicenseService.getInstance();
      const check = await licenseService.canAllocateRam(ramMb);
      if (!check.allowed) {
        return reply.code(403).send({
          error: 'RAM limit exceeded',
          code: 'RAM_LIMIT',
          message: check.reason,
          currentTier: (await licenseService.getCurrentTier()).tier,
          upgradeUrl: '/subscription',
        });
      }
    }
  };
}

/**
 * Middleware that checks if the server type is allowed in the current tier.
 * Expects `type` in the request body.
 */
export function requireServerType() {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as any;
    const serverType = body?.type;

    if (serverType) {
      const licenseService = LicenseService.getInstance();
      const check = await licenseService.isServerTypeAllowed(serverType);
      if (!check.allowed) {
        return reply.code(403).send({
          error: 'Server type not available',
          code: 'SERVER_TYPE_RESTRICTED',
          message: check.reason,
          currentTier: (await licenseService.getCurrentTier()).tier,
          upgradeUrl: '/subscription',
        });
      }
    }
  };
}

/**
 * Middleware that injects the current tier info into the request
 * so downstream handlers can check it without calling the service again.
 */
export function injectTierInfo() {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    const licenseService = LicenseService.getInstance();
    const tierInfo = await licenseService.getCurrentTier();
    (request as any).tierInfo = tierInfo;
  };
}

/**
 * Middleware that checks if the user can create additional backups
 * based on their tier's backup limit.
 */
export function requireBackupSlot() {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const licenseService = LicenseService.getInstance();
    const { tier, limits } = await licenseService.getCurrentTier();

    if (limits.maxBackups !== -1) {
      const { getDb } = await import('../db');
      const { backups } = await import('../db/schema');
      const { eq } = await import('drizzle-orm');

      const { id } = request.params as { id: string };
      const db = getDb();
      const existingBackups = await db.select().from(backups).where(eq(backups.serverId, id));

      if (existingBackups.length >= limits.maxBackups) {
        return reply.code(403).send({
          error: 'Backup limit reached',
          code: 'PREMIUM_REQUIRED',
          feature: 'advancedBackups',
          message: `Free plan is limited to ${limits.maxBackups} backups per server. Upgrade to Premium for unlimited backups.`,
          currentTier: tier,
          requiredTier: 'premium',
          upgradeUrl: '/subscription',
        });
      }
    }
  };
}

/**
 * Middleware that checks if the user can install additional plugins
 * based on their tier's plugin limit.
 */
export function requirePluginSlot() {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const licenseService = LicenseService.getInstance();
    const { tier, limits } = await licenseService.getCurrentTier();

    if (limits.maxPlugins !== -1) {
      const { id } = request.params as { id: string };
      const { ServerManager } = await import('../services/server-manager');
      const { PluginService } = await import('../services/plugin.service');
      const manager = ServerManager.getInstance();
      const server = await manager.getServer(id);
      if (server) {
        const pluginService = PluginService.getInstance();
        const plugins = await pluginService.listPlugins(server.directory);
        if (plugins.length >= limits.maxPlugins) {
          return reply.code(403).send({
            error: 'Plugin limit reached',
            code: 'PREMIUM_REQUIRED',
            feature: 'pluginManagement',
            message: `Free plan is limited to ${limits.maxPlugins} plugins. Upgrade to Premium for unlimited plugins.`,
            currentTier: tier,
            requiredTier: 'premium',
            upgradeUrl: '/subscription',
          });
        }
      }
    }
  };
}
