import { getDb } from '../db';
import { auditLog } from '../db/schema';
import { desc } from 'drizzle-orm';
import { createChildLogger } from '../utils/logger';

const log = createChildLogger('audit');

export interface AuditEntry {
  userId?: string;
  action: string;
  resource: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
}

export class AuditService {
  private static instance: AuditService;

  static getInstance(): AuditService {
    if (!AuditService.instance) {
      AuditService.instance = new AuditService();
    }
    return AuditService.instance;
  }

  /**
   * Log an audit event
   */
  async log(entry: AuditEntry): Promise<void> {
    try {
      const db = getDb();
      await db.insert(auditLog).values({
        userId: entry.userId || null,
        action: entry.action,
        resource: entry.resource,
        resourceId: entry.resourceId || null,
        details: entry.details ? JSON.stringify(entry.details) : null,
        ipAddress: entry.ipAddress || null,
        timestamp: new Date(),
      });
    } catch (err) {
      // Don't let audit logging failures break the main flow
      log.error({ err, entry }, 'Failed to write audit log');
    }
  }

  /**
   * Get recent audit entries
   */
  async getEntries(limit = 100): Promise<any[]> {
    const db = getDb();
    return db
      .select()
      .from(auditLog)
      .orderBy(desc(auditLog.timestamp))
      .limit(limit);
  }
}

// Convenience function for quick logging
export function audit(entry: AuditEntry): void {
  AuditService.getInstance().log(entry);
}
