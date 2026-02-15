import { buildApp } from './app';
import { config } from './config';
import { initDatabase, closeDatabase } from './db';
import { ServerManager } from './services/server-manager';
import { MetricsService } from './services/metrics.service';
import { SchedulerService } from './services/scheduler.service';
import { SFTPService } from './services/sftp.service';
import { DiscordBridge } from './services/discord-bridge.service';
import { logger } from './utils/logger';

async function main(): Promise<void> {
  logger.info('╔══════════════════════════════════════════════╗');
  logger.info('║  CraftOS Server Manager v' + config.version.padEnd(21) + '║');
  logger.info('╚══════════════════════════════════════════════╝');

  // ─── Initialize Database ──────────────────────────────────
  logger.info('Initializing database...');
  initDatabase();

  // ─── Initialize Server Manager ────────────────────────────
  logger.info('Initializing server manager...');
  const serverManager = ServerManager.getInstance();
  await serverManager.initialize();

  // ─── Initialize Services ──────────────────────────────────
  const metricsService = MetricsService.getInstance();
  metricsService.start(15000); // Collect metrics every 15s

  const schedulerService = SchedulerService.getInstance();
  await schedulerService.initialize();

  // ─── Build and Start HTTP Server ──────────────────────────
  const app = await buildApp();

  try {
    await app.listen({ port: config.port, host: config.host });
    logger.info(`Server running at http://${config.host}:${config.port}`);
    logger.info(`Dashboard: http://localhost:${config.port}`);
    logger.info(`API: http://localhost:${config.port}/api`);
    logger.info(`WebSocket: ws://localhost:${config.port}/ws`);
    logger.info(`API Docs: http://localhost:${config.port}/docs`);
  } catch (error) {
    logger.fatal({ error }, 'Failed to start server');
    process.exit(1);
  }

  // ─── Start SFTP Server ────────────────────────────────────
  if (config.sftp.enabled) {
    try {
      const sftpService = SFTPService.getInstance();
      await sftpService.start(config.sftp.port);
      logger.info(`SFTP server running on port ${config.sftp.port}`);
    } catch (error: any) {
      logger.error({ error: error?.message, stack: error?.stack }, 'Failed to start SFTP server');
    }
  }

  // ─── Initialize Discord Bridge ────────────────────────────
  if (config.discord.webhookUrl) {
    const bridge = DiscordBridge.getInstance();
    bridge.setWebhookUrl(config.discord.webhookUrl);
    logger.info('Discord bridge initialized');
  }

  // ─── Graceful Shutdown ────────────────────────────────────
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down gracefully...`);

    try {
      // Stop accepting new connections
      await app.close();

      // Stop services
      metricsService.stop();
      await schedulerService.shutdown();

      // Stop all Minecraft servers
      await serverManager.shutdown();

      // Close database
      closeDatabase();

      logger.info('Shutdown complete');
      process.exit(0);
    } catch (error) {
      logger.error({ error }, 'Error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // Handle uncaught errors
  process.on('uncaughtException', (error) => {
    logger.fatal({ error }, 'Uncaught exception');
    shutdown('uncaughtException');
  });

  process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, 'Unhandled rejection');
  });
}

main().catch((error) => {
  logger.fatal({ error }, 'Failed to start application');
  process.exit(1);
});
