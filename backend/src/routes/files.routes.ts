import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { authMiddleware, requireRole } from '../auth/middleware';
import { FileService } from '../services/file.service';
import { ServerManager } from '../services/server-manager';

export async function fileRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  const fileService = FileService.getInstance();

  async function getServerDir(serverId: string): Promise<string> {
    const server = await ServerManager.getInstance().getServer(serverId);
    if (!server) throw new Error('Server not found');
    return server.directory;
  }

  // List directory
  app.get('/api/servers/:id/files', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { path: relativePath } = request.query as { path?: string };

    try {
      const serverDir = await getServerDir(id);
      return fileService.listDirectory(serverDir, relativePath || '');
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to list directory';
      return reply.status(400).send({ error: msg });
    }
  });

  // Read file
  app.get('/api/servers/:id/files/read', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { path: relativePath } = request.query as { path: string };

    if (!relativePath) return reply.status(400).send({ error: 'Path required' });

    try {
      const serverDir = await getServerDir(id);
      return fileService.readFile(serverDir, relativePath);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to read file';
      return reply.status(400).send({ error: msg });
    }
  });

  // Write file
  app.put(
    '/api/servers/:id/files/write',
    { preHandler: requireRole('admin', 'moderator') },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const schema = z.object({
        path: z.string(),
        content: z.string(),
      });

      const parsed = schema.safeParse(request.body);
      if (!parsed.success) return reply.status(400).send({ error: 'Invalid request' });

      try {
        const serverDir = await getServerDir(id);
        fileService.writeFile(serverDir, parsed.data.path, parsed.data.content);
        return { message: 'File saved' };
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to write file';
        return reply.status(400).send({ error: msg });
      }
    }
  );

  // Delete file or directory
  app.delete(
    '/api/servers/:id/files',
    { preHandler: requireRole('admin') },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const { path: relativePath } = request.query as { path: string };

      if (!relativePath) return reply.status(400).send({ error: 'Path required' });

      try {
        const serverDir = await getServerDir(id);
        fileService.deletePath(serverDir, relativePath);
        return { message: 'Deleted' };
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to delete';
        return reply.status(400).send({ error: msg });
      }
    }
  );

  // Create directory
  app.post(
    '/api/servers/:id/files/mkdir',
    { preHandler: requireRole('admin', 'moderator') },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const schema = z.object({ path: z.string() });
      const parsed = schema.safeParse(request.body);
      if (!parsed.success) return reply.status(400).send({ error: 'Invalid request' });

      try {
        const serverDir = await getServerDir(id);
        fileService.createDirectory(serverDir, parsed.data.path);
        return { message: 'Directory created' };
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to create directory';
        return reply.status(400).send({ error: msg });
      }
    }
  );

  // Rename/move
  app.post(
    '/api/servers/:id/files/rename',
    { preHandler: requireRole('admin', 'moderator') },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const schema = z.object({
        oldPath: z.string(),
        newPath: z.string(),
      });
      const parsed = schema.safeParse(request.body);
      if (!parsed.success) return reply.status(400).send({ error: 'Invalid request' });

      try {
        const serverDir = await getServerDir(id);
        fileService.renamePath(serverDir, parsed.data.oldPath, parsed.data.newPath);
        return { message: 'Renamed' };
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to rename';
        return reply.status(400).send({ error: msg });
      }
    }
  );

  // Upload file
  app.post(
    '/api/servers/:id/files/upload',
    { preHandler: requireRole('admin', 'moderator') },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      try {
        const data = await request.file();
        if (!data) return reply.status(400).send({ error: 'No file provided' });

        const uploadPath = (request.query as { path?: string }).path || '';
        const fileName = data.filename;
        const buffer = await data.toBuffer();

        const serverDir = await getServerDir(id);
        const relativePath = uploadPath ? `${uploadPath}/${fileName}` : fileName;

        await fileService.saveUploadedFile(serverDir, relativePath, buffer);
        return { message: 'File uploaded', path: relativePath };
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Upload failed';
        return reply.status(400).send({ error: msg });
      }
    }
  );

  // Download file
  app.get(
    '/api/servers/:id/files/download',
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const { path: relativePath } = request.query as { path: string };

      if (!relativePath) return reply.status(400).send({ error: 'Path required' });

      try {
        const serverDir = await getServerDir(id);
        const filePath = fileService.getFilePath(serverDir, relativePath);
        return reply.sendFile(filePath);
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Download failed';
        return reply.status(400).send({ error: msg });
      }
    }
  );
}
