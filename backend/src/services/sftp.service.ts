import { Server, utils, Connection, AuthContext, Session, SFTPWrapper } from 'ssh2';
import { createChildLogger } from '../utils/logger';
import { config } from '../config';
import { getDb } from '../db';
import { users, servers } from '../db/schema';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

const log = createChildLogger('sftp');

// SSH2 SFTP status codes
const STATUS_CODE = {
  OK: 0,
  EOF: 1,
  NO_SUCH_FILE: 2,
  PERMISSION_DENIED: 3,
  FAILURE: 4,
  OP_UNSUPPORTED: 8,
};

// SSH2 open flags
const OPEN_MODE = {
  READ: 0x00000001,
  WRITE: 0x00000002,
  APPEND: 0x00000004,
  CREAT: 0x00000008,
  TRUNC: 0x00000010,
  EXCL: 0x00000020,
};

interface AuthenticatedUser {
  id: string;
  username: string;
  role: string;
}

interface OpenHandle {
  path: string;
  fd?: number;
  isDir?: boolean;
  dirEntries?: fs.Dirent[];
  dirOffset?: number;
}

export class SFTPService {
  private static instance: SFTPService;
  private server: Server | null = null;
  private hostKeyPath: string;
  private handleCounter = 0;

  static getInstance(): SFTPService {
    if (!SFTPService.instance) {
      SFTPService.instance = new SFTPService();
    }
    return SFTPService.instance;
  }

  constructor() {
    this.hostKeyPath = path.join(config.paths.data, 'ssh_host_key');
  }

  private ensureHostKey(): Buffer {
    if (fs.existsSync(this.hostKeyPath)) {
      return fs.readFileSync(this.hostKeyPath);
    }
    // Generate a new RSA key pair in OpenSSH format for ssh2 compatibility
    const { privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
    });
    fs.mkdirSync(path.dirname(this.hostKeyPath), { recursive: true });
    fs.writeFileSync(this.hostKeyPath, privateKey, { mode: 0o600 });
    log.info('Generated new SSH host key');
    return Buffer.from(privateKey);
  }

  /**
   * Resolve the virtual SFTP path to a real filesystem path.
   * Virtual layout:
   *   / → list of servers
   *   /serverName/ → server directory
   */
  private async resolveVirtualPath(
    virtualPath: string,
    authenticatedUser: AuthenticatedUser
  ): Promise<{ realPath: string; serverName?: string } | null> {
    const normalised = path.posix.normalize(virtualPath).replace(/\\/g, '/');
    const parts = normalised.split('/').filter(Boolean);

    if (parts.length === 0) {
      // Root — virtual directory listing servers
      return { realPath: '__VIRTUAL_ROOT__' };
    }

    const serverName = parts[0];
    const db = getDb();
    const allServers = await db.select().from(servers);
    const matchedServer = allServers.find(
      (s) => s.name.toLowerCase() === serverName.toLowerCase()
    );

    if (!matchedServer) return null;

    // Viewers cannot write but can browse
    const remainingPath = parts.slice(1).join('/');
    const realPath = path.join(matchedServer.directory, remainingPath);

    // Prevent path traversal
    const resolvedReal = path.resolve(realPath);
    const serverRoot = path.resolve(matchedServer.directory);
    if (!resolvedReal.startsWith(serverRoot)) return null;

    return { realPath: resolvedReal, serverName: matchedServer.name };
  }

  async start(port = 2022): Promise<void> {
    let hostKey: Buffer;
    try {
      hostKey = this.ensureHostKey();
    } catch (err: any) {
      log.error({ error: err.message, stack: err.stack }, 'Failed to generate/load SSH host key');
      throw err;
    }

    this.server = new Server(
      { hostKeys: [hostKey] },
      (client: Connection) => {
        let authenticatedUser: AuthenticatedUser | null = null;

        client.on('authentication', (ctx: AuthContext) => {
          if (ctx.method === 'password') {
            this.authenticateUser(ctx.username, ctx.password!)
              .then((user) => {
                if (user) {
                  authenticatedUser = user;
                  ctx.accept();
                } else {
                  ctx.reject(['password']);
                }
              })
              .catch(() => ctx.reject(['password']));
          } else {
            ctx.reject(['password']);
          }
        });

        client.on('ready', () => {
          log.info({ user: authenticatedUser?.username }, 'SFTP client connected');

          client.on('session', (accept: () => Session) => {
            const session = accept();
            session.on('sftp', (accept: () => SFTPWrapper) => {
              const sftp = accept();
              this.handleSFTPSession(sftp, authenticatedUser!);
            });
          });
        });

        client.on('error', (err: Error) => {
          log.debug({ error: err.message }, 'SFTP client error');
        });

        client.on('end', () => {
          log.debug({ user: authenticatedUser?.username }, 'SFTP client disconnected');
        });
      }
    );

    this.server.on('error', (err: Error) => {
      log.error({ error: err.message, stack: (err as any).stack }, 'SFTP server error');
    });

    return new Promise<void>((resolve, reject) => {
      this.server!.listen(port, '0.0.0.0', () => {
        log.info({ port }, 'SFTP server started');
        resolve();
      });
      this.server!.on('error', (err: Error) => {
        reject(err);
      });
    });
  }

  stop(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
      log.info('SFTP server stopped');
    }
  }

  private async authenticateUser(
    username: string,
    password: string
  ): Promise<AuthenticatedUser | null> {
    try {
      const db = getDb();
      const result = await db
        .select()
        .from(users)
        .where(eq(users.username, username));
      const user = result[0];
      if (!user || !user.isActive) return null;

      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) return null;

      return { id: user.id, username: user.username, role: user.role };
    } catch {
      return null;
    }
  }

  private handleSFTPSession(sftp: SFTPWrapper, user: AuthenticatedUser): void {
    const handles = new Map<number, OpenHandle>();
    const nextHandle = (): Buffer => {
      const id = this.handleCounter++;
      const buf = Buffer.alloc(4);
      buf.writeUInt32BE(id, 0);
      return buf;
    };
    const getHandleId = (buf: Buffer): number => buf.readUInt32BE(0);
    const canWrite = user.role !== 'viewer';

    // OPEN FILE
    sftp.on('OPEN', async (reqid: number, filename: string, flags: number) => {
      const resolved = await this.resolveVirtualPath(filename, user);
      if (!resolved || resolved.realPath === '__VIRTUAL_ROOT__') {
        return sftp.status(reqid, STATUS_CODE.NO_SUCH_FILE);
      }

      // Check write permission
      const isWrite = (flags & (OPEN_MODE.WRITE | OPEN_MODE.CREAT | OPEN_MODE.APPEND | OPEN_MODE.TRUNC)) !== 0;
      if (isWrite && !canWrite) {
        return sftp.status(reqid, STATUS_CODE.PERMISSION_DENIED);
      }

      try {
        let nodeFlags = 'r';
        if (flags & OPEN_MODE.WRITE) {
          nodeFlags = flags & OPEN_MODE.APPEND ? 'a' : 'w';
          if (flags & OPEN_MODE.READ) nodeFlags += '+';
        }
        if ((flags & OPEN_MODE.CREAT) && !(flags & OPEN_MODE.WRITE)) {
          nodeFlags = 'w+';
        }

        const fd = fs.openSync(resolved.realPath, nodeFlags);
        const handle = nextHandle();
        const id = getHandleId(handle);
        handles.set(id, { path: resolved.realPath, fd });
        sftp.handle(reqid, handle);
      } catch (err) {
        sftp.status(reqid, STATUS_CODE.FAILURE);
      }
    });

    // READ
    sftp.on('READ', (reqid: number, handle: Buffer, offset: number, length: number) => {
      const h = handles.get(getHandleId(handle));
      if (!h || h.fd === undefined) return sftp.status(reqid, STATUS_CODE.FAILURE);

      const buf = Buffer.alloc(length);
      try {
        const bytesRead = fs.readSync(h.fd, buf, 0, length, offset);
        if (bytesRead === 0) {
          sftp.status(reqid, STATUS_CODE.EOF);
        } else {
          sftp.data(reqid, buf.slice(0, bytesRead));
        }
      } catch {
        sftp.status(reqid, STATUS_CODE.FAILURE);
      }
    });

    // WRITE
    sftp.on('WRITE', (reqid: number, handle: Buffer, offset: number, data: Buffer) => {
      if (!canWrite) return sftp.status(reqid, STATUS_CODE.PERMISSION_DENIED);

      const h = handles.get(getHandleId(handle));
      if (!h || h.fd === undefined) return sftp.status(reqid, STATUS_CODE.FAILURE);

      try {
        fs.writeSync(h.fd, data, 0, data.length, offset);
        sftp.status(reqid, STATUS_CODE.OK);
      } catch {
        sftp.status(reqid, STATUS_CODE.FAILURE);
      }
    });

    // CLOSE
    sftp.on('CLOSE', (reqid: number, handle: Buffer) => {
      const id = getHandleId(handle);
      const h = handles.get(id);
      if (h?.fd !== undefined) {
        try { fs.closeSync(h.fd); } catch {}
      }
      handles.delete(id);
      sftp.status(reqid, STATUS_CODE.OK);
    });

    // STAT / LSTAT
    const handleStat = async (reqid: number, filePath: string) => {
      const resolved = await this.resolveVirtualPath(filePath, user);
      if (!resolved) return sftp.status(reqid, STATUS_CODE.NO_SUCH_FILE);

      if (resolved.realPath === '__VIRTUAL_ROOT__') {
        // Virtual root directory
        const now = new Date();
        return sftp.attrs(reqid, {
          mode: fs.constants.S_IFDIR | 0o755,
          uid: 0,
          gid: 0,
          size: 0,
          atime: Math.floor(now.getTime() / 1000),
          mtime: Math.floor(now.getTime() / 1000),
        } as any);
      }

      try {
        const stats = fs.statSync(resolved.realPath);
        sftp.attrs(reqid, {
          mode: stats.mode,
          uid: stats.uid,
          gid: stats.gid,
          size: stats.size,
          atime: Math.floor(stats.atimeMs / 1000),
          mtime: Math.floor(stats.mtimeMs / 1000),
        } as any);
      } catch {
        sftp.status(reqid, STATUS_CODE.NO_SUCH_FILE);
      }
    };

    sftp.on('STAT', (reqid: number, p: string) => handleStat(reqid, p));
    sftp.on('LSTAT', (reqid: number, p: string) => handleStat(reqid, p));

    // FSTAT
    sftp.on('FSTAT', (reqid: number, handle: Buffer) => {
      const h = handles.get(getHandleId(handle));
      if (!h || h.fd === undefined) return sftp.status(reqid, STATUS_CODE.FAILURE);

      try {
        const stats = fs.fstatSync(h.fd);
        sftp.attrs(reqid, {
          mode: stats.mode,
          uid: stats.uid,
          gid: stats.gid,
          size: stats.size,
          atime: Math.floor(stats.atimeMs / 1000),
          mtime: Math.floor(stats.mtimeMs / 1000),
        } as any);
      } catch {
        sftp.status(reqid, STATUS_CODE.FAILURE);
      }
    });

    // OPENDIR
    sftp.on('OPENDIR', async (reqid: number, dirPath: string) => {
      const resolved = await this.resolveVirtualPath(dirPath, user);
      if (!resolved) return sftp.status(reqid, STATUS_CODE.NO_SUCH_FILE);

      if (resolved.realPath === '__VIRTUAL_ROOT__') {
        // Virtual root — list servers
        const db = getDb();
        const allServers = await db.select().from(servers);
        const handle = nextHandle();
        const id = getHandleId(handle);
        handles.set(id, {
          path: '__VIRTUAL_ROOT__',
          isDir: true,
          dirEntries: allServers.map((s) => ({
            name: s.name,
            isFile: () => false,
            isDirectory: () => true,
            isBlockDevice: () => false,
            isCharacterDevice: () => false,
            isFIFO: () => false,
            isSocket: () => false,
            isSymbolicLink: () => false,
            path: '',
            parentPath: '',
          } as fs.Dirent)),
          dirOffset: 0,
        });
        return sftp.handle(reqid, handle);
      }

      try {
        const entries = fs.readdirSync(resolved.realPath, { withFileTypes: true });
        const handle = nextHandle();
        const id = getHandleId(handle);
        handles.set(id, {
          path: resolved.realPath,
          isDir: true,
          dirEntries: entries,
          dirOffset: 0,
        });
        sftp.handle(reqid, handle);
      } catch {
        sftp.status(reqid, STATUS_CODE.NO_SUCH_FILE);
      }
    });

    // READDIR
    sftp.on('READDIR', (reqid: number, handle: Buffer) => {
      const h = handles.get(getHandleId(handle));
      if (!h || !h.isDir || !h.dirEntries) return sftp.status(reqid, STATUS_CODE.FAILURE);

      if (h.dirOffset! >= h.dirEntries.length) {
        return sftp.status(reqid, STATUS_CODE.EOF);
      }

      // Send in batches of 32
      const batch = h.dirEntries.slice(h.dirOffset!, h.dirOffset! + 32);
      h.dirOffset! += batch.length;

      const names = batch.map((entry) => {
        const isVirtualRoot = h.path === '__VIRTUAL_ROOT__';
        let stats: any;
        if (isVirtualRoot) {
          const now = Math.floor(Date.now() / 1000);
          stats = {
            mode: fs.constants.S_IFDIR | 0o755,
            uid: 0, gid: 0, size: 0,
            atime: now, mtime: now,
          };
        } else {
          try {
            const s = fs.statSync(path.join(h.path, entry.name));
            stats = {
              mode: s.mode, uid: s.uid, gid: s.gid, size: s.size,
              atime: Math.floor(s.atimeMs / 1000),
              mtime: Math.floor(s.mtimeMs / 1000),
            };
          } catch {
            const now = Math.floor(Date.now() / 1000);
            stats = { mode: 0o644, uid: 0, gid: 0, size: 0, atime: now, mtime: now };
          }
        }

        return {
          filename: entry.name,
          longname: `${entry.isDirectory() ? 'd' : '-'}rwxr-xr-x 1 user user ${stats.size || 0} Jan 1 00:00 ${entry.name}`,
          attrs: stats,
        };
      });

      sftp.name(reqid, names);
    });

    // MKDIR
    sftp.on('MKDIR', async (reqid: number, dirPath: string) => {
      if (!canWrite) return sftp.status(reqid, STATUS_CODE.PERMISSION_DENIED);

      const resolved = await this.resolveVirtualPath(dirPath, user);
      if (!resolved || resolved.realPath === '__VIRTUAL_ROOT__') {
        return sftp.status(reqid, STATUS_CODE.PERMISSION_DENIED);
      }

      try {
        fs.mkdirSync(resolved.realPath, { recursive: true });
        sftp.status(reqid, STATUS_CODE.OK);
      } catch {
        sftp.status(reqid, STATUS_CODE.FAILURE);
      }
    });

    // RMDIR
    sftp.on('RMDIR', async (reqid: number, dirPath: string) => {
      if (!canWrite) return sftp.status(reqid, STATUS_CODE.PERMISSION_DENIED);

      const resolved = await this.resolveVirtualPath(dirPath, user);
      if (!resolved || resolved.realPath === '__VIRTUAL_ROOT__') {
        return sftp.status(reqid, STATUS_CODE.PERMISSION_DENIED);
      }

      try {
        fs.rmdirSync(resolved.realPath);
        sftp.status(reqid, STATUS_CODE.OK);
      } catch {
        sftp.status(reqid, STATUS_CODE.FAILURE);
      }
    });

    // REMOVE (delete file)
    sftp.on('REMOVE', async (reqid: number, filePath: string) => {
      if (!canWrite) return sftp.status(reqid, STATUS_CODE.PERMISSION_DENIED);

      const resolved = await this.resolveVirtualPath(filePath, user);
      if (!resolved || resolved.realPath === '__VIRTUAL_ROOT__') {
        return sftp.status(reqid, STATUS_CODE.PERMISSION_DENIED);
      }

      try {
        fs.unlinkSync(resolved.realPath);
        sftp.status(reqid, STATUS_CODE.OK);
      } catch {
        sftp.status(reqid, STATUS_CODE.FAILURE);
      }
    });

    // RENAME
    sftp.on('RENAME', async (reqid: number, oldPath: string, newPath: string) => {
      if (!canWrite) return sftp.status(reqid, STATUS_CODE.PERMISSION_DENIED);

      const resolvedOld = await this.resolveVirtualPath(oldPath, user);
      const resolvedNew = await this.resolveVirtualPath(newPath, user);
      if (!resolvedOld || !resolvedNew) return sftp.status(reqid, STATUS_CODE.NO_SUCH_FILE);
      if (resolvedOld.realPath === '__VIRTUAL_ROOT__' || resolvedNew.realPath === '__VIRTUAL_ROOT__') {
        return sftp.status(reqid, STATUS_CODE.PERMISSION_DENIED);
      }

      try {
        fs.renameSync(resolvedOld.realPath, resolvedNew.realPath);
        sftp.status(reqid, STATUS_CODE.OK);
      } catch {
        sftp.status(reqid, STATUS_CODE.FAILURE);
      }
    });

    // SETSTAT
    sftp.on('SETSTAT', async (reqid: number) => {
      sftp.status(reqid, canWrite ? STATUS_CODE.OK : STATUS_CODE.PERMISSION_DENIED);
    });

    // FSETSTAT
    sftp.on('FSETSTAT', (reqid: number) => {
      sftp.status(reqid, canWrite ? STATUS_CODE.OK : STATUS_CODE.PERMISSION_DENIED);
    });

    // REALPATH
    sftp.on('REALPATH', async (reqid: number, reqPath: string) => {
      const normalised = path.posix.normalize(reqPath || '/').replace(/\\/g, '/');
      sftp.name(reqid, [{
        filename: normalised,
        longname: normalised,
        attrs: {
          mode: fs.constants.S_IFDIR | 0o755,
          uid: 0, gid: 0, size: 0,
          atime: Math.floor(Date.now() / 1000),
          mtime: Math.floor(Date.now() / 1000),
        } as any,
      }]);
    });
  }
}
