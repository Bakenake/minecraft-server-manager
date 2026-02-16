import fs from 'fs';
import path from 'path';
import https from 'https';
import { createChildLogger } from './logger';
import { config } from '../config';

const log = createChildLogger('java-installer');

export interface JavaSetupStatus {
  installed: boolean;
  systemJavaFound: boolean;
  bundledJavaFound: boolean;
  bundledJavaPath: string | null;
  systemJavaPath: string | null;
  javaVersion: string | null;
  downloading: boolean;
  downloadProgress: number;
}

// Track download state globally
let isDownloading = false;
let downloadProgress = 0;

/**
 * Get the path where bundled Java should be installed
 */
export function getBundledJavaDir(): string {
  return path.join(config.paths.data, 'java');
}

/**
 * Get the path to the bundled java executable
 */
export function getBundledJavaPath(): string | null {
  const javaDir = getBundledJavaDir();
  if (!fs.existsSync(javaDir)) return null;

  // Look for java executable inside the extracted directory
  // Adoptium extracts to a folder like jdk-21.0.x+y-jre/
  try {
    const entries = fs.readdirSync(javaDir);
    for (const entry of entries) {
      const javaExe = process.platform === 'win32'
        ? path.join(javaDir, entry, 'bin', 'java.exe')
        : path.join(javaDir, entry, 'bin', 'java');

      if (fs.existsSync(javaExe)) {
        return javaExe;
      }
    }

    // Also check directly in bin/ (in case extracted flat)
    const directExe = process.platform === 'win32'
      ? path.join(javaDir, 'bin', 'java.exe')
      : path.join(javaDir, 'bin', 'java');

    if (fs.existsSync(directExe)) return directExe;
  } catch {
    // Permission error
  }

  return null;
}

/**
 * Check if system Java is available
 */
export function findSystemJava(): string | null {
  const { execSync } = require('child_process');
  try {
    const output = execSync('"java" -version 2>&1', { encoding: 'utf-8', timeout: 10000 });
    if (output.includes('version')) return 'java';
  } catch {
    // No system java
  }

  // Check common Windows paths
  if (process.platform === 'win32') {
    const commonPaths = [
      'C:\\Program Files\\Java',
      'C:\\Program Files\\Eclipse Adoptium',
      'C:\\Program Files\\Microsoft',
    ];
    for (const dir of commonPaths) {
      if (!fs.existsSync(dir)) continue;
      try {
        for (const sub of fs.readdirSync(dir)) {
          const exe = path.join(dir, sub, 'bin', 'java.exe');
          if (fs.existsSync(exe)) return exe;
        }
      } catch { /* skip */ }
    }
  }

  return null;
}

/**
 * Get the current Java setup status
 */
export function getJavaSetupStatus(): JavaSetupStatus {
  const bundledPath = getBundledJavaPath();
  const systemPath = findSystemJava();

  return {
    installed: !!(bundledPath || systemPath),
    systemJavaFound: !!systemPath,
    bundledJavaFound: !!bundledPath,
    bundledJavaPath: bundledPath,
    systemJavaPath: systemPath,
    javaVersion: null,
    downloading: isDownloading,
    downloadProgress,
  };
}

/**
 * Get the best available Java path (bundled preferred)
 */
export function getBestJavaPath(): string {
  const bundled = getBundledJavaPath();
  if (bundled) return bundled;

  const system = findSystemJava();
  if (system) return system;

  return 'java'; // Fallback
}

/**
 * Download and install Adoptium Temurin JRE
 * Uses the Adoptium API to download the latest JRE for the current platform
 */
export async function downloadAndInstallJava(
  javaVersion: number = 21,
  onProgress?: (percent: number) => void
): Promise<string> {
  if (isDownloading) {
    throw new Error('Java download already in progress');
  }

  const os = getAdoptiumOS();
  const arch = getAdoptiumArch();
  const imageType = 'jre'; // JRE is smaller, sufficient for running MC servers

  const apiUrl = `https://api.adoptium.net/v3/binary/latest/${javaVersion}/ga/${os}/${arch}/${imageType}/hotspot/normal/eclipse`;

  log.info({ javaVersion, os, arch }, 'Starting Java JRE download from Adoptium');

  const javaDir = getBundledJavaDir();
  fs.mkdirSync(javaDir, { recursive: true });

  const ext = process.platform === 'win32' ? 'zip' : 'tar.gz';
  const tempFile = path.join(javaDir, `temurin-jre.${ext}`);

  isDownloading = true;
  downloadProgress = 0;

  try {
    // Download with redirect following
    await downloadWithRedirects(apiUrl, tempFile, (percent) => {
      downloadProgress = percent;
      onProgress?.(percent);
    });

    log.info('Download complete, extracting...');
    downloadProgress = 100;

    // Extract
    if (process.platform === 'win32') {
      await extractZip(tempFile, javaDir);
    } else {
      await extractTarGz(tempFile, javaDir);
    }

    // Clean up temp file
    try { fs.unlinkSync(tempFile); } catch { /* ignore */ }

    // Find the java executable
    const javaPath = getBundledJavaPath();
    if (!javaPath) {
      throw new Error('Java extraction succeeded but java executable not found');
    }

    log.info({ javaPath }, 'Java JRE installed successfully');
    return javaPath;
  } finally {
    isDownloading = false;
  }
}

function getAdoptiumOS(): string {
  switch (process.platform) {
    case 'win32': return 'windows';
    case 'darwin': return 'mac';
    case 'linux': return 'linux';
    default: return 'linux';
  }
}

function getAdoptiumArch(): string {
  switch (process.arch) {
    case 'x64': return 'x64';
    case 'arm64': return 'aarch64';
    case 'ia32': return 'x32';
    default: return 'x64';
  }
}

/**
 * Download a file following HTTP redirects
 */
function downloadWithRedirects(
  url: string,
  destPath: string,
  onProgress?: (percent: number) => void,
  maxRedirects: number = 10
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) {
      reject(new Error('Too many redirects'));
      return;
    }

    const protocol = url.startsWith('https') ? https : require('http');

    const request = protocol.get(url, { timeout: 30000 }, (response: any) => {
      // Handle redirects
      if (response.statusCode === 301 || response.statusCode === 302 || response.statusCode === 307) {
        const redirectUrl = response.headers.location;
        if (!redirectUrl) {
          reject(new Error('Redirect with no location header'));
          return;
        }
        response.resume(); // Consume response
        downloadWithRedirects(redirectUrl, destPath, onProgress, maxRedirects - 1)
          .then(resolve)
          .catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        reject(new Error(`Download failed with status ${response.statusCode}`));
        return;
      }

      const totalSize = parseInt(response.headers['content-length'] || '0', 10);
      let downloaded = 0;

      const file = fs.createWriteStream(destPath);
      response.pipe(file);

      response.on('data', (chunk: Buffer) => {
        downloaded += chunk.length;
        if (onProgress && totalSize > 0) {
          onProgress(Math.round((downloaded / totalSize) * 100));
        }
      });

      file.on('finish', () => {
        file.close();
        resolve();
      });

      file.on('error', (err: Error) => {
        try { fs.unlinkSync(destPath); } catch { /* ignore */ }
        reject(err);
      });
    });

    request.on('error', (err: Error) => {
      reject(err);
    });

    request.setTimeout(300000, () => {
      request.destroy();
      reject(new Error('Download timed out'));
    });
  });
}

/**
 * Extract a ZIP file (Windows) using PowerShell
 */
async function extractZip(zipPath: string, destDir: string): Promise<void> {
  const { execSync } = require('child_process');
  try {
    // Use PowerShell's Expand-Archive
    execSync(
      `powershell -NoProfile -Command "Expand-Archive -Path '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force"`,
      { timeout: 120000, stdio: 'pipe' }
    );
  } catch (err: any) {
    log.error({ error: err.message }, 'Failed to extract ZIP');
    throw new Error(`Failed to extract Java ZIP: ${err.message}`);
  }
}

/**
 * Extract a tar.gz file (Linux/macOS)
 */
async function extractTarGz(tarPath: string, destDir: string): Promise<void> {
  const { execSync } = require('child_process');
  try {
    execSync(`tar -xzf "${tarPath}" -C "${destDir}"`, { timeout: 120000, stdio: 'pipe' });
  } catch (err: any) {
    log.error({ error: err.message }, 'Failed to extract tar.gz');
    throw new Error(`Failed to extract Java tar.gz: ${err.message}`);
  }
}
