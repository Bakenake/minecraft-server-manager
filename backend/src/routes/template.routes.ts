import { FastifyInstance } from 'fastify';
import { authMiddleware, requireRole } from '../auth/middleware';
import { ServerManager } from '../services/server-manager';
import { getDb } from '../db';
import { servers } from '../db/schema';
import { eq } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import path from 'path';
import fs from 'fs';
import { createChildLogger } from '../utils/logger';
import { audit } from '../services/audit.service';

const log = createChildLogger('template-routes');

// ─── Server Templates ──────────────────────────────────────────────
// Templates are stored as JSON files in data/templates/

interface ServerTemplate {
  id: string;
  name: string;
  description: string;
  type: string;
  version: string;
  minRam: number;
  maxRam: number;
  port: number;
  jvmFlags: string;
  javaPath: string;
  autoStart: boolean;
  autoRestart: boolean;
  maxPlayers: number;
  serverProperties: Record<string, string>;
  createdAt: string;
  createdBy: string;
}

function getTemplatesDir(): string {
  const dir = path.resolve('./data/templates');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function loadTemplates(): ServerTemplate[] {
  const dir = getTemplatesDir();
  try {
    return fs.readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => {
        try {
          return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8'));
        } catch {
          return null;
        }
      })
      .filter(Boolean) as ServerTemplate[];
  } catch {
    return [];
  }
}

function saveTemplate(template: ServerTemplate): void {
  const dir = getTemplatesDir();
  fs.writeFileSync(
    path.join(dir, `${template.id}.json`),
    JSON.stringify(template, null, 2),
    'utf-8'
  );
}

function deleteTemplateFile(id: string): boolean {
  const filePath = path.join(getTemplatesDir(), `${id}.json`);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    return true;
  }
  return false;
}

export async function templateRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // ─── List templates ───────────────────────────────────────
  app.get('/api/templates', async () => {
    return loadTemplates().map(({ serverProperties, ...rest }) => rest);
  });

  // ─── Get a template ───────────────────────────────────────
  app.get('/api/templates/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const templates = loadTemplates();
    const template = templates.find((t) => t.id === id);
    if (!template) return reply.status(404).send({ error: 'Template not found' });
    return template;
  });

  // ─── Create template from existing server ─────────────────
  app.post('/api/templates', {
    preHandler: requireRole('admin', 'moderator'),
  }, async (request, reply) => {
    const { serverId, name, description } = request.body as {
      serverId: string;
      name: string;
      description?: string;
    };

    if (!serverId || !name) {
      return reply.status(400).send({ error: 'serverId and name are required' });
    }

    const db = getDb();
    const dbServers = await db.select().from(servers).where(eq(servers.id, serverId));
    const server = dbServers[0];
    if (!server) return reply.status(404).send({ error: 'Server not found' });

    // Read server.properties
    let serverProperties: Record<string, string> = {};
    const propsPath = path.join(server.directory, 'server.properties');
    if (fs.existsSync(propsPath)) {
      const content = fs.readFileSync(propsPath, 'utf-8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const eqIdx = trimmed.indexOf('=');
          if (eqIdx > 0) {
            serverProperties[trimmed.substring(0, eqIdx)] = trimmed.substring(eqIdx + 1);
          }
        }
      }
    }

    const template: ServerTemplate = {
      id: uuid(),
      name,
      description: description || '',
      type: server.type,
      version: server.version,
      minRam: server.minRam,
      maxRam: server.maxRam,
      port: server.port,
      jvmFlags: server.jvmFlags || '',
      javaPath: server.javaPath,
      autoStart: server.autoStart,
      autoRestart: server.autoRestart,
      maxPlayers: server.maxPlayers,
      serverProperties,
      createdAt: new Date().toISOString(),
      createdBy: (request as any).user?.username || 'unknown',
    };

    saveTemplate(template);

    audit({
      userId: (request as any).user?.id,
      action: 'create',
      resource: 'template',
      resourceId: template.id,
      details: { name: template.name, sourceServer: serverId },
      ipAddress: request.ip,
    });

    log.info({ templateId: template.id, name: template.name }, 'Template created');
    return template;
  });

  // ─── Deploy server from template ──────────────────────────
  app.post('/api/templates/:id/deploy', {
    preHandler: requireRole('admin'),
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { serverName, port } = request.body as { serverName: string; port?: number };

    const templates = loadTemplates();
    const template = templates.find((t) => t.id === id);
    if (!template) return reply.status(404).send({ error: 'Template not found' });

    if (!serverName) {
      return reply.status(400).send({ error: 'serverName is required' });
    }

    try {
      const manager = ServerManager.getInstance();
      const server = await manager.createServer({
        name: serverName,
        type: template.type as any,
        version: template.version,
        jarFile: `${template.type}-${template.version}.jar`,
        minRam: template.minRam,
        maxRam: template.maxRam,
        port: port || template.port,
        autoStart: template.autoStart,
        autoRestart: template.autoRestart,
        javaPath: template.javaPath,
      });

      // Apply server.properties from template
      if (Object.keys(template.serverProperties).length > 0) {
        const propsPath = path.join(server.directory, 'server.properties');
        const lines: string[] = [];
        for (const [key, value] of Object.entries(template.serverProperties)) {
          // Override port with the new port
          if (key === 'server-port') {
            lines.push(`server-port=${port || template.port}`);
          } else {
            lines.push(`${key}=${value}`);
          }
        }
        fs.writeFileSync(propsPath, lines.join('\n') + '\n', 'utf-8');
      }

      // Apply JVM flags
      if (template.jvmFlags) {
        const db = getDb();
        await db.update(servers)
          .set({ jvmFlags: template.jvmFlags })
          .where(eq(servers.id, server.id));
      }

      audit({
        userId: (request as any).user?.id,
        action: 'create',
        resource: 'server',
        resourceId: server.id,
        details: { templateId: id, templateName: template.name },
        ipAddress: request.ip,
      });

      return { success: true, server };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // ─── Delete template ──────────────────────────────────────
  app.delete('/api/templates/:id', {
    preHandler: requireRole('admin'),
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    if (!deleteTemplateFile(id)) {
      return reply.status(404).send({ error: 'Template not found' });
    }

    audit({
      userId: (request as any).user?.id,
      action: 'delete',
      resource: 'template',
      resourceId: id,
      ipAddress: request.ip,
    });

    return { success: true };
  });
}
