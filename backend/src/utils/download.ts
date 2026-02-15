import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { createChildLogger } from './logger';

const log = createChildLogger('download');

export interface DownloadProgress {
  downloaded: number;
  total: number;
  percentage: number;
}

type ProgressCallback = (progress: DownloadProgress) => void;

/**
 * Download a file from a URL with progress reporting
 */
export async function downloadFile(
  url: string,
  destPath: string,
  onProgress?: ProgressCallback
): Promise<void> {
  const dir = path.dirname(destPath);
  fs.mkdirSync(dir, { recursive: true });

  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;

    const request = protocol.get(url, (response) => {
      // Handle redirects
      if (response.statusCode === 301 || response.statusCode === 302) {
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          downloadFile(redirectUrl, destPath, onProgress).then(resolve).catch(reject);
          return;
        }
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
          onProgress({
            downloaded,
            total: totalSize,
            percentage: Math.round((downloaded / totalSize) * 100),
          });
        }
      });

      file.on('finish', () => {
        file.close();
        resolve();
      });

      file.on('error', (err) => {
        fs.unlinkSync(destPath);
        reject(err);
      });
    });

    request.on('error', (err) => {
      reject(err);
    });

    request.setTimeout(300000, () => {
      request.destroy();
      reject(new Error('Download timed out'));
    });
  });
}

// ─── Server JAR download URLs ────────────────────────────────

interface VersionManifest {
  latest: { release: string; snapshot: string };
  versions: Array<{ id: string; type: string; url: string }>;
}

interface VersionDetail {
  downloads: {
    server?: { url: string; sha1: string; size: number };
  };
}

/**
 * Fetch available Minecraft versions from Mojang API
 */
export async function getMinecraftVersions(): Promise<Array<{ id: string; type: string }>> {
  const url = 'https://launchermeta.mojang.com/mc/game/version_manifest.json';
  const data = await fetchJson<VersionManifest>(url);
  return data.versions.map((v) => ({ id: v.id, type: v.type }));
}

/**
 * Get the download URL for a vanilla Minecraft server JAR
 */
export async function getVanillaServerUrl(version: string): Promise<string> {
  const manifest = await fetchJson<VersionManifest>(
    'https://launchermeta.mojang.com/mc/game/version_manifest.json'
  );

  const versionEntry = manifest.versions.find((v) => v.id === version);
  if (!versionEntry) throw new Error(`Version ${version} not found`);

  const detail = await fetchJson<VersionDetail>(versionEntry.url);
  if (!detail.downloads.server) throw new Error(`No server download for version ${version}`);

  return detail.downloads.server.url;
}

/**
 * Get the download URL for a Paper server JAR
 */
export async function getPaperServerUrl(version: string): Promise<string> {
  const buildsUrl = `https://api.papermc.io/v2/projects/paper/versions/${version}/builds`;
  const builds = await fetchJson<{ builds: Array<{ build: number; downloads: { application: { name: string } } }> }>(buildsUrl);

  if (!builds.builds.length) throw new Error(`No Paper builds for version ${version}`);

  const latest = builds.builds[builds.builds.length - 1];
  const fileName = latest.downloads.application.name;
  return `https://api.papermc.io/v2/projects/paper/versions/${version}/builds/${latest.build}/downloads/${fileName}`;
}

/**
 * Get available Paper versions
 */
export async function getPaperVersions(): Promise<string[]> {
  const data = await fetchJson<{ versions: string[] }>('https://api.papermc.io/v2/projects/paper');
  return data.versions;
}

/**
 * Get available Purpur versions
 */
export async function getSpigotDownloadUrl(version: string): Promise<string> {
  // Spigot uses BuildTools - provide download URL for BuildTools
  return `https://hub.spigotmc.org/jenkins/job/BuildTools/lastSuccessfulBuild/artifact/target/BuildTools.jar`;
}

// ─── HTTP helpers ────────────────────────────────────────────

function fetchJson<T>(url: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    protocol.get(url, { headers: { 'User-Agent': 'CraftOS-Server-Manager/1.0' } }, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          fetchJson<T>(redirectUrl).then(resolve).catch(reject);
          return;
        }
      }

      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }

      let data = '';
      response.on('data', (chunk) => (data += chunk));
      response.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('Invalid JSON response'));
        }
      });
    }).on('error', reject);
  });
}
