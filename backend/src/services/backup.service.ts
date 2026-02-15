import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { createGzip } from 'zlib';
import { v4 as uuid } from 'uuid';
import { eq, desc } from 'drizzle-orm';
import * as tar from 'tar';
import { getDb } from '../db';
import { backups, servers, Backup } from '../db/schema';
import { config } from '../config';
import { createChildLogger } from '../utils/logger';

const log = createChildLogger('backup-service');

export class BackupService {
  private static instance: BackupService;

  static getInstance(): BackupService {
    if (!BackupService.instance) {
      BackupService.instance = new BackupService();
    }
    return BackupService.instance;
  }

  async createBackup(
    serverId: string,
    name: string,
    type: 'manual' | 'scheduled' | 'pre_update' = 'manual'
  ): Promise<Backup> {
    const db = getDb();
    const server = (await db.select().from(servers).where(eq(servers.id, serverId)))[0];
    if (!server) throw new Error(`Server ${serverId} not found`);

    const id = uuid();
    const timestamp = new Date();
    const fileName = `${server.name.replace(/[^a-zA-Z0-9]/g, '_')}_${timestamp.toISOString().replace(/[:.]/g, '-')}.tar.gz`;
    const backupDir = path.join(config.paths.backups, serverId);
    const filePath = path.join(backupDir, fileName);

    fs.mkdirSync(backupDir, { recursive: true });

    const backupData = {
      id,
      serverId,
      name,
      fileName,
      filePath,
      fileSize: 0,
      type,
      status: 'in_progress' as const,
      createdAt: timestamp,
    };

    await db.insert(backups).values(backupData);

    try {
      log.info({ serverId, backupId: id }, 'Starting backup');

      // Create tar.gz of server directory
      await tar.create(
        {
          gzip: true,
          file: filePath,
          cwd: path.dirname(server.directory),
        },
        [path.basename(server.directory)]
      );

      const stats = fs.statSync(filePath);

      await db
        .update(backups)
        .set({
          status: 'completed',
          fileSize: stats.size,
          completedAt: new Date(),
        })
        .where(eq(backups.id, id));

      log.info({ serverId, backupId: id, size: stats.size }, 'Backup completed');

      return (await db.select().from(backups).where(eq(backups.id, id)))[0];
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      await db
        .update(backups)
        .set({ status: 'failed', error: errMsg })
        .where(eq(backups.id, id));
      log.error({ serverId, backupId: id, error }, 'Backup failed');
      throw error;
    }
  }

  async restoreBackup(backupId: string): Promise<void> {
    const db = getDb();
    const backup = (await db.select().from(backups).where(eq(backups.id, backupId)))[0];
    if (!backup) throw new Error(`Backup ${backupId} not found`);

    const server = (await db.select().from(servers).where(eq(servers.id, backup.serverId)))[0];
    if (!server) throw new Error(`Server ${backup.serverId} not found`);

    if (!fs.existsSync(backup.filePath)) {
      throw new Error(`Backup file not found: ${backup.filePath}`);
    }

    log.info({ backupId, serverId: server.id }, 'Creating pre-restore backup');

    // Create a pre-restore backup first
    try {
      await this.createBackup(server.id, 'Pre-Restore Backup', 'pre_update');
    } catch (err) {
      log.warn({ backupId, serverId: server.id, err }, 'Failed to create pre-restore backup, continuing with restore');
    }

    log.info({ backupId, serverId: server.id }, 'Restoring backup');

    // Extract backup
    await tar.extract({
      file: backup.filePath,
      cwd: path.dirname(server.directory),
    });

    log.info({ backupId, serverId: server.id }, 'Backup restored');
  }

  async listBackups(serverId: string): Promise<Backup[]> {
    const db = getDb();
    return db
      .select()
      .from(backups)
      .where(eq(backups.serverId, serverId))
      .orderBy(desc(backups.createdAt));
  }

  async deleteBackup(backupId: string): Promise<void> {
    const db = getDb();
    const backup = (await db.select().from(backups).where(eq(backups.id, backupId)))[0];
    if (!backup) throw new Error(`Backup ${backupId} not found`);

    // Delete file
    if (fs.existsSync(backup.filePath)) {
      fs.unlinkSync(backup.filePath);
    }

    await db.delete(backups).where(eq(backups.id, backupId));
    log.info({ backupId }, 'Backup deleted');
  }

  async getBackupSize(serverId: string): Promise<number> {
    const db = getDb();
    const serverBackups = await db
      .select()
      .from(backups)
      .where(eq(backups.serverId, serverId));
    return serverBackups.reduce((sum, b) => sum + (b.fileSize || 0), 0);
  }

  async getBackupPath(backupId: string): Promise<{ filePath: string; fileName: string }> {
    const db = getDb();
    const backup = (await db.select().from(backups).where(eq(backups.id, backupId)))[0];
    if (!backup) throw new Error(`Backup ${backupId} not found`);
    if (!fs.existsSync(backup.filePath)) throw new Error('Backup file not found on disk');
    return { filePath: backup.filePath, fileName: backup.fileName };
  }

  /**
   * Apply retention policy: keep only maxBackups or remove backups older than maxAgeDays
   */
  async applyRetention(serverId: string, opts: { maxBackups?: number; maxAgeDays?: number }): Promise<number> {
    const db = getDb();
    const all = await db
      .select()
      .from(backups)
      .where(eq(backups.serverId, serverId))
      .orderBy(desc(backups.createdAt));

    let deleted = 0;

    // Delete by max count
    if (opts.maxBackups && all.length > opts.maxBackups) {
      const toDelete = all.slice(opts.maxBackups);
      for (const backup of toDelete) {
        try {
          if (fs.existsSync(backup.filePath)) fs.unlinkSync(backup.filePath);
          await db.delete(backups).where(eq(backups.id, backup.id));
          deleted++;
        } catch (err) {
          log.warn({ backupId: backup.id, err }, 'Failed to delete old backup');
        }
      }
    }

    // Delete by age
    if (opts.maxAgeDays) {
      const cutoff = Date.now() - opts.maxAgeDays * 24 * 60 * 60 * 1000;
      const remaining = await db
        .select()
        .from(backups)
        .where(eq(backups.serverId, serverId));

      for (const backup of remaining) {
        if (backup.createdAt && new Date(backup.createdAt).getTime() < cutoff) {
          try {
            if (fs.existsSync(backup.filePath)) fs.unlinkSync(backup.filePath);
            await db.delete(backups).where(eq(backups.id, backup.id));
            deleted++;
          } catch (err) {
            log.warn({ backupId: backup.id, err }, 'Failed to delete old backup');
          }
        }
      }
    }

    if (deleted > 0) {
      log.info({ serverId, deleted }, 'Retention policy applied');
    }

    return deleted;
  }
}
