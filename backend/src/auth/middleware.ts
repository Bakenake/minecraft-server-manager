import { FastifyRequest, FastifyReply } from 'fastify';
import { verifyToken, JwtPayload } from './jwt';
import { createChildLogger } from '../utils/logger';
import crypto from 'crypto';
import { getDb } from '../db';
import { apiKeys } from '../db/schema';
import { eq } from 'drizzle-orm';

const log = createChildLogger('auth');

// Extend FastifyRequest to include user
declare module 'fastify' {
  interface FastifyRequest {
    user?: JwtPayload;
  }
}

export async function authMiddleware(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    // Check for API key first
    const apiKeyHeader = request.headers['x-api-key'] as string | undefined;
    if (apiKeyHeader) {
      const keyHash = crypto.createHash('sha256').update(apiKeyHeader).digest('hex');
      const db = getDb();
      const keyRecord = (await db.select().from(apiKeys).where(eq(apiKeys.keyHash, keyHash)))[0];

      if (!keyRecord) {
        return reply.status(401).send({ error: 'Invalid API key' });
      }

      // Check expiry
      if (keyRecord.expiresAt && new Date(keyRecord.expiresAt) < new Date()) {
        return reply.status(401).send({ error: 'API key expired' });
      }

      // Update last used
      await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, keyRecord.id));

      request.user = {
        userId: keyRecord.userId,
        username: `apikey:${keyRecord.name}`,
        role: keyRecord.role as 'admin' | 'moderator' | 'viewer',
      };
      return;
    }

    // Fall back to JWT Bearer token
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'Missing or invalid authorization header' });
    }

    const token = authHeader.substring(7);
    const payload = verifyToken(token);
    request.user = payload;
  } catch (error) {
    log.warn({ error }, 'Authentication failed');
    return reply.status(401).send({ error: 'Invalid or expired token' });
  }
}

export function requireRole(...roles: Array<'admin' | 'moderator' | 'viewer'>) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.user) {
      return reply.status(401).send({ error: 'Not authenticated' });
    }

    if (!roles.includes(request.user.role)) {
      log.warn({ userId: request.user.userId, role: request.user.role, required: roles }, 'Insufficient permissions');
      return reply.status(403).send({ error: 'Insufficient permissions' });
    }
  };
}

export function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  return requireRole('admin')(request, reply);
}

export function requireModerator(request: FastifyRequest, reply: FastifyReply) {
  return requireRole('admin', 'moderator')(request, reply);
}
