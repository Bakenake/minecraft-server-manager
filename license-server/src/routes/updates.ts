/**
 * App Updates Routes
 *
 * Admin endpoints (requires auth):
 *   POST   /admin/updates/upload   — Upload update files (latest.yml, .exe)
 *   GET    /admin/updates          — List uploaded update files
 *   DELETE /admin/updates/:filename — Delete an update file
 *
 * Public endpoints (called by desktop app auto-updater):
 *   GET    /updates/:filename      — Download an update file
 */

import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'change-me';

// ─── Updates directory ──────────────────────────────────────

const UPDATES_DIR = path.resolve(process.env.UPDATES_DIR || './data/updates');

// Ensure updates dir exists
if (!fs.existsSync(UPDATES_DIR)) {
  fs.mkdirSync(UPDATES_DIR, { recursive: true });
}

// ─── Multer config ──────────────────────────────────────────

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPDATES_DIR),
  filename: (_req, file, cb) => cb(null, file.originalname),
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB max
  fileFilter: (_req, file, cb) => {
    const allowed = ['.yml', '.yaml', '.exe', '.dmg', '.AppImage', '.deb', '.rpm', '.zip', '.blockmap'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext) || file.originalname === 'latest.yml' || file.originalname.endsWith('.yml')) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${ext} not allowed. Allowed: ${allowed.join(', ')}`));
    }
  },
});

// ─── Auth Middleware ────────────────────────────────────────

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  try {
    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; role: string };
    (req as any).admin = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ─── Admin Router (mounted at /admin/updates) ───────────────

export const adminUpdatesRouter = Router();
adminUpdatesRouter.use(requireAdmin);

// Upload update files (supports multiple files at once)
adminUpdatesRouter.post('/upload', upload.array('files', 10), (req: Request, res: Response): void => {
  const files = req.files as Express.Multer.File[];

  if (!files || files.length === 0) {
    res.status(400).json({ error: 'No files uploaded' });
    return;
  }

  const uploaded = files.map(f => ({
    filename: f.originalname,
    size: f.size,
    path: `/updates/${f.originalname}`,
  }));

  console.log(`[updates] Uploaded ${files.length} file(s): ${files.map(f => f.originalname).join(', ')}`);

  res.json({
    message: `Uploaded ${files.length} file(s)`,
    files: uploaded,
  });
});

// List all files in updates directory
adminUpdatesRouter.get('/', (_req: Request, res: Response): void => {
  try {
    const files = fs.readdirSync(UPDATES_DIR).map(filename => {
      const filePath = path.join(UPDATES_DIR, filename);
      const stat = fs.statSync(filePath);
      return {
        filename,
        size: stat.size,
        modified: stat.mtime.toISOString(),
        url: `/updates/${filename}`,
      };
    });

    // Sort by modified date, newest first
    files.sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime());

    res.json({ files });
  } catch (err) {
    res.json({ files: [] });
  }
});

// Delete an update file
adminUpdatesRouter.delete('/:filename', (req: Request, res: Response): void => {
  const filename = req.params.filename as string;
  // Prevent path traversal
  const safeName = path.basename(filename);
  const filePath = path.join(UPDATES_DIR, safeName);

  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'File not found' });
    return;
  }

  try {
    fs.unlinkSync(filePath);
    console.log(`[updates] Deleted ${safeName}`);
    res.json({ message: `Deleted ${safeName}` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

// ─── Public Router (mounted at /updates) ────────────────────

export const publicUpdatesRouter = Router();

// Serve update files (no auth needed — desktop app auto-updater calls this)
publicUpdatesRouter.get('/:filename', (req: Request, res: Response): void => {
  const filename = req.params.filename as string;
  // Prevent path traversal attacks
  const safeName = path.basename(filename);
  const filePath = path.join(UPDATES_DIR, safeName);

  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'File not found' });
    return;
  }

  // Set appropriate content type
  const ext = path.extname(safeName).toLowerCase();
  const contentTypes: Record<string, string> = {
    '.yml': 'text/yaml',
    '.yaml': 'text/yaml',
    '.exe': 'application/octet-stream',
    '.dmg': 'application/octet-stream',
    '.zip': 'application/zip',
    '.blockmap': 'application/octet-stream',
    '.AppImage': 'application/octet-stream',
    '.deb': 'application/octet-stream',
    '.rpm': 'application/octet-stream',
  };

  res.setHeader('Content-Type', contentTypes[ext] || 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);

  const stream = fs.createReadStream(filePath);
  stream.pipe(res);
});
