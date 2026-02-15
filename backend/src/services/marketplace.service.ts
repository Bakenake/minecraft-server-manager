import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { createChildLogger } from '../utils/logger';
import { downloadFile } from '../utils/download';

const log = createChildLogger('marketplace');

// ─── Types ──────────────────────────────────────────────────

export interface MarketplaceSearchResult {
  source: 'modrinth' | 'hangar';
  id: string;           // project ID / slug
  name: string;
  slug: string;
  description: string;
  author: string;
  downloads: number;
  iconUrl: string | null;
  categories: string[];
  serverTypes: string[];   // e.g. ['paper', 'spigot', 'bukkit']
  gameVersions: string[];  // MC versions like ['1.21.4', '1.21.3']
  url: string;             // web link
  dateUpdated: string;
  dateCreated: string;
}

export interface MarketplaceVersionInfo {
  id: string;
  versionNumber: string;
  name: string;
  gameVersions: string[];
  loaders: string[];       // ['paper', 'spigot', 'bukkit', 'forge', 'fabric']
  downloadUrl: string;
  fileName: string;
  fileSize: number;
  datePublished: string;
  changelog?: string;
  dependencies: Array<{
    projectId: string;
    dependencyType: 'required' | 'optional';
  }>;
}

export interface MarketplaceProjectDetail {
  id: string;
  slug: string;
  name: string;
  description: string;
  longDescription: string;
  author: string;
  downloads: number;
  iconUrl: string | null;
  categories: string[];
  serverTypes: string[];
  gameVersions: string[];
  url: string;
  sourceUrl?: string;
  wikiUrl?: string;
  issuesUrl?: string;
  dateUpdated: string;
  dateCreated: string;
  versions: MarketplaceVersionInfo[];
}

// ─── Server-type to Modrinth loader mapping ─────────────────

function getModrinthLoaders(serverType: string): string[] {
  switch (serverType) {
    case 'paper':   return ['paper', 'spigot', 'bukkit'];
    case 'spigot':  return ['spigot', 'bukkit'];
    case 'forge':   return ['forge'];
    case 'fabric':  return ['fabric'];
    default:        return [];
  }
}

function getModrinthProjectType(serverType: string): string {
  switch (serverType) {
    case 'forge':
    case 'fabric':
      return 'mod';
    default:
      return 'plugin';
  }
}

function getHangarPlatform(serverType: string): string | null {
  switch (serverType) {
    case 'paper':   return 'PAPER';
    case 'spigot':  return null; // Hangar is Paper-focused
    default:        return null;
  }
}

// ─── HTTP Helpers ───────────────────────────────────────────

function fetchJson<T>(url: string, headers?: Record<string, string>): Promise<T> {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const defaultHeaders: Record<string, string> = {
      'User-Agent': 'CraftOS-Server-Manager/1.0 (minecraft-server-manager)',
      'Accept': 'application/json',
      ...headers,
    };

    protocol.get(url, { headers: defaultHeaders }, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          fetchJson<T>(redirectUrl, headers).then(resolve).catch(reject);
          return;
        }
      }

      if (response.statusCode !== 200) {
        let body = '';
        response.on('data', (c) => (body += c));
        response.on('end', () => {
          reject(new Error(`HTTP ${response.statusCode}: ${body.slice(0, 200)}`));
        });
        return;
      }

      let data = '';
      response.on('data', (chunk) => (data += chunk));
      response.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error('Invalid JSON response'));
        }
      });
    }).on('error', reject);
  });
}

// ─── Modrinth API ───────────────────────────────────────────

const MODRINTH_BASE = 'https://api.modrinth.com/v2';

interface ModrinthSearchHit {
  project_id: string;
  slug: string;
  title: string;
  description: string;
  author: string;
  downloads: number;
  icon_url: string | null;
  categories: string[];
  versions: string[];         // game versions
  loaders?: string[];
  project_type: string;
  date_modified: string;
  date_created: string;
}

interface ModrinthSearchResponse {
  hits: ModrinthSearchHit[];
  offset: number;
  limit: number;
  total_hits: number;
}

interface ModrinthProject {
  id: string;
  slug: string;
  title: string;
  description: string;
  body: string;
  downloads: number;
  icon_url: string | null;
  categories: string[];
  game_versions: string[];
  loaders: string[];
  project_type: string;
  source_url?: string;
  wiki_url?: string;
  issues_url?: string;
  date_modified: string;
  date_created: string;
}

interface ModrinthVersion {
  id: string;
  version_number: string;
  name: string;
  game_versions: string[];
  loaders: string[];
  files: Array<{
    url: string;
    filename: string;
    size: number;
    primary: boolean;
  }>;
  date_published: string;
  changelog?: string;
  dependencies: Array<{
    project_id: string;
    dependency_type: 'required' | 'optional' | 'incompatible' | 'embedded';
  }>;
}

interface ModrinthTeamMember {
  user: {
    username: string;
  };
  role: string;
}

async function searchModrinth(
  query: string,
  serverType: string,
  mcVersion?: string,
  offset = 0,
  limit = 20,
  category?: string
): Promise<{ results: MarketplaceSearchResult[]; total: number }> {
  const loaders = getModrinthLoaders(serverType);
  const projectType = getModrinthProjectType(serverType);

  if (loaders.length === 0) {
    return { results: [], total: 0 };
  }

  // Build facets — Modrinth uses a nested array format
  const facets: string[][] = [];
  facets.push([`project_type:${projectType}`]);
  facets.push(loaders.map((l) => `categories:${l}`));
  if (mcVersion) {
    facets.push([`versions:${mcVersion}`]);
  }
  if (category && category !== 'all') {
    facets.push([`categories:${category}`]);
  }

  const params = new URLSearchParams({
    query,
    facets: JSON.stringify(facets),
    offset: String(offset),
    limit: String(limit),
    index: 'relevance',
  });

  const url = `${MODRINTH_BASE}/search?${params}`;
  log.debug({ url }, 'Searching Modrinth');

  const data = await fetchJson<ModrinthSearchResponse>(url);

  const results: MarketplaceSearchResult[] = data.hits.map((hit) => ({
    source: 'modrinth' as const,
    id: hit.project_id,
    name: hit.title,
    slug: hit.slug,
    description: hit.description,
    author: hit.author,
    downloads: hit.downloads,
    iconUrl: hit.icon_url,
    categories: hit.categories,
    serverTypes: hit.loaders || loaders,
    gameVersions: hit.versions,
    url: `https://modrinth.com/${projectType}/${hit.slug}`,
    dateUpdated: hit.date_modified,
    dateCreated: hit.date_created,
  }));

  return { results, total: data.total_hits };
}

async function getModrinthProject(idOrSlug: string): Promise<MarketplaceProjectDetail> {
  const project = await fetchJson<ModrinthProject>(`${MODRINTH_BASE}/project/${idOrSlug}`);

  // Get team to find author
  let authorName = '';
  try {
    const team = await fetchJson<ModrinthTeamMember[]>(`${MODRINTH_BASE}/project/${idOrSlug}/members`);
    const owner = team.find((m) => m.role === 'Owner') || team[0];
    authorName = owner?.user?.username || '';
  } catch {
    authorName = 'Unknown';
  }

  // Get versions
  const rawVersions = await fetchJson<ModrinthVersion[]>(`${MODRINTH_BASE}/project/${idOrSlug}/version`);

  const versions: MarketplaceVersionInfo[] = rawVersions.map((v) => {
    const primaryFile = v.files.find((f) => f.primary) || v.files[0];
    return {
      id: v.id,
      versionNumber: v.version_number,
      name: v.name,
      gameVersions: v.game_versions,
      loaders: v.loaders,
      downloadUrl: primaryFile?.url || '',
      fileName: primaryFile?.filename || '',
      fileSize: primaryFile?.size || 0,
      datePublished: v.date_published,
      changelog: v.changelog || undefined,
      dependencies: v.dependencies
        .filter((d) => d.dependency_type === 'required' || d.dependency_type === 'optional')
        .map((d) => ({
          projectId: d.project_id,
          dependencyType: d.dependency_type as 'required' | 'optional',
        })),
    };
  });

  return {
    id: project.id,
    slug: project.slug,
    name: project.title,
    description: project.description,
    longDescription: project.body,
    author: authorName,
    downloads: project.downloads,
    iconUrl: project.icon_url,
    categories: project.categories,
    serverTypes: project.loaders,
    gameVersions: project.game_versions,
    url: `https://modrinth.com/${project.project_type}/${project.slug}`,
    sourceUrl: project.source_url || undefined,
    wikiUrl: project.wiki_url || undefined,
    issuesUrl: project.issues_url || undefined,
    dateUpdated: project.date_modified,
    dateCreated: project.date_created,
    versions,
  };
}

// ─── Hangar API (PaperMC) ───────────────────────────────────

const HANGAR_BASE = 'https://hangar.papermc.io/api/v1';

interface HangarProject {
  name: string;
  namespace: { owner: string; slug: string };
  stats: { downloads: number; stars: number };
  description: string;
  avatarUrl: string;
  lastUpdated: string;
  createdAt: string;
  category: string;
}

interface HangarSearchResponse {
  result: HangarProject[];
  pagination: { count: number; offset: number; limit: number };
}

interface HangarVersion {
  name: string;
  platformDependencies: Record<string, string[]>;
  downloads: Record<string, { fileInfo: { name: string; sizeBytes: number }; externalUrl?: string }>;
  createdAt: string;
  description?: string;
}

interface HangarVersionsResponse {
  result: HangarVersion[];
  pagination: { count: number };
}

async function searchHangar(
  query: string,
  serverType: string,
  mcVersion?: string,
  offset = 0,
  limit = 20,
  category?: string
): Promise<{ results: MarketplaceSearchResult[]; total: number }> {
  const platform = getHangarPlatform(serverType);
  if (!platform) return { results: [], total: 0 };

  const params = new URLSearchParams({
    q: query,
    limit: String(limit),
    offset: String(offset),
    platform,
    ...(mcVersion ? { version: `Paper:${mcVersion}` } : {}),
    ...(category && category !== 'all' ? { category: category.toUpperCase() } : {}),
  });

  const url = `${HANGAR_BASE}/projects?${params}`;
  log.debug({ url }, 'Searching Hangar');

  try {
    const data = await fetchJson<HangarSearchResponse>(url);

    const results: MarketplaceSearchResult[] = data.result.map((p) => ({
      source: 'hangar' as const,
      id: `${p.namespace.owner}/${p.namespace.slug}`,
      name: p.name,
      slug: p.namespace.slug,
      description: p.description,
      author: p.namespace.owner,
      downloads: p.stats.downloads,
      iconUrl: p.avatarUrl || null,
      categories: [p.category.toLowerCase()],
      serverTypes: ['paper'],
      gameVersions: [],
      url: `https://hangar.papermc.io/${p.namespace.owner}/${p.namespace.slug}`,
      dateUpdated: p.lastUpdated,
      dateCreated: p.createdAt,
    }));

    return { results, total: data.pagination.count };
  } catch (err) {
    log.warn({ err }, 'Hangar search failed');
    return { results: [], total: 0 };
  }
}

async function getHangarVersions(
  owner: string,
  slug: string,
  mcVersion?: string
): Promise<MarketplaceVersionInfo[]> {
  const params = new URLSearchParams({
    limit: '25',
    ...(mcVersion ? { platformVersion: `PAPER:${mcVersion}` } : {}),
  });

  const url = `${HANGAR_BASE}/projects/${owner}/${slug}/versions?${params}`;
  const data = await fetchJson<HangarVersionsResponse>(url);

  return data.result.map((v) => {
    const paperDl = v.downloads['PAPER'] || Object.values(v.downloads)[0];
    return {
      id: v.name,
      versionNumber: v.name,
      name: v.name,
      gameVersions: v.platformDependencies['PAPER'] || [],
      loaders: Object.keys(v.platformDependencies).map((k) => k.toLowerCase()),
      downloadUrl: paperDl?.externalUrl || `${HANGAR_BASE}/projects/${owner}/${slug}/versions/${v.name}/PAPER/download`,
      fileName: paperDl?.fileInfo?.name || `${slug}-${v.name}.jar`,
      fileSize: paperDl?.fileInfo?.sizeBytes || 0,
      datePublished: v.createdAt,
      changelog: v.description || undefined,
      dependencies: [],
    };
  });
}

// ─── Combined Marketplace Service ───────────────────────────

export class MarketplaceService {
  private static instance: MarketplaceService;

  static getInstance(): MarketplaceService {
    if (!MarketplaceService.instance) {
      MarketplaceService.instance = new MarketplaceService();
    }
    return MarketplaceService.instance;
  }

  /**
   * Search for plugins/mods across marketplaces based on server type
   */
  async search(
    query: string,
    serverType: string,
    mcVersion?: string,
    page = 0,
    limit = 20,
    category?: string,
    source?: 'modrinth' | 'hangar' | 'all'
  ): Promise<{ results: MarketplaceSearchResult[]; total: number }> {
    const effectiveSource = source || 'all';
    const offset = page * limit;

    // Vanilla servers don't support plugins
    if (serverType === 'vanilla') {
      return { results: [], total: 0 };
    }

    const promises: Promise<{ results: MarketplaceSearchResult[]; total: number }>[] = [];

    // Modrinth always searched (supports all modded server types)
    if (effectiveSource === 'all' || effectiveSource === 'modrinth') {
      promises.push(
        searchModrinth(query, serverType, mcVersion, offset, limit, category)
          .catch((err) => {
            log.error({ err }, 'Modrinth search failed');
            return { results: [], total: 0 };
          })
      );
    }

    // Hangar only for Paper servers
    if ((effectiveSource === 'all' || effectiveSource === 'hangar') && (serverType === 'paper')) {
      promises.push(
        searchHangar(query, serverType, mcVersion, offset, Math.min(limit, 10), category)
          .catch((err) => {
            log.error({ err }, 'Hangar search failed');
            return { results: [], total: 0 };
          })
      );
    }

    const results = await Promise.all(promises);

    // Merge and deduplicate by name
    let combined: MarketplaceSearchResult[] = [];
    let totalCount = 0;
    const seen = new Set<string>();

    for (const r of results) {
      totalCount += r.total;
      for (const item of r.results) {
        const key = item.name.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (!seen.has(key)) {
          seen.add(key);
          combined.push(item);
        }
      }
    }

    // Sort by downloads
    combined.sort((a, b) => b.downloads - a.downloads);

    return { results: combined.slice(0, limit), total: totalCount };
  }

  /**
   * Get detailed info about a specific project
   */
  async getProject(
    source: 'modrinth' | 'hangar',
    projectId: string
  ): Promise<MarketplaceProjectDetail> {
    if (source === 'modrinth') {
      return getModrinthProject(projectId);
    }

    // Hangar
    const [owner, slug] = projectId.split('/');
    if (!owner || !slug) throw new Error('Invalid Hangar project ID');

    // Fetch project info + versions in parallel
    const [projectData, versions] = await Promise.all([
      fetchJson<HangarProject>(`${HANGAR_BASE}/projects/${owner}/${slug}`),
      getHangarVersions(owner, slug),
    ]);

    return {
      id: `${owner}/${slug}`,
      slug: projectData.namespace.slug,
      name: projectData.name,
      description: projectData.description,
      longDescription: projectData.description, // Hangar doesn't have a separate long description in search
      author: projectData.namespace.owner,
      downloads: projectData.stats.downloads,
      iconUrl: projectData.avatarUrl || null,
      categories: [projectData.category.toLowerCase()],
      serverTypes: ['paper'],
      gameVersions: versions.flatMap((v) => v.gameVersions).filter((v, i, a) => a.indexOf(v) === i),
      url: `https://hangar.papermc.io/${owner}/${slug}`,
      dateUpdated: projectData.lastUpdated,
      dateCreated: projectData.createdAt,
      versions,
    };
  }

  /**
   * Get versions for a project, filtered by server type and MC version
   */
  async getVersions(
    source: 'modrinth' | 'hangar',
    projectId: string,
    serverType?: string,
    mcVersion?: string
  ): Promise<MarketplaceVersionInfo[]> {
    if (source === 'modrinth') {
      const loaders = serverType ? getModrinthLoaders(serverType) : [];

      const params = new URLSearchParams();
      if (loaders.length) params.set('loaders', JSON.stringify(loaders));
      if (mcVersion) params.set('game_versions', JSON.stringify([mcVersion]));

      const versions = await fetchJson<ModrinthVersion[]>(
        `${MODRINTH_BASE}/project/${projectId}/version?${params}`
      );

      return versions.map((v) => {
        const primaryFile = v.files.find((f) => f.primary) || v.files[0];
        return {
          id: v.id,
          versionNumber: v.version_number,
          name: v.name,
          gameVersions: v.game_versions,
          loaders: v.loaders,
          downloadUrl: primaryFile?.url || '',
          fileName: primaryFile?.filename || '',
          fileSize: primaryFile?.size || 0,
          datePublished: v.date_published,
          changelog: v.changelog || undefined,
          dependencies: v.dependencies
            .filter((d) => d.dependency_type === 'required' || d.dependency_type === 'optional')
            .map((d) => ({
              projectId: d.project_id,
              dependencyType: d.dependency_type as 'required' | 'optional',
            })),
        };
      });
    }

    // Hangar
    const [owner, slug] = projectId.split('/');
    return getHangarVersions(owner, slug, mcVersion);
  }

  /**
   * Download and install a plugin/mod JAR into the server directory
   */
  async installPlugin(
    serverDir: string,
    serverType: string,
    downloadUrl: string,
    fileName: string,
    meta?: { source: 'modrinth' | 'hangar'; projectId: string; versionId: string; versionNumber: string; projectName: string }
  ): Promise<{ installedPath: string; fileName: string }> {
    const isModded = serverType === 'forge' || serverType === 'fabric';
    const targetDir = path.join(serverDir, isModded ? 'mods' : 'plugins');
    fs.mkdirSync(targetDir, { recursive: true });

    // Sanitize filename
    const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const destPath = path.join(targetDir, safeFileName);

    log.info({ downloadUrl, destPath }, 'Installing plugin/mod from marketplace');

    await downloadFile(downloadUrl, destPath);

    const stat = fs.statSync(destPath);
    log.info({ destPath, size: stat.size }, 'Plugin/mod installed');

    // Save metadata for update checking
    if (meta) {
      this.savePluginMeta(serverDir, safeFileName, meta);
    }

    return { installedPath: destPath, fileName: safeFileName };
  }

  /**
   * Save plugin marketplace metadata for update tracking
   */
  private savePluginMeta(serverDir: string, fileName: string, meta: { source: 'modrinth' | 'hangar'; projectId: string; versionId: string; versionNumber: string; projectName: string }) {
    const metaPath = path.join(serverDir, '.craftos-plugins.json');
    let metadata: Record<string, any> = {};
    try {
      if (fs.existsSync(metaPath)) {
        metadata = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      }
    } catch { /* ignore corrupt file */ }

    metadata[fileName] = {
      source: meta.source,
      projectId: meta.projectId,
      versionId: meta.versionId,
      versionNumber: meta.versionNumber,
      projectName: meta.projectName,
      installedAt: new Date().toISOString(),
    };

    fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2));
  }

  /**
   * Read plugin marketplace metadata
   */
  getPluginMeta(serverDir: string): Record<string, { source: 'modrinth' | 'hangar'; projectId: string; versionId: string; versionNumber: string; projectName: string; installedAt: string }> {
    const metaPath = path.join(serverDir, '.craftos-plugins.json');
    try {
      if (fs.existsSync(metaPath)) {
        return JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      }
    } catch { /* ignore */ }
    return {};
  }

  /**
   * Remove plugin metadata entry
   */
  removePluginMeta(serverDir: string, fileName: string): void {
    const metaPath = path.join(serverDir, '.craftos-plugins.json');
    try {
      if (fs.existsSync(metaPath)) {
        const metadata = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
        delete metadata[fileName];
        fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2));
      }
    } catch { /* ignore */ }
  }

  /**
   * Check installed plugins for updates
   */
  async checkUpdates(
    serverDir: string,
    serverType: string
  ): Promise<Array<{
    fileName: string;
    projectName: string;
    source: 'modrinth' | 'hangar';
    projectId: string;
    currentVersion: string;
    latestVersion: string;
    latestVersionId: string;
    downloadUrl: string;
    latestFileName: string;
  }>> {
    const meta = this.getPluginMeta(serverDir);
    const updates: Array<any> = [];

    for (const [fileName, info] of Object.entries(meta)) {
      try {
        const versions = await this.getVersions(info.source, info.projectId, serverType);
        if (versions.length === 0) continue;

        const latest = versions[0];
        if (latest.id !== info.versionId && latest.versionNumber !== info.versionNumber) {
          updates.push({
            fileName,
            projectName: info.projectName,
            source: info.source,
            projectId: info.projectId,
            currentVersion: info.versionNumber,
            latestVersion: latest.versionNumber,
            latestVersionId: latest.id,
            downloadUrl: latest.downloadUrl,
            latestFileName: latest.fileName,
          });
        }
      } catch (err) {
        log.warn({ fileName, error: err }, 'Failed to check updates for plugin');
      }
    }

    return updates;
  }

  /**
   * Get popular/trending categories for a server type
   */
  getCategories(serverType: string): Array<{ id: string; label: string }> {
    if (serverType === 'forge' || serverType === 'fabric') {
      return [
        { id: 'all', label: 'All' },
        { id: 'adventure', label: 'Adventure' },
        { id: 'cursed', label: 'Cursed' },
        { id: 'decoration', label: 'Decoration' },
        { id: 'economy', label: 'Economy' },
        { id: 'equipment', label: 'Equipment' },
        { id: 'food', label: 'Food' },
        { id: 'library', label: 'Library' },
        { id: 'magic', label: 'Magic' },
        { id: 'management', label: 'Management' },
        { id: 'minigame', label: 'Minigame' },
        { id: 'optimization', label: 'Optimization' },
        { id: 'storage', label: 'Storage' },
        { id: 'technology', label: 'Technology' },
        { id: 'transportation', label: 'Transportation' },
        { id: 'utility', label: 'Utility' },
        { id: 'worldgen', label: 'World Gen' },
      ];
    }

    // Bukkit/Spigot/Paper plugins
    return [
      { id: 'all', label: 'All' },
      { id: 'adventure', label: 'Adventure' },
      { id: 'chat', label: 'Chat' },
      { id: 'economy', label: 'Economy' },
      { id: 'game-mechanics', label: 'Game Mechanics' },
      { id: 'management', label: 'Management' },
      { id: 'minigame', label: 'Minigame' },
      { id: 'social', label: 'Social' },
      { id: 'technology', label: 'Technology' },
      { id: 'transportation', label: 'Transportation' },
      { id: 'utility', label: 'Utility' },
      { id: 'worldgen', label: 'World Gen' },
    ];
  }
}
