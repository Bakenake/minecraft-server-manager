import fs from 'fs';
import path from 'path';
import { createChildLogger } from '../utils/logger';

const log = createChildLogger('world-service');

export interface WorldInfo {
  name: string;
  dimension: 'overworld' | 'nether' | 'the_end';
  path: string;
  sizeMB: number;
  lastModified: Date;
  seed?: string;
  levelName?: string;
}

export class WorldService {
  private static instance: WorldService;

  static getInstance(): WorldService {
    if (!WorldService.instance) {
      WorldService.instance = new WorldService();
    }
    return WorldService.instance;
  }

  /**
   * Calculate directory size recursively
   */
  private getDirSize(dirPath: string): number {
    let size = 0;
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          size += this.getDirSize(fullPath);
        } else if (entry.isFile()) {
          size += fs.statSync(fullPath).size;
        }
      }
    } catch {
      // Ignore permission errors
    }
    return size;
  }

  /**
   * Read level.dat info using simple text parsing of level-name from server.properties
   */
  private readServerProperties(serverDir: string): Record<string, string> {
    const propsPath = path.join(serverDir, 'server.properties');
    const props: Record<string, string> = {};
    try {
      const content = fs.readFileSync(propsPath, 'utf-8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const eqIdx = trimmed.indexOf('=');
          if (eqIdx > 0) {
            props[trimmed.substring(0, eqIdx).trim()] = trimmed.substring(eqIdx + 1).trim();
          }
        }
      }
    } catch {
      // No properties file
    }
    return props;
  }

  /**
   * Write a single property to server.properties (preserving other values)
   */
  private setServerProperty(serverDir: string, key: string, value: string): void {
    const propsPath = path.join(serverDir, 'server.properties');
    try {
      let content = fs.readFileSync(propsPath, 'utf-8');
      const lines = content.split('\n');
      let found = false;
      for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (trimmed.startsWith(`${key}=`)) {
          lines[i] = `${key}=${value}`;
          found = true;
          break;
        }
      }
      if (!found) {
        lines.push(`${key}=${value}`);
      }
      fs.writeFileSync(propsPath, lines.join('\n'), 'utf-8');
    } catch (err) {
      log.error({ err }, 'Failed to write server.properties');
      throw new Error('Failed to update server.properties');
    }
  }

  /**
   * Get all worlds for a server
   */
  async getWorlds(serverDir: string): Promise<WorldInfo[]> {
    const props = this.readServerProperties(serverDir);
    const levelName = props['level-name'] || 'world';

    const worlds: WorldInfo[] = [];

    // Standard MC world directories
    const worldDirs: Array<{ dir: string; dimension: WorldInfo['dimension']; label: string }> = [
      { dir: levelName, dimension: 'overworld', label: 'Overworld' },
      { dir: `${levelName}_nether`, dimension: 'nether', label: 'Nether' },
      { dir: `${levelName}_the_end`, dimension: 'the_end', label: 'The End' },
    ];

    for (const { dir, dimension } of worldDirs) {
      const worldPath = path.join(serverDir, dir);
      if (fs.existsSync(worldPath) && fs.statSync(worldPath).isDirectory()) {
        const size = this.getDirSize(worldPath);
        const stat = fs.statSync(worldPath);
        worlds.push({
          name: dir,
          dimension,
          path: dir,
          sizeMB: Math.round((size / (1024 * 1024)) * 100) / 100,
          lastModified: stat.mtime,
          seed: props['level-seed'] || undefined,
          levelName,
        });
      }
    }

    return worlds;
  }

  /**
   * Reset (delete) a specific world dimension
   */
  async resetWorld(serverDir: string, worldDir: string): Promise<void> {
    const fullPath = path.join(serverDir, worldDir);
    const resolved = path.resolve(fullPath);

    // Safety check: must be inside server dir
    if (!resolved.startsWith(path.resolve(serverDir))) {
      throw new Error('Access denied: path traversal detected');
    }

    if (!fs.existsSync(fullPath)) {
      throw new Error('World directory not found');
    }

    log.info({ worldDir }, 'Resetting world');
    fs.rmSync(fullPath, { recursive: true, force: true });
    log.info({ worldDir }, 'World reset complete');
  }

  /**
   * Reset all worlds for a server
   */
  async resetAllWorlds(serverDir: string): Promise<number> {
    const worlds = await this.getWorlds(serverDir);
    for (const world of worlds) {
      await this.resetWorld(serverDir, world.path);
    }
    return worlds.length;
  }

  /**
   * Update the world seed in server.properties
   */
  async setSeed(serverDir: string, seed: string): Promise<void> {
    this.setServerProperty(serverDir, 'level-seed', seed);
    log.info({ seed }, 'Updated world seed');
  }

  /**
   * Toggle Nether on/off
   */
  async setNetherEnabled(serverDir: string, enabled: boolean): Promise<void> {
    this.setServerProperty(serverDir, 'allow-nether', String(enabled));
    log.info({ enabled }, 'Updated Nether setting');
  }

  /**
   * Toggle The End - no direct server.properties setting, but we can set the generator
   * In practice, The End is always enabled. We can only delete the world.
   * For now, we'll note this is informational.
   */
  async getWorldSettings(serverDir: string): Promise<Record<string, string>> {
    const props = this.readServerProperties(serverDir);
    return {
      'level-name': props['level-name'] || 'world',
      'level-seed': props['level-seed'] || '',
      'level-type': props['level-type'] || 'minecraft\\:normal',
      'allow-nether': props['allow-nether'] || 'true',
      'generate-structures': props['generate-structures'] || 'true',
      'generator-settings': props['generator-settings'] || '',
      'max-world-size': props['max-world-size'] || '29999984',
      'spawn-protection': props['spawn-protection'] || '16',
    };
  }

  /**
   * Update multiple world settings at once
   */
  async updateWorldSettings(serverDir: string, settings: Record<string, string>): Promise<void> {
    const allowedKeys = [
      'level-seed', 'level-type', 'allow-nether', 'generate-structures',
      'generator-settings', 'max-world-size', 'spawn-protection',
    ];

    for (const [key, value] of Object.entries(settings)) {
      if (allowedKeys.includes(key)) {
        this.setServerProperty(serverDir, key, value);
      }
    }
    log.info({ settings }, 'Updated world settings');
  }
}
