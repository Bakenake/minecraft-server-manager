// ─── Server Types ──────────────────────────────────────────
export type ServerType = 'vanilla' | 'paper' | 'spigot' | 'forge' | 'fabric' | 'bungeecord' | 'waterfall' | 'velocity' | 'purpur' | 'sponge';
export type ProxyType = 'bungeecord' | 'waterfall' | 'velocity';
export type NetworkStatus = 'stopped' | 'starting' | 'running' | 'stopping' | 'degraded';
export type ServerStatus = 'stopped' | 'starting' | 'running' | 'stopping' | 'crashed';
export type UserRole = 'admin' | 'moderator' | 'viewer';

export interface Server {
  id: string;
  name: string;
  type: ServerType;
  version: string;
  directory: string;
  jarFile: string;
  javaPath: string;
  minRam: number;
  maxRam: number;
  jvmFlags: string;
  port: number;
  autoStart: boolean;
  autoRestart: boolean;
  maxPlayers: number;
  status: ServerStatus;
  pid: number | null;
  createdAt: string;
  updatedAt: string;
  // Runtime
  uptime?: number;
  playerCount?: number;
  players?: string[];
  tps?: number;
  cpuUsage?: number;
  ramUsage?: number;
}

export interface ServerMetric {
  id: number;
  serverId: string;
  cpuUsage: number;
  ramUsage: number;
  tps: number;
  playerCount: number;
  diskUsage?: number;
  networkIn?: number;
  networkOut?: number;
  timestamp: string;
}

// ─── User Types ────────────────────────────────────────────
export interface User {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  totpEnabled: boolean;
  createdAt?: string;
  lastLoginAt?: string;
}

export interface LoginResponse {
  token: string;
  user: User;
  requiresTwoFactor?: boolean;
}

// ─── Player Types ──────────────────────────────────────────
export interface Player {
  id: number;
  uuid: string;
  username: string;
  firstSeen: string;
  lastSeen: string;
  playTime: number;
  isOnline: boolean;
  serverId: string | null;
}

export interface Ban {
  id: number;
  playerUuid: string;
  playerName: string;
  serverId: string;
  reason: string;
  bannedBy: string;
  expiresAt: string | null;
  isPermanent: boolean;
  isActive: boolean;
  createdAt: string;
}

// ─── Backup Types ──────────────────────────────────────────
export interface Backup {
  id: string;
  serverId: string;
  name: string;
  fileName: string;
  filePath: string;
  fileSize: number;
  type: 'manual' | 'scheduled' | 'pre_update';
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  error?: string;
  createdAt: string;
  completedAt?: string;
}

// ─── File Types ────────────────────────────────────────────
export interface FileEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size: number;
  modified: string;
}

// ─── Plugin Types ──────────────────────────────────────────
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

// ─── Marketplace Types ─────────────────────────────────────
export interface MarketplaceSearchResult {
  source: 'modrinth' | 'hangar';
  id: string;
  name: string;
  slug: string;
  description: string;
  author: string;
  downloads: number;
  iconUrl: string | null;
  categories: string[];
  serverTypes: string[];
  gameVersions: string[];
  url: string;
  dateUpdated: string;
  dateCreated: string;
}

export interface MarketplaceVersionInfo {
  id: string;
  versionNumber: string;
  name: string;
  gameVersions: string[];
  loaders: string[];
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

export interface MarketplaceCategory {
  id: string;
  label: string;
}

// ─── System Types ──────────────────────────────────────────
export interface SystemMetrics {
  cpu: {
    usage: number;
    cores: number;
    model: string;
    speed: number;
    temperature?: number;
  };
  memory: {
    total: number;
    used: number;
    free: number;
    usagePercent: number;
  };
  disk: {
    total: number;
    used: number;
    free: number;
    usagePercent: number;
  };
  network: {
    bytesIn: number;
    bytesOut: number;
  };
  os: {
    platform: string;
    distro: string;
    release: string;
    arch: string;
    uptime: number;
  };
}

export interface SystemInfo {
  version: string;
  nodeVersion: string;
  platform: string;
  arch: string;
  uptime: number;
  features: {
    telemetry: boolean;
    autoUpdate: boolean;
    twoFactor: boolean;
  };
}

// ─── Scheduled Task Types ──────────────────────────────────
export interface ScheduledTask {
  id: string;
  serverId: string;
  type: 'restart' | 'backup' | 'command';
  cronExpression: string;
  command?: string;
  enabled: boolean;
  lastRunAt?: string;
  nextRunAt?: string;
  createdAt: string;
}

// ─── WebSocket Message Types ───────────────────────────────
export interface WsMessage {
  type: string;
  data: Record<string, unknown>;
}

// ─── Java Types ────────────────────────────────────────────
export interface JavaInstallation {
  path: string;
  version: string;
  majorVersion: number;
  isJdk: boolean;
  arch: string;
}

// ─── Subscription / License Types ──────────────────────────
export interface FeatureFlags {
  basicServerManagement: boolean;
  console: boolean;
  basicFileManager: boolean;
  basicPlayerManagement: boolean;
  analytics: boolean;
  jvmTuner: boolean;
  crashAnalyzer: boolean;
  marketplace: boolean;
  sftpAccess: boolean;
  discordBridge: boolean;
  scheduledTasks: boolean;
  templates: boolean;
  logSearch: boolean;
  apiKeys: boolean;
  subuserPermissions: boolean;
  worldManagement: boolean;
  performanceMonitor: boolean;
  multiServer: boolean;
  advancedBackups: boolean;
  customJvmFlags: boolean;
  pluginManagement: boolean;
  metricsHistory: boolean;
  backupRetention: boolean;
  backupDownload: boolean;
  modpackInstaller: boolean;
  networkProxy: boolean;
  autoScaling: boolean;
  consoleHistory: boolean;
  configValidator: boolean;
  startupHooks: boolean;
  playerGeoip: boolean;
  motdEditor: boolean;
  datapackManager: boolean;
  exportReports: boolean;
  prioritySupport: boolean;

  // Expanded Tools
  resourceCalculator: boolean;
  serverBenchmark: boolean;
  configOptimizer: boolean;
  bulkServerActions: boolean;
  serverMigration: boolean;

  // Expanded Logs & Crashes
  logStreaming: boolean;
  logAlerts: boolean;
  crashAutoFix: boolean;
  logRotation: boolean;
  logExport: boolean;

  // Expanded Templates
  templateSharing: boolean;
  templateVersioning: boolean;
  templateScheduling: boolean;
  templateVariables: boolean;

  // Expanded Analytics
  chatAnalytics: boolean;
  tpsPrediction: boolean;
  serverComparison: boolean;
  customDashboards: boolean;
  uptimeMonitoring: boolean;

  // Expanded Worlds
  worldBorder: boolean;
  worldImportExport: boolean;
  worldCloning: boolean;
  worldPregen: boolean;
  biomeFinder: boolean;

  // Expanded Performance
  memoryLeakDetection: boolean;
  gcAnalysis: boolean;
  tpsOptimizer: boolean;
  autoRestartLowTps: boolean;
  resourceForecasting: boolean;
}

export interface TierLimits {
  maxServers: number;
  maxRamMb: number;
  maxPlayers: number;
  maxBackups: number;
  maxPlugins: number;
  metricsRetentionHours: number;
  allowedServerTypes: string[];
  features: FeatureFlags;
}

export interface SubscriptionStatus {
  tier: 'free' | 'premium';
  status: string;
  licenseKey: string | null;
  maskedKey: string | null;
  expiresAt: string | null;
  hardwareId: string;
  limits: TierLimits;
  features: FeatureFlags;
  stripeCustomerId: string | null;
}

export interface FeatureComparisonItem {
  category: string;
  feature: string;
  free: boolean | string;
  premium: boolean | string;
  icon: string;
}

export interface PricingPlan {
  price: number;
  currency: string;
  stripePriceId: string;
  savings?: string;
  badge?: string;
}

export interface TierInfo {
  id: string;
  name: string;
  price: number;
  priceYearly: number;
  description: string;
  limits: TierLimits;
  highlights: string[];
}

export interface TiersResponse {
  tiers: TierInfo[];
  featureComparison: FeatureComparisonItem[];
  pricing: {
    monthly: PricingPlan;
    yearly: PricingPlan;
    lifetime: PricingPlan;
  };
}

export interface PremiumGateError {
  error: string;
  code: 'PREMIUM_REQUIRED' | 'SERVER_LIMIT' | 'RAM_LIMIT' | 'SERVER_TYPE_RESTRICTED';
  feature?: string;
  currentTier: string;
  requiredTier: string;
  message: string;
  upgradeUrl: string;
}

// ─── Network / Proxy Types ────────────────────────────────
export interface NetworkServer {
  id: number;
  networkId: string;
  serverId: string;
  serverAlias: string;
  isDefault: boolean;
  isFallback: boolean;
  restricted: boolean;
  priority: number;
  createdAt: string;
  // Enriched fields
  serverName: string;
  serverStatus: string;
  serverPort: number;
  playerCount?: number;
}

export interface ServerNetwork {
  id: string;
  name: string;
  description: string;
  proxyType: ProxyType;
  proxyServerId: string | null;
  proxyPort: number;
  motd: string;
  maxPlayers: number;
  onlineMode: boolean;
  ipForwarding: boolean;
  status: NetworkStatus;
  autoStart: boolean;
  createdAt: string;
  updatedAt: string;
  // Enriched
  servers: NetworkServer[];
  proxyServerName?: string;
  proxyServerStatus?: string;
}

export interface ProxyConfig {
  proxyType: ProxyType;
  listeners: Array<{
    host: string;
    port: number;
    motd: string;
    maxPlayers: number;
    onlineMode: boolean;
  }>;
  servers: Record<string, {
    address: string;
    restricted: boolean;
    motd: string;
  }>;
  ipForwarding: boolean;
  defaultServer: string;
  fallbackServer: string;
}

export interface AvailableServer {
  id: string;
  name: string;
  type: string;
  port: number;
  status: string;
}
