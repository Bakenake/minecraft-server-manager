import { Link } from 'react-router-dom';
import { LockClosedIcon, SparklesIcon, BoltIcon, CheckIcon } from '@heroicons/react/24/outline';
import { useSubscriptionStore } from '../stores/subscriptionStore';
import type { FeatureFlags } from '../types';

// Friendly labels for feature flags
const FEATURE_LABELS: Partial<Record<keyof FeatureFlags, string>> = {
  analytics: 'Analytics & Metrics',
  jvmTuner: 'JVM Tuner',
  crashAnalyzer: 'Crash Analyzer',
  marketplace: 'Plugin Marketplace',
  sftpAccess: 'SFTP Access',
  discordBridge: 'Discord Bridge',
  scheduledTasks: 'Scheduled Tasks',
  templates: 'Server Templates',
  logSearch: 'Log Search',
  apiKeys: 'API Keys',
  subuserPermissions: 'Sub-user Permissions',
  worldManagement: 'World Management',
  performanceMonitor: 'Performance Monitor',
  multiServer: 'Multiple Servers',
  advancedBackups: 'Advanced Backups',
  customJvmFlags: 'Custom JVM Flags',
  pluginManagement: 'Plugin Management',
  metricsHistory: 'Metrics History',
  backupRetention: 'Backup Retention Policies',
  backupDownload: 'Backup Downloads',
  modpackInstaller: 'Modpack Installer',
  consoleHistory: 'Console Command History',
  configValidator: 'Config Validator',
  startupHooks: 'Startup / Shutdown Hooks',
  playerGeoip: 'Player Geolocation',
  motdEditor: 'MOTD & Icon Editor',
  datapackManager: 'Datapack Manager',
  exportReports: 'Export Reports',
  prioritySupport: 'Priority Support',
};

const FEATURE_DESCRIPTIONS: Partial<Record<keyof FeatureFlags, string>> = {
  analytics: 'Track CPU, RAM, TPS, and player counts with historical charts.',
  jvmTuner: "Optimize your server with Aikar's flags and custom JVM profiles.",
  crashAnalyzer: 'Automatically detect and diagnose server crashes.',
  marketplace: 'Browse and install plugins from Modrinth and Hangar.',
  sftpAccess: 'Secure file transfer for remote server management.',
  discordBridge: 'Connect your server console to Discord channels.',
  scheduledTasks: 'Automate restarts, backups, and commands on a schedule.',
  templates: 'Save and restore server configurations instantly.',
  logSearch: 'Search server logs with regex and filters.',
  apiKeys: 'Create API keys for external integrations.',
  subuserPermissions: 'Assign granular permissions to sub-users.',
  worldManagement: 'Import, reset, and manage server worlds.',
  advancedBackups: 'Unlimited backups with retention policies and downloads.',
  multiServer: 'Run unlimited Minecraft servers simultaneously.',
  modpackInstaller: 'One-click modpack installation from CurseForge.',
  consoleHistory: 'Browse and re-run previous console commands.',
  configValidator: 'Validate server.properties and plugin configs.',
  exportReports: 'Export analytics data to CSV and PDF.',
};

interface PremiumBadgeProps {
  feature?: keyof FeatureFlags;
  className?: string;
  showTooltip?: boolean;
}

/**
 * Small badge to show next to premium-only features in the sidebar/UI
 */
export function PremiumBadge({ feature, className = '', showTooltip = true }: PremiumBadgeProps) {
  const hasFeature = useSubscriptionStore((s) => s.hasFeature);

  if (feature && hasFeature(feature)) return null;

  const tooltip = showTooltip && feature ? FEATURE_DESCRIPTIONS[feature] || 'Premium feature' : 'Premium feature';

  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-accent-500/20 text-accent-400 ${className}`}
      title={tooltip}
    >
      <SparklesIcon className="w-3 h-3" />
      PRO
    </span>
  );
}

interface PremiumGateProps {
  feature: keyof FeatureFlags;
  featureLabel?: string;
  children: React.ReactNode;
}

/**
 * Wraps content that requires a premium feature.
 * Shows an upgrade prompt with feature details if the user doesn't have it.
 */
export function PremiumGate({ feature, featureLabel, children }: PremiumGateProps) {
  const hasFeature = useSubscriptionStore((s) => s.hasFeature);
  const startCheckout = useSubscriptionStore((s) => s.startCheckout);

  if (hasFeature(feature)) {
    return <>{children}</>;
  }

  const label = featureLabel || FEATURE_LABELS[feature] || String(feature).replace(/([A-Z])/g, ' $1').trim();
  const description = FEATURE_DESCRIPTIONS[feature];

  // Show related premium features the user would unlock
  const relatedFeatures = getRelatedFeatures(feature);

  return (
    <div className="flex flex-col items-center justify-center py-16 px-8">
      <div className="w-16 h-16 bg-accent-500/10 rounded-2xl flex items-center justify-center mb-6 ring-2 ring-accent-500/20">
        <LockClosedIcon className="w-8 h-8 text-accent-400" />
      </div>
      <h2 className="text-xl font-bold text-dark-100 mb-2">
        {label}
      </h2>
      <div className="bg-accent-500/10 text-accent-400 text-xs font-bold px-3 py-1 rounded-full mb-4">
        PREMIUM FEATURE
      </div>
      <p className="text-dark-400 text-center max-w-md mb-6">
        {description || (
          <>
            <span className="text-dark-200 font-medium">{label}</span> is available with the Premium
            plan. Upgrade to unlock advanced features and take your server management to the next level.
          </>
        )}
      </p>

      {/* Related features you'd unlock */}
      {relatedFeatures.length > 0 && (
        <div className="bg-dark-800 rounded-lg p-4 mb-6 w-full max-w-md">
          <p className="text-xs text-dark-500 uppercase tracking-wider mb-3 font-medium">
            You'll also unlock:
          </p>
          <div className="grid grid-cols-2 gap-2">
            {relatedFeatures.map((f) => (
              <div key={f} className="flex items-center gap-2 text-sm">
                <CheckIcon className="w-3.5 h-3.5 text-accent-400 flex-shrink-0" />
                <span className="text-dark-300">{FEATURE_LABELS[f] || f}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <Link to="/subscription" className="btn btn-primary">
          <SparklesIcon className="w-4 h-4 mr-2" />
          View Plans & Pricing
        </Link>
        <button
          onClick={() => startCheckout('yearly')}
          className="btn btn-secondary"
        >
          <BoltIcon className="w-4 h-4 mr-2" />
          Quick Upgrade
        </button>
      </div>
      <p className="text-xs text-dark-500 mt-4">
        Already have a license key?{' '}
        <Link to="/subscription" className="text-accent-400 hover:underline">
          Activate it here
        </Link>
      </p>
    </div>
  );
}

interface UpgradePromptProps {
  message?: string;
  compact?: boolean;
  feature?: keyof FeatureFlags;
}

/**
 * Inline upgrade prompt shown when a gated API call returns PREMIUM_REQUIRED
 */
export function UpgradePrompt({ message, compact = false, feature }: UpgradePromptProps) {
  const label = feature ? FEATURE_LABELS[feature] : undefined;

  if (compact) {
    return (
      <div className="flex items-center gap-2 p-3 bg-accent-500/10 border border-accent-500/20 rounded-lg text-sm">
        <LockClosedIcon className="w-4 h-4 text-accent-400 flex-shrink-0" />
        <span className="text-dark-300">
          {message || (label ? `${label} requires Premium.` : 'This feature requires Premium.')}
        </span>
        <Link to="/subscription" className="text-accent-400 hover:underline ml-auto whitespace-nowrap">
          Upgrade
        </Link>
      </div>
    );
  }

  return (
    <div className="p-4 bg-accent-500/5 border border-accent-500/20 rounded-lg">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 bg-accent-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
          <SparklesIcon className="w-5 h-5 text-accent-400" />
        </div>
        <div className="flex-1">
          <h4 className="text-dark-100 font-medium">Upgrade to Premium</h4>
          <p className="text-dark-400 text-sm mt-1">
            {message || (label ? `${label} is available with a Premium subscription.` : 'This feature is available with a Premium subscription.')}
          </p>
          <div className="flex gap-2 mt-3">
            <Link to="/subscription" className="btn btn-primary btn-sm inline-flex">
              View Plans
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Get a few related premium features to show as "You'll also unlock"
 */
function getRelatedFeatures(feature: keyof FeatureFlags): (keyof FeatureFlags)[] {
  const groups: Record<string, (keyof FeatureFlags)[]> = {
    server: ['multiServer', 'customJvmFlags', 'jvmTuner', 'startupHooks', 'motdEditor'],
    files: ['sftpAccess', 'configValidator', 'datapackManager', 'pluginManagement', 'marketplace'],
    backup: ['advancedBackups', 'backupRetention', 'backupDownload', 'worldManagement'],
    players: ['subuserPermissions', 'apiKeys', 'playerGeoip'],
    analytics: ['analytics', 'performanceMonitor', 'metricsHistory', 'crashAnalyzer', 'exportReports', 'logSearch'],
    automation: ['scheduledTasks', 'templates', 'discordBridge', 'consoleHistory'],
  };

  for (const [, members] of Object.entries(groups)) {
    if (members.includes(feature)) {
      return members.filter((f) => f !== feature).slice(0, 4);
    }
  }

  // Fallback: show a few popular features
  return ['multiServer', 'advancedBackups', 'scheduledTasks', 'analytics'].filter(
    (f) => f !== feature,
  ) as (keyof FeatureFlags)[];
}
