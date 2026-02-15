import { execSync, exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import { createChildLogger } from './logger';

const log = createChildLogger('java');

export interface JavaInstallation {
  path: string;
  version: string;
  majorVersion: number;
  isJdk: boolean;
  arch: string;
}

/**
 * Detect all Java installations on the system
 */
export async function detectJavaInstallations(): Promise<JavaInstallation[]> {
  const installations: JavaInstallation[] = [];

  // Check default java
  try {
    const info = getJavaInfo('java');
    if (info) installations.push(info);
  } catch {
    // No default java
  }

  // Platform-specific search
  if (process.platform === 'win32') {
    await detectWindowsJava(installations);
  } else if (process.platform === 'darwin') {
    await detectMacJava(installations);
  } else {
    await detectLinuxJava(installations);
  }

  // Deduplicate by path
  const seen = new Set<string>();
  return installations.filter((install) => {
    const normalized = path.resolve(install.path);
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function getJavaInfo(javaPath: string): JavaInstallation | null {
  try {
    const versionOutput = execSync(`"${javaPath}" -version 2>&1`, {
      encoding: 'utf-8',
      timeout: 10000,
    });

    const versionMatch = versionOutput.match(/version "(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
    if (!versionMatch) return null;

    const major = parseInt(versionMatch[1]);
    const version = versionMatch[0].replace('version ', '').replace(/"/g, '');

    const isJdk = versionOutput.includes('jdk') || versionOutput.includes('JDK');
    const is64Bit = versionOutput.includes('64-Bit');

    return {
      path: javaPath,
      version,
      majorVersion: major === 1 ? parseInt(versionMatch[2] || '8') : major,
      isJdk,
      arch: is64Bit ? 'x64' : 'x86',
    };
  } catch {
    return null;
  }
}

async function detectWindowsJava(installations: JavaInstallation[]): Promise<void> {
  const searchPaths = [
    'C:\\Program Files\\Java',
    'C:\\Program Files (x86)\\Java',
    'C:\\Program Files\\Eclipse Adoptium',
    'C:\\Program Files\\AdoptOpenJDK',
    'C:\\Program Files\\Zulu',
    'C:\\Program Files\\Microsoft',
  ];

  for (const searchPath of searchPaths) {
    if (!fs.existsSync(searchPath)) continue;

    try {
      const dirs = fs.readdirSync(searchPath);
      for (const dir of dirs) {
        const javaExe = path.join(searchPath, dir, 'bin', 'java.exe');
        if (fs.existsSync(javaExe)) {
          const info = getJavaInfo(javaExe);
          if (info) installations.push(info);
        }
      }
    } catch {
      // Permission denied or similar
    }
  }

  // Check JAVA_HOME
  const javaHome = process.env.JAVA_HOME;
  if (javaHome) {
    const javaExe = path.join(javaHome, 'bin', 'java.exe');
    if (fs.existsSync(javaExe)) {
      const info = getJavaInfo(javaExe);
      if (info) installations.push(info);
    }
  }
}

async function detectMacJava(installations: JavaInstallation[]): Promise<void> {
  try {
    const output = execSync('/usr/libexec/java_home -V 2>&1', { encoding: 'utf-8' });
    const matches = output.matchAll(/\s+(.+?)\s.*?\"(.+?)\"/g);
    for (const match of matches) {
      const javaPath = path.join(match[2], 'bin', 'java');
      const info = getJavaInfo(javaPath);
      if (info) installations.push(info);
    }
  } catch {
    // No macOS java_home utility
  }
}

async function detectLinuxJava(installations: JavaInstallation[]): Promise<void> {
  const searchPaths = ['/usr/lib/jvm', '/usr/local/lib/jvm', '/opt/java'];

  for (const searchPath of searchPaths) {
    if (!fs.existsSync(searchPath)) continue;

    try {
      const dirs = fs.readdirSync(searchPath);
      for (const dir of dirs) {
        const javaExe = path.join(searchPath, dir, 'bin', 'java');
        if (fs.existsSync(javaExe)) {
          const info = getJavaInfo(javaExe);
          if (info) installations.push(info);
        }
      }
    } catch {
      // Permission denied
    }
  }
}

/**
 * Get the recommended Java version for a specific Minecraft version
 */
export function getRecommendedJavaVersion(mcVersion: string): number {
  const parts = mcVersion.split('.').map(Number);
  const minor = parts[1] || 0;

  if (minor >= 21) return 21; // 1.21+
  if (minor >= 17) return 17; // 1.17-1.20
  if (minor >= 12) return 8;  // 1.12-1.16
  return 8;                    // Older versions
}
