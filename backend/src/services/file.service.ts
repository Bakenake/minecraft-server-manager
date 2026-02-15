import fs from 'fs';
import path from 'path';
import { createChildLogger } from '../utils/logger';

const log = createChildLogger('file-service');

export interface FileEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size: number;
  modified: Date;
  permissions?: string;
}

// Files that can be edited in browser
const EDITABLE_EXTENSIONS = new Set([
  '.yml', '.yaml', '.json', '.properties', '.conf', '.cfg',
  '.txt', '.log', '.md', '.toml', '.ini', '.xml', '.html',
  '.css', '.js', '.sh', '.bat', '.cmd', '.mcmeta',
]);

// Files/dirs that should never be exposed
const BLOCKED_PATHS = new Set([
  '..', '.git', '.env',
]);

export class FileService {
  private static instance: FileService;

  static getInstance(): FileService {
    if (!FileService.instance) {
      FileService.instance = new FileService();
    }
    return FileService.instance;
  }

  /**
   * Validate and resolve a path within the server directory (sandboxing)
   */
  private resolveSafePath(serverDir: string, relativePath: string): string {
    const resolved = path.resolve(serverDir, relativePath);
    if (!resolved.startsWith(path.resolve(serverDir))) {
      throw new Error('Access denied: path traversal detected');
    }

    // Check for blocked paths
    const parts = relativePath.split(path.sep);
    for (const part of parts) {
      if (BLOCKED_PATHS.has(part)) {
        throw new Error(`Access denied: ${part}`);
      }
    }

    return resolved;
  }

  /**
   * List contents of a directory within a server
   */
  listDirectory(serverDir: string, relativePath: string = ''): FileEntry[] {
    const dirPath = this.resolveSafePath(serverDir, relativePath);

    if (!fs.existsSync(dirPath)) {
      throw new Error('Directory not found');
    }

    const stat = fs.statSync(dirPath);
    if (!stat.isDirectory()) {
      throw new Error('Path is not a directory');
    }

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const result: FileEntry[] = [];

    for (const entry of entries) {
      // Skip hidden and blocked files
      if (entry.name.startsWith('.') && entry.name !== '..' && BLOCKED_PATHS.has(entry.name)) {
        continue;
      }

      const fullPath = path.join(dirPath, entry.name);
      try {
        const entryStat = fs.statSync(fullPath);
        result.push({
          name: entry.name,
          path: path.join(relativePath, entry.name).replace(/\\/g, '/'),
          type: entry.isDirectory() ? 'directory' : 'file',
          size: entryStat.size,
          modified: entryStat.mtime,
        });
      } catch {
        // Skip files we can't stat
      }
    }

    // Sort: directories first, then alphabetically
    result.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return result;
  }

  /**
   * Read a file's contents
   */
  readFile(serverDir: string, relativePath: string): { content: string; encoding: string } {
    const filePath = this.resolveSafePath(serverDir, relativePath);

    if (!fs.existsSync(filePath)) {
      throw new Error('File not found');
    }

    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      throw new Error('Path is a directory, not a file');
    }

    // Limit file size to 5MB
    if (stat.size > 5 * 1024 * 1024) {
      throw new Error('File too large to read (max 5MB)');
    }

    const ext = path.extname(filePath).toLowerCase();
    if (!EDITABLE_EXTENSIONS.has(ext)) {
      throw new Error(`File type ${ext} is not editable`);
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    return { content, encoding: 'utf-8' };
  }

  /**
   * Write content to a file
   */
  writeFile(serverDir: string, relativePath: string, content: string): void {
    const filePath = this.resolveSafePath(serverDir, relativePath);

    const ext = path.extname(filePath).toLowerCase();
    if (!EDITABLE_EXTENSIONS.has(ext)) {
      throw new Error(`File type ${ext} is not editable`);
    }

    // Create parent directory if needed
    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true });

    fs.writeFileSync(filePath, content, 'utf-8');
    log.info({ filePath: relativePath }, 'File written');
  }

  /**
   * Delete a file or directory
   */
  deletePath(serverDir: string, relativePath: string): void {
    const filePath = this.resolveSafePath(serverDir, relativePath);

    if (!fs.existsSync(filePath)) {
      throw new Error('Path not found');
    }

    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      fs.rmSync(filePath, { recursive: true, force: true });
    } else {
      fs.unlinkSync(filePath);
    }

    log.info({ path: relativePath }, 'Path deleted');
  }

  /**
   * Create a directory
   */
  createDirectory(serverDir: string, relativePath: string): void {
    const dirPath = this.resolveSafePath(serverDir, relativePath);
    fs.mkdirSync(dirPath, { recursive: true });
    log.info({ path: relativePath }, 'Directory created');
  }

  /**
   * Rename/move a file or directory
   */
  renamePath(serverDir: string, oldPath: string, newPath: string): void {
    const resolvedOld = this.resolveSafePath(serverDir, oldPath);
    const resolvedNew = this.resolveSafePath(serverDir, newPath);

    if (!fs.existsSync(resolvedOld)) {
      throw new Error('Source path not found');
    }

    fs.renameSync(resolvedOld, resolvedNew);
    log.info({ from: oldPath, to: newPath }, 'Path renamed');
  }

  /**
   * Save an uploaded file
   */
  async saveUploadedFile(serverDir: string, relativePath: string, fileBuffer: Buffer): Promise<void> {
    const filePath = this.resolveSafePath(serverDir, relativePath);
    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, fileBuffer);
    log.info({ path: relativePath }, 'File uploaded');
  }

  /**
   * Get file path for download
   */
  getFilePath(serverDir: string, relativePath: string): string {
    const filePath = this.resolveSafePath(serverDir, relativePath);
    if (!fs.existsSync(filePath)) {
      throw new Error('File not found');
    }
    return filePath;
  }

  /**
   * Check if a file extension is editable
   */
  isEditable(fileName: string): boolean {
    return EDITABLE_EXTENSIONS.has(path.extname(fileName).toLowerCase());
  }
}
