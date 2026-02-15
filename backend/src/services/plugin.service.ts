import fs from 'fs';
import path from 'path';
import { createChildLogger } from '../utils/logger';

const log = createChildLogger('plugin-service');

export interface PluginInfo {
  name: string;
  fileName: string;
  version?: string;
  description?: string;
  authors?: string[];
  enabled: boolean;
  type: 'plugin' | 'mod';
  hasError?: boolean;
  errorMessage?: string;
  size: number;
}

export class PluginService {
  private static instance: PluginService;

  static getInstance(): PluginService {
    if (!PluginService.instance) {
      PluginService.instance = new PluginService();
    }
    return PluginService.instance;
  }

  /**
   * List plugins for a Spigot/Paper server
   */
  listPlugins(serverDir: string): PluginInfo[] {
    const pluginsDir = path.join(serverDir, 'plugins');
    if (!fs.existsSync(pluginsDir)) return [];

    const files = fs.readdirSync(pluginsDir);
    const plugins: PluginInfo[] = [];

    for (const file of files) {
      if (!file.endsWith('.jar') && !file.endsWith('.jar.disabled')) continue;

      const filePath = path.join(pluginsDir, file);
      const stat = fs.statSync(filePath);
      const enabled = !file.endsWith('.disabled');
      const cleanName = file.replace('.jar.disabled', '.jar').replace('.jar', '');

      plugins.push({
        name: cleanName,
        fileName: file,
        enabled,
        type: 'plugin',
        size: stat.size,
      });
    }

    return plugins.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * List mods for a Forge/Fabric server
   */
  listMods(serverDir: string): PluginInfo[] {
    const modsDir = path.join(serverDir, 'mods');
    if (!fs.existsSync(modsDir)) return [];

    const files = fs.readdirSync(modsDir);
    const mods: PluginInfo[] = [];

    for (const file of files) {
      if (!file.endsWith('.jar') && !file.endsWith('.jar.disabled')) continue;

      const filePath = path.join(modsDir, file);
      const stat = fs.statSync(filePath);
      const enabled = !file.endsWith('.disabled');
      const cleanName = file.replace('.jar.disabled', '.jar').replace('.jar', '');

      mods.push({
        name: cleanName,
        fileName: file,
        enabled,
        type: 'mod',
        size: stat.size,
      });
    }

    return mods.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Enable a plugin or mod by removing .disabled suffix
   */
  enable(serverDir: string, fileName: string, type: 'plugin' | 'mod'): void {
    const dir = type === 'plugin' ? 'plugins' : 'mods';
    const disabledPath = path.join(serverDir, dir, `${fileName}.disabled`);
    const enabledPath = path.join(serverDir, dir, fileName);

    if (fs.existsSync(disabledPath)) {
      fs.renameSync(disabledPath, enabledPath);
      log.info({ fileName, type }, 'Enabled');
    }
  }

  /**
   * Disable a plugin or mod by adding .disabled suffix
   */
  disable(serverDir: string, fileName: string, type: 'plugin' | 'mod'): void {
    const dir = type === 'plugin' ? 'plugins' : 'mods';
    const enabledPath = path.join(serverDir, dir, fileName);
    const disabledPath = path.join(serverDir, dir, `${fileName}.disabled`);

    if (fs.existsSync(enabledPath)) {
      fs.renameSync(enabledPath, disabledPath);
      log.info({ fileName, type }, 'Disabled');
    }
  }

  /**
   * Remove a plugin or mod
   */
  remove(serverDir: string, fileName: string, type: 'plugin' | 'mod'): void {
    const dir = type === 'plugin' ? 'plugins' : 'mods';
    const filePath = path.join(serverDir, dir, fileName);
    const disabledPath = path.join(serverDir, dir, `${fileName}.disabled`);

    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    if (fs.existsSync(disabledPath)) fs.unlinkSync(disabledPath);
    log.info({ fileName, type }, 'Removed');
  }

  /**
   * Upload a plugin or mod
   */
  async upload(serverDir: string, fileName: string, fileBuffer: Buffer, type: 'plugin' | 'mod'): Promise<void> {
    const dir = type === 'plugin' ? 'plugins' : 'mods';
    const destDir = path.join(serverDir, dir);
    fs.mkdirSync(destDir, { recursive: true });

    if (!fileName.endsWith('.jar')) {
      throw new Error('Only .jar files are allowed');
    }

    const destPath = path.join(destDir, fileName);
    fs.writeFileSync(destPath, fileBuffer);
    log.info({ fileName, type }, 'Uploaded');
  }

  /**
   * Detect plugin errors from recent logs
   */
  detectErrors(serverDir: string): Array<{ plugin: string; error: string; timestamp?: string }> {
    const logFile = path.join(serverDir, 'logs', 'latest.log');
    if (!fs.existsSync(logFile)) return [];

    const content = fs.readFileSync(logFile, 'utf-8');
    const errors: Array<{ plugin: string; error: string; timestamp?: string }> = [];

    const errorPattern = /\[(\d{2}:\d{2}:\d{2})\]\s*\[.*?(?:ERROR|WARN)\].*?\[(\w+)\].*?:\s*(.*)/g;
    let match;

    while ((match = errorPattern.exec(content)) !== null) {
      errors.push({
        timestamp: match[1],
        plugin: match[2],
        error: match[3].trim(),
      });
    }

    return errors.slice(-50); // Last 50 errors
  }
}
