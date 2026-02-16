import { FastifyInstance } from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { config } from '../config';

export async function setupSwagger(app: FastifyInstance): Promise<void> {
  await app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'CraftOS API',
        description: 'CraftOS Minecraft Server Manager — REST API Documentation.\n\n' +
          '## Authentication\n' +
          'Use either **Bearer JWT token** or **API Key** (`X-API-Key` header).\n\n' +
          '## Rate Limiting\n' +
          'Default: 100 requests per minute per IP.\n\n' +
          '## WebSocket\n' +
          'Real-time console output available at `ws://host:port/ws?token=JWT`.',
        version: config.version,
        contact: {
          name: 'CraftOS',
          url: 'https://github.com/craftos',
        },
        license: {
          name: 'MIT',
        },
      },
      servers: [
        { url: 'http://localhost:3001', description: 'Development' },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description: 'JWT access token from /api/auth/login',
          },
          apiKeyAuth: {
            type: 'apiKey',
            in: 'header',
            name: 'X-API-Key',
            description: 'API key generated from Settings → Security',
          },
        },
      },
      security: [{ bearerAuth: [] }, { apiKeyAuth: [] }],
      tags: [
        { name: 'Auth', description: 'Authentication & user management' },
        { name: 'Servers', description: 'Minecraft server CRUD & control' },
        { name: 'Console', description: 'Server console & commands' },
        { name: 'Players', description: 'Player management, bans, whitelist' },
        { name: 'Files', description: 'File manager operations' },
        { name: 'Plugins', description: 'Plugin marketplace & management' },
        { name: 'Backups', description: 'Backup creation & restoration' },
        { name: 'Performance', description: 'Metrics, alerts & monitoring' },
        { name: 'Worlds', description: 'World management & settings' },
        { name: 'Tasks', description: 'Scheduled tasks & automation' },
        { name: 'System', description: 'System settings & administration' },
        { name: 'Templates', description: 'Server templates & cloning' },
        { name: 'Analytics', description: 'Player statistics & analytics' },
        { name: 'Logs', description: 'Log search & analysis' },
      ],
    },
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
      persistAuthorization: true,
      displayRequestDuration: true,
      filter: true,
      syntaxHighlight: { activate: true, theme: 'monokai' },
    },
    uiHooks: {
      onRequest: function (_request: any, _reply: any, next: () => void) { next(); },
      preHandler: function (_request: any, _reply: any, next: () => void) { next(); },
    },
    staticCSP: true,
    transformStaticCSP: (header: string) => header,
  });
}
