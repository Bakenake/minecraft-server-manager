import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import websocket from '@fastify/websocket';
import path from 'path';
import fs from 'fs';

import { config } from './config';
import { createChildLogger } from './utils/logger';
import { setupSwagger } from './plugins/swagger';

// Routes
import { authRoutes } from './routes/auth.routes';
import { serverRoutes } from './routes/server.routes';
import { playerRoutes } from './routes/player.routes';
import { backupRoutes } from './routes/backup.routes';
import { fileRoutes } from './routes/files.routes';
import { pluginRoutes } from './routes/plugins.routes';
import { systemRoutes } from './routes/system.routes';
import { worldRoutes } from './routes/world.routes';
import { templateRoutes } from './routes/template.routes';
import { advancedRoutes } from './routes/advanced.routes';
import { registerPermissionRoutes } from './routes/permissions.routes';
import { setupWebSocket } from './ws';

const log = createChildLogger('app');

export async function buildApp() {
  const app = Fastify({
    logger: false, // We use our own pino logger
    maxParamLength: 512,
    bodyLimit: 50 * 1024 * 1024, // 50MB for file uploads
  });

  // ─── Security Plugins ─────────────────────────────────────
  await app.register(helmet, {
    contentSecurityPolicy: config.isDev ? false : undefined,
    crossOriginEmbedderPolicy: false,
  });

  await app.register(cors, {
    origin: config.isDev ? true : ['http://localhost:3000', 'http://localhost:3001'],
    credentials: true,
  });

  await app.register(rateLimit, {
    max: config.rateLimit.max,
    timeWindow: config.rateLimit.timeWindow,
  });

  // ─── Multipart (file uploads) ─────────────────────────────
  await app.register(multipart, {
    limits: {
      fileSize: 500 * 1024 * 1024, // 500MB for server JARs
      files: 10,
    },
  });

  // ─── WebSocket ────────────────────────────────────────────
  await app.register(websocket, {
    options: {
      maxPayload: 1048576, // 1MB
    },
  });

  // ─── Static file serving (frontend in production) ─────────
  const frontendPath = path.join(__dirname, '..', '..', 'frontend', 'dist');
  if (fs.existsSync(frontendPath)) {
    await app.register(fastifyStatic, {
      root: frontendPath,
      prefix: '/',
      decorateReply: true,
    });
  }

  // ─── Swagger / API Docs ───────────────────────────────────
  await setupSwagger(app);

  // ─── API Routes ──────────────────────────────────────────
  await app.register(authRoutes);
  await app.register(serverRoutes);
  await app.register(playerRoutes);
  await app.register(backupRoutes);
  await app.register(fileRoutes);
  await app.register(pluginRoutes);
  await app.register(systemRoutes);
  await app.register(worldRoutes);
  await app.register(templateRoutes);
  await app.register(advancedRoutes);
  registerPermissionRoutes(app);

  // ─── WebSocket Routes ────────────────────────────────────
  await setupWebSocket(app);

  // ─── SPA Fallback ─────────────────────────────────────────
  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith('/api/') || request.url.startsWith('/ws')) {
      return reply.status(404).send({ error: 'Not found' });
    }

    // Serve index.html for SPA routing
    const indexPath = path.join(frontendPath, 'index.html');
    if (fs.existsSync(indexPath)) {
      return reply.sendFile('index.html');
    }

    return reply.status(404).send({ error: 'Not found' });
  });

  // ─── Global Error Handler ────────────────────────────────
  app.setErrorHandler((error: Error & { statusCode?: number }, request, reply) => {
    log.error({
      error: error.message,
      stack: error.stack,
      url: request.url,
      method: request.method,
    }, 'Unhandled error');

    const statusCode = error.statusCode ?? 500;
    return reply.status(statusCode).send({
      error: config.isDev ? error.message : 'Internal server error',
      ...(config.isDev && { stack: error.stack }),
    });
  });

  // ─── Health Check ────────────────────────────────────────
  app.get('/api/health', async () => ({
    status: 'ok',
    version: config.version,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  }));

  return app;
}
