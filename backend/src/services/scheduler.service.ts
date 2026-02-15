import { CronJob } from 'cron';
import { eq, desc } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { getDb } from '../db';
import { scheduledTasks, taskHistory, ScheduledTask } from '../db/schema';
import { ServerManager } from './server-manager';
import { BackupService } from './backup.service';
import { createChildLogger } from '../utils/logger';

const log = createChildLogger('scheduler');

interface ActiveJob {
  task: ScheduledTask;
  cronJob: CronJob;
}

export class SchedulerService {
  private static instance: SchedulerService;
  private activeJobs: Map<string, ActiveJob> = new Map();

  static getInstance(): SchedulerService {
    if (!SchedulerService.instance) {
      SchedulerService.instance = new SchedulerService();
    }
    return SchedulerService.instance;
  }

  async initialize(): Promise<void> {
    const db = getDb();
    const tasks = await db.select().from(scheduledTasks);

    for (const task of tasks) {
      if (task.enabled) {
        this.startJob(task);
      }
    }

    log.info(`Scheduler initialized with ${tasks.filter((t) => t.enabled).length} active jobs`);
  }

  async createTask(data: {
    serverId: string;
    type: 'restart' | 'backup' | 'command';
    cronExpression: string;
    command?: string;
    enabled?: boolean;
  }): Promise<ScheduledTask> {
    const db = getDb();
    const id = uuid();
    const now = new Date();

    const taskData = {
      id,
      serverId: data.serverId,
      type: data.type,
      cronExpression: data.cronExpression,
      command: data.command || null,
      enabled: data.enabled ?? true,
      createdAt: now,
    };

    await db.insert(scheduledTasks).values(taskData);
    const task = (await db.select().from(scheduledTasks).where(eq(scheduledTasks.id, id)))[0];

    if (task.enabled) {
      this.startJob(task);
    }

    log.info({ taskId: id, type: data.type, cron: data.cronExpression }, 'Scheduled task created');
    return task;
  }

  async deleteTask(taskId: string): Promise<void> {
    this.stopJob(taskId);
    const db = getDb();
    await db.delete(scheduledTasks).where(eq(scheduledTasks.id, taskId));
    log.info({ taskId }, 'Scheduled task deleted');
  }

  async toggleTask(taskId: string, enabled: boolean): Promise<void> {
    const db = getDb();
    await db.update(scheduledTasks).set({ enabled }).where(eq(scheduledTasks.id, taskId));

    if (enabled) {
      const task = (await db.select().from(scheduledTasks).where(eq(scheduledTasks.id, taskId)))[0];
      if (task) this.startJob(task);
    } else {
      this.stopJob(taskId);
    }
  }

  async getTasksForServer(serverId: string): Promise<ScheduledTask[]> {
    const db = getDb();
    return db.select().from(scheduledTasks).where(eq(scheduledTasks.serverId, serverId));
  }

  async updateTask(taskId: string, data: {
    cronExpression?: string;
    command?: string;
    type?: 'restart' | 'backup' | 'command';
  }): Promise<ScheduledTask | null> {
    const db = getDb();
    const updates: Record<string, unknown> = {};
    if (data.cronExpression) updates.cronExpression = data.cronExpression;
    if (data.command !== undefined) updates.command = data.command || null;
    if (data.type) updates.type = data.type;

    await db.update(scheduledTasks).set(updates).where(eq(scheduledTasks.id, taskId));

    // Restart the job if it's active (cron might have changed)
    const task = (await db.select().from(scheduledTasks).where(eq(scheduledTasks.id, taskId)))[0];
    if (task) {
      this.stopJob(taskId);
      if (task.enabled) {
        this.startJob(task);
      }
    }

    log.info({ taskId, updates: data }, 'Scheduled task updated');
    return task || null;
  }

  async runNow(taskId: string): Promise<void> {
    const db = getDb();
    const task = (await db.select().from(scheduledTasks).where(eq(scheduledTasks.id, taskId)))[0];
    if (!task) throw new Error('Task not found');
    await this.executeTask(task);
  }

  async getHistory(serverId?: string, limit = 50): Promise<any[]> {
    const db = getDb();
    if (serverId) {
      return db.select().from(taskHistory)
        .where(eq(taskHistory.serverId, serverId))
        .orderBy(desc(taskHistory.executedAt))
        .limit(limit);
    }
    return db.select().from(taskHistory)
      .orderBy(desc(taskHistory.executedAt))
      .limit(limit);
  }

  private startJob(task: ScheduledTask): void {
    try {
      const cronJob = new CronJob(task.cronExpression, () => this.executeTask(task), null, true);

      // Persist nextRunAt
      const nextDate = cronJob.nextDate();
      if (nextDate) {
        const db = getDb();
        db.update(scheduledTasks)
          .set({ nextRunAt: nextDate.toJSDate() })
          .where(eq(scheduledTasks.id, task.id))
          .then(() => {});
      }

      this.activeJobs.set(task.id, { task, cronJob });
      log.debug({ taskId: task.id, type: task.type }, 'Job started');
    } catch (err) {
      log.error({ taskId: task.id, error: err }, 'Failed to start cron job');
    }
  }

  private stopJob(taskId: string): void {
    const job = this.activeJobs.get(taskId);
    if (job) {
      job.cronJob.stop();
      this.activeJobs.delete(taskId);
    }
  }

  private async executeTask(task: ScheduledTask): Promise<void> {
    log.info({ taskId: task.id, type: task.type }, 'Executing scheduled task');

    const db = getDb();
    const startTime = Date.now();
    await db
      .update(scheduledTasks)
      .set({ lastRunAt: new Date() })
      .where(eq(scheduledTasks.id, task.id));

    // Update nextRunAt for this task
    const activeJob = this.activeJobs.get(task.id);
    if (activeJob) {
      const nextDate = activeJob.cronJob.nextDate();
      if (nextDate) {
        await db.update(scheduledTasks)
          .set({ nextRunAt: nextDate.toJSDate() })
          .where(eq(scheduledTasks.id, task.id));
      }
    }

    try {
      const manager = ServerManager.getInstance();

      switch (task.type) {
        case 'restart':
          await manager.restartServer(task.serverId);
          break;

        case 'backup':
          await BackupService.getInstance().createBackup(task.serverId, `Scheduled Backup`, 'scheduled');
          break;

        case 'command':
          if (task.command) {
            manager.sendCommand(task.serverId, task.command);
          }
          break;
      }

      const duration = Date.now() - startTime;
      log.info({ taskId: task.id, type: task.type, duration }, 'Scheduled task completed');

      // Log success to history
      await db.insert(taskHistory).values({
        taskId: task.id,
        serverId: task.serverId,
        type: task.type,
        status: 'success',
        message: `${task.type} completed successfully`,
        duration,
        executedAt: new Date(),
      });
    } catch (error: any) {
      const duration = Date.now() - startTime;
      log.error({ taskId: task.id, type: task.type, error }, 'Scheduled task failed');

      // Log failure to history
      await db.insert(taskHistory).values({
        taskId: task.id,
        serverId: task.serverId,
        type: task.type,
        status: 'failed',
        message: error.message || 'Unknown error',
        duration,
        executedAt: new Date(),
      });
    }
  }

  async shutdown(): Promise<void> {
    for (const [, job] of this.activeJobs) {
      job.cronJob.stop();
    }
    this.activeJobs.clear();
    log.info('Scheduler shut down');
  }
}
