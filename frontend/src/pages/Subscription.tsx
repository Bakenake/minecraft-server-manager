import { useEffect, useState, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useSubscriptionStore } from '../stores/subscriptionStore';
import { cn } from '../lib/utils';
import api from '../lib/api';
import {
  CheckIcon,
  XMarkIcon,
  KeyIcon,
  SparklesIcon,
  ShieldCheckIcon,
  ArrowPathIcon,
  ClipboardDocumentIcon,
  CreditCardIcon,
  ServerIcon,
  FolderIcon,
  CloudArrowUpIcon,
  UserGroupIcon,
  ChartBarIcon,
  CogIcon,
  StarIcon,
  BoltIcon,
  WrenchScrewdriverIcon,
  DocumentMagnifyingGlassIcon,
  DocumentDuplicateIcon,
  GlobeAltIcon,
  CpuChipIcon,
  SignalIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  ClockIcon,
  BeakerIcon,
} from '@heroicons/react/24/outline';

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  'Server Management': ServerIcon,
  'Files & Plugins': FolderIcon,
  'Backups': CloudArrowUpIcon,
  'Players & Security': UserGroupIcon,
  'Analytics & Monitoring': ChartBarIcon,
  'Network & Proxy': SignalIcon,
  'Tools & Utilities': WrenchScrewdriverIcon,
  'Logs & Crash Analysis': DocumentMagnifyingGlassIcon,
  'Templates': DocumentDuplicateIcon,
  'Worlds': GlobeAltIcon,
  'Performance': CpuChipIcon,
  'Automation & Integrations': CogIcon,
  'Experience': StarIcon,
};

export default function Subscription() {
  const {
    status,
    tiers,
    featureComparison,
    pricing,
    loading,
    checkoutLoading,
    error,
    fetchStatus,
    fetchTiers,
    activateLicense,
    deactivateLicense,
    startCheckout,
    openPortal,
  } = useSubscriptionStore();

  const [searchParams, setSearchParams] = useSearchParams();
  const [licenseKey, setLicenseKey] = useState('');
  const [activationMessage, setActivationMessage] = useState('');
  const [activationSuccess, setActivationSuccess] = useState(false);
  const [showActivate, setShowActivate] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'yearly' | 'lifetime'>('yearly');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  // Redemption modal state
  const [showRedemptionModal, setShowRedemptionModal] = useState(false);
  const [redemptionResult, setRedemptionResult] = useState<{
    success: boolean;
    message: string;
    tier?: string;
    expiresAt?: string | null;
    licenseKey?: string;
  } | null>(null);

  // Trial key state
  const [trialKey, setTrialKey] = useState<string | null>(null);
  const [trialExpiry, setTrialExpiry] = useState<string | null>(null);
  const [trialCountdown, setTrialCountdown] = useState<string>('');
  const [generatingTrial, setGeneratingTrial] = useState(false);
  const [trialMinutes, setTrialMinutes] = useState(15);

  // Admin key management state
  const [generatedKeys, setGeneratedKeys] = useState<any[]>([]);
  const [loadingKeys, setLoadingKeys] = useState(false);
  const [generatingKey, setGeneratingKey] = useState(false);
  const [newKeyEmail, setNewKeyEmail] = useState('');
  const [newKeyNote, setNewKeyNote] = useState('');
  const [newKeyDuration, setNewKeyDuration] = useState<'monthly' | 'yearly' | 'lifetime'>('lifetime');
  const [showKeyManager, setShowKeyManager] = useState(false);
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);

  useEffect(() => {
    fetchStatus();
    fetchTiers();
  }, []);

  // Handle checkout return params
  useEffect(() => {
    const checkoutResult = searchParams.get('checkout');
    if (checkoutResult === 'success') {
      setRedemptionResult({
        success: true,
        message: 'Payment successful! Your premium license is being activated...',
      });
      setShowRedemptionModal(true);
      fetchStatus();
      setSearchParams({}, { replace: true });
    } else if (checkoutResult === 'cancelled') {
      setRedemptionResult({
        success: false,
        message: 'Checkout was cancelled. No charges were made.',
      });
      setShowRedemptionModal(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams]);

  // Countdown timer for trial keys and premium expiry
  useEffect(() => {
    const expirySource = trialExpiry || (status?.tier === 'premium' && status?.expiresAt ? status.expiresAt : null);
    if (!expirySource) {
      setTrialCountdown('');
      return;
    }
    const tick = () => {
      const diff = new Date(expirySource).getTime() - Date.now();
      if (diff <= 0) {
        setTrialCountdown('Expired');
        setTrialKey(null);
        setTrialExpiry(null);
        fetchStatus(); // Refresh to reflect expired state
        return;
      }
      const hrs = Math.floor(diff / 3600000);
      const mins = Math.floor((diff % 3600000) / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      setTrialCountdown(hrs > 0 ? `${hrs}h ${mins}m ${secs}s` : `${mins}m ${secs}s`);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [trialExpiry, status?.expiresAt, status?.tier]);

  const handleActivate = async () => {
    if (!licenseKey.trim()) return;
    const result = await activateLicense(licenseKey.trim());

    setRedemptionResult({
      success: result.success,
      message: result.message,
      tier: result.success ? 'premium' : undefined,
    });
    setShowRedemptionModal(true);

    if (result.success) {
      setLicenseKey('');
      setShowActivate(false);
    }
  };

  const handleGenerateTrialKey = async () => {
    setGeneratingTrial(true);
    try {
      const { data } = await api.post('/subscription/create-trial-key', {
        durationMinutes: trialMinutes,
      });
      setTrialKey(data.licenseKey);
      setTrialExpiry(data.expiresAt);
      setRedemptionResult({
        success: true,
        message: `Trial key generated! Valid for ${data.durationMinutes} minutes. Copy and activate it below.`,
        licenseKey: data.licenseKey,
        expiresAt: data.expiresAt,
      });
      setShowRedemptionModal(true);
    } catch (err: any) {
      setRedemptionResult({
        success: false,
        message: err.response?.data?.error || 'Failed to generate trial key',
      });
      setShowRedemptionModal(true);
    } finally {
      setGeneratingTrial(false);
    }
  };

  // ─── Admin key management handlers ──────────────────────
  const fetchKeys = useCallback(async () => {
    setLoadingKeys(true);
    try {
      const { data } = await api.get('/subscription/keys');
      setGeneratedKeys(data.keys || []);
    } catch {
      // Non-admin or error — silently fail
    } finally {
      setLoadingKeys(false);
    }
  }, []);

  const handleGenerateKey = async () => {
    setGeneratingKey(true);
    try {
      const { data } = await api.post('/subscription/generate-key', {
        email: newKeyEmail || undefined,
        note: newKeyNote || undefined,
        duration: newKeyDuration,
      });
      toast.success(`Key generated: ${data.licenseKey}`);
      setNewKeyEmail('');
      setNewKeyNote('');
      // Copy to clipboard automatically
      navigator.clipboard.writeText(data.licenseKey);
      setCopiedKeyId(data.id);
      setTimeout(() => setCopiedKeyId(null), 3000);
      fetchKeys();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to generate key');
    } finally {
      setGeneratingKey(false);
    }
  };

  const handleRevokeKey = async (id: string, key: string) => {
    if (!confirm(`Revoke key ${key}? This cannot be undone and will deactivate the user's premium access.`)) return;
    try {
      await api.post(`/subscription/keys/${id}/revoke`);
      toast.success('Key revoked');
      fetchKeys();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to revoke key');
    }
  };

  const copyKey = (key: string, id: string) => {
    navigator.clipboard.writeText(key);
    setCopiedKeyId(id);
    toast.success('Key copied to clipboard');
    setTimeout(() => setCopiedKeyId(null), 3000);
  };

  // Load keys when key manager is opened
  useEffect(() => {
    if (showKeyManager) fetchKeys();
  }, [showKeyManager, fetchKeys]);

  const handleDeactivate = async () => {
    if (!confirm('Are you sure you want to deactivate your license? You can reactivate it later.')) return;
    const result = await deactivateLicense();
    setActivationMessage(result.message);
    setActivationSuccess(result.success);
  };

  const handleCheckout = async (plan: 'monthly' | 'yearly' | 'lifetime') => {
    const result = await startCheckout(plan);
    if (!result.success) {
      setActivationMessage(result.error || 'Checkout failed');
      setActivationSuccess(false);
    }
  };

  const handleManageBilling = async () => {
    const result = await openPortal();
    if (!result.success) {
      setActivationMessage(result.error || 'Could not open billing portal');
      setActivationSuccess(false);
    }
  };

  const copyHardwareId = () => {
    if (status?.hardwareId) {
      navigator.clipboard.writeText(status.hardwareId);
    }
  };

  // Group comparison items by category
  const groupedComparison = useMemo(() => {
    const groups: Record<string, typeof featureComparison> = {};
    featureComparison.forEach((item) => {
      if (!groups[item.category]) groups[item.category] = [];
      groups[item.category].push(item);
    });
    return groups;
  }, [featureComparison]);

  const categories = Object.keys(groupedComparison);

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-dark-100">Subscription</h1>
          <p className="text-dark-400 mt-1">
            Manage your CraftOS license and unlock premium features
          </p>
        </div>
        <button
          onClick={fetchStatus}
          disabled={loading}
          className="btn btn-secondary flex items-center gap-2"
        >
          <ArrowPathIcon className={cn('w-4 h-4', loading && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {/* ─── Redemption Result Modal ───── */}
      {showRedemptionModal && redemptionResult && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className={cn(
            'bg-dark-900 rounded-2xl border max-w-md w-full p-8 shadow-2xl transform transition-all animate-in fade-in zoom-in-95 duration-300',
            redemptionResult.success ? 'border-accent-500/30' : 'border-danger-500/30',
          )}>
            {/* Icon */}
            <div className="flex justify-center mb-6">
              <div className={cn(
                'w-20 h-20 rounded-full flex items-center justify-center',
                redemptionResult.success
                  ? 'bg-accent-500/20 ring-4 ring-accent-500/10'
                  : 'bg-danger-500/20 ring-4 ring-danger-500/10',
              )}>
                {redemptionResult.success ? (
                  <CheckCircleIcon className="w-10 h-10 text-accent-400" />
                ) : (
                  <ExclamationCircleIcon className="w-10 h-10 text-danger-400" />
                )}
              </div>
            </div>

            {/* Title */}
            <h3 className={cn(
              'text-xl font-bold text-center mb-2',
              redemptionResult.success ? 'text-accent-400' : 'text-danger-400',
            )}>
              {redemptionResult.success ? 'Success!' : 'Activation Failed'}
            </h3>

            {/* Message */}
            <p className="text-dark-300 text-center text-sm mb-6">
              {redemptionResult.message}
            </p>

            {/* License Key Display (for trial keys) */}
            {redemptionResult.licenseKey && (
              <div className="bg-dark-800 rounded-lg p-4 mb-4">
                <p className="text-xs text-dark-500 uppercase tracking-wider mb-2 text-center">Your Trial Key</p>
                <div className="flex items-center gap-2">
                  <code className="text-accent-400 font-mono text-sm flex-1 text-center tracking-widest">
                    {redemptionResult.licenseKey}
                  </code>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(redemptionResult.licenseKey!);
                    }}
                    className="text-dark-400 hover:text-dark-200 p-1"
                    title="Copy key"
                  >
                    <ClipboardDocumentIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Expiry Info */}
            {redemptionResult.expiresAt && (
              <div className="flex items-center justify-center gap-2 text-sm text-dark-400 mb-6">
                <ClockIcon className="w-4 h-4" />
                <span>Expires: {new Date(redemptionResult.expiresAt).toLocaleString()}</span>
              </div>
            )}

            {/* Tier Badge */}
            {redemptionResult.success && redemptionResult.tier && (
              <div className="flex justify-center mb-6">
                <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-accent-500/20 text-accent-400 text-sm font-semibold">
                  <SparklesIcon className="w-4 h-4" />
                  {redemptionResult.tier.charAt(0).toUpperCase() + redemptionResult.tier.slice(1)} Tier Activated
                </span>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3">
              {redemptionResult.licenseKey && (
                <button
                  onClick={() => {
                    setLicenseKey(redemptionResult.licenseKey!);
                    setShowActivate(true);
                    setShowRedemptionModal(false);
                  }}
                  className="btn btn-primary flex-1"
                >
                  <KeyIcon className="w-4 h-4 mr-2" />
                  Activate Now
                </button>
              )}
              <button
                onClick={() => setShowRedemptionModal(false)}
                className={cn(
                  redemptionResult.licenseKey ? 'btn btn-secondary flex-1' : 'btn btn-primary w-full',
                )}
              >
                {redemptionResult.licenseKey ? 'Later' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Status Messages (inline fallback) */}
      {activationMessage && (
        <div
          className={cn(
            'p-4 rounded-lg border flex items-center gap-3',
            activationSuccess
              ? 'bg-success-500/10 border-success-500/30 text-success-400'
              : 'bg-danger-500/10 border-danger-500/30 text-danger-400',
          )}
        >
          {activationSuccess ? (
            <CheckIcon className="w-5 h-5 flex-shrink-0" />
          ) : (
            <XMarkIcon className="w-5 h-5 flex-shrink-0" />
          )}
          {activationMessage}
          <button
            onClick={() => setActivationMessage('')}
            className="ml-auto text-dark-400 hover:text-dark-200"
          >
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>
      )}

      {error && !activationMessage && (
        <div className="p-4 rounded-lg border bg-danger-500/10 border-danger-500/30 text-danger-400">
          {error}
        </div>
      )}

      {/* Current Plan Card */}
      {status && (
        <div className={cn(
          'card border',
          status.tier === 'premium' ? 'border-accent-500/30' : 'border-dark-700',
        )}>
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              {status.tier === 'premium' ? (
                <div className="w-12 h-12 bg-accent-500/20 rounded-xl flex items-center justify-center">
                  <SparklesIcon className="w-6 h-6 text-accent-400" />
                </div>
              ) : (
                <div className="w-12 h-12 bg-dark-700 rounded-xl flex items-center justify-center">
                  <ShieldCheckIcon className="w-6 h-6 text-dark-400" />
                </div>
              )}
              <div>
                <h2 className="text-lg font-semibold text-dark-100">
                  {status.tier === 'premium' ? 'Premium' : 'Free'} Plan
                </h2>
                <p className="text-sm text-dark-400">
                  Status:{' '}
                  <span
                    className={cn(
                      status.status === 'active' || status.status === 'free'
                        ? 'text-success-400'
                        : 'text-danger-400',
                    )}
                  >
                    {status.status.charAt(0).toUpperCase() + status.status.slice(1)}
                  </span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {status.tier === 'premium' && status.stripeCustomerId && (
                <button
                  onClick={handleManageBilling}
                  className="btn btn-secondary text-sm flex items-center gap-2"
                >
                  <CreditCardIcon className="w-4 h-4" />
                  Manage Billing
                </button>
              )}
              {status.tier === 'premium' && (
                <button
                  onClick={handleDeactivate}
                  className="btn btn-secondary text-sm"
                >
                  Deactivate
                </button>
              )}
            </div>
          </div>

          {/* License Details */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-dark-800 rounded-lg p-4">
              <p className="text-xs text-dark-500 uppercase tracking-wider mb-1">License Key</p>
              <p className="text-dark-200 font-mono text-sm">
                {status.maskedKey || 'No license activated'}
              </p>
            </div>

            <div className="bg-dark-800 rounded-lg p-4">
              <p className="text-xs text-dark-500 uppercase tracking-wider mb-1">Expires</p>
              <p className="text-dark-200 text-sm">
                {status.expiresAt
                  ? new Date(status.expiresAt).toLocaleDateString()
                  : status.tier === 'premium'
                    ? 'Lifetime'
                    : 'N/A'}
              </p>
              {trialCountdown && status.tier === 'premium' && status.expiresAt && (
                <p className="text-xs mt-1 font-mono text-warning-400 flex items-center gap-1">
                  <ClockIcon className="w-3 h-3" />
                  {trialCountdown}
                </p>
              )}
            </div>

            <div className="bg-dark-800 rounded-lg p-4">
              <p className="text-xs text-dark-500 uppercase tracking-wider mb-1">Hardware ID</p>
              <div className="flex items-center gap-2">
                <p className="text-dark-200 font-mono text-xs truncate">
                  {status.hardwareId}
                </p>
                <button
                  onClick={copyHardwareId}
                  className="text-dark-400 hover:text-dark-200 flex-shrink-0"
                  title="Copy to clipboard"
                >
                  <ClipboardDocumentIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Quick Limits Overview */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { label: 'Servers', value: status.limits.maxServers === -1 ? '∞' : status.limits.maxServers },
              { label: 'Max RAM', value: status.limits.maxRamMb === -1 ? '∞' : `${(status.limits.maxRamMb / 1024).toFixed(0)}G` },
              { label: 'Players', value: status.limits.maxPlayers === -1 ? '∞' : status.limits.maxPlayers },
              { label: 'Backups', value: (status.limits.maxBackups ?? 0) === -1 ? '∞' : (status.limits.maxBackups ?? 3) },
              { label: 'Plugins', value: (status.limits.maxPlugins ?? 0) === -1 ? '∞' : (status.limits.maxPlugins ?? 5) },
            ].map((item) => (
              <div key={item.label} className="text-center p-3 bg-dark-800 rounded-lg">
                <p className="text-2xl font-bold text-dark-100">{item.value}</p>
                <p className="text-xs text-dark-500">{item.label}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Pricing Cards (only show for free users) ───── */}
      {status?.tier !== 'premium' && pricing && (
        <div>
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-dark-100 mb-2">
              Upgrade to Premium
            </h2>
            <p className="text-dark-400 max-w-lg mx-auto">
              Unlock the full power of CraftOS with unlimited servers, advanced analytics,
              automation, and 30+ premium features.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Monthly */}
            <div
              className={cn(
                'card border cursor-pointer transition-all hover:border-accent-500/30',
                selectedPlan === 'monthly' ? 'border-accent-500/50 ring-1 ring-accent-500/30' : 'border-dark-700',
              )}
              onClick={() => setSelectedPlan('monthly')}
            >
              <div className="text-center">
                <h3 className="text-lg font-semibold text-dark-200">Monthly</h3>
                <div className="mt-3">
                  <span className="text-4xl font-bold text-dark-100">${pricing.monthly.price}</span>
                  <span className="text-dark-400">/mo</span>
                </div>
                <p className="text-sm text-dark-500 mt-2">Billed monthly, cancel anytime</p>
                <button
                  onClick={(e) => { e.stopPropagation(); handleCheckout('monthly'); }}
                  disabled={checkoutLoading}
                  className="btn btn-secondary w-full mt-4"
                >
                  {checkoutLoading && selectedPlan === 'monthly' ? 'Processing...' : 'Choose Monthly'}
                </button>
              </div>
            </div>

            {/* Yearly */}
            <div
              className={cn(
                'card border cursor-pointer transition-all hover:border-accent-500/30 relative',
                selectedPlan === 'yearly' ? 'border-accent-500/50 ring-2 ring-accent-500/30' : 'border-dark-700',
              )}
              onClick={() => setSelectedPlan('yearly')}
            >
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-accent-500 text-white text-xs font-bold px-3 py-1 rounded-full">
                SAVE {pricing.yearly.savings || '17%'}
              </div>
              <div className="text-center">
                <h3 className="text-lg font-semibold text-dark-200">Yearly</h3>
                <div className="mt-3">
                  <span className="text-4xl font-bold text-dark-100">${pricing.yearly.price}</span>
                  <span className="text-dark-400">/yr</span>
                </div>
                <p className="text-sm text-dark-500 mt-2">
                  ${(pricing.yearly.price / 12).toFixed(2)}/mo, billed annually
                </p>
                <button
                  onClick={(e) => { e.stopPropagation(); handleCheckout('yearly'); }}
                  disabled={checkoutLoading}
                  className="btn btn-primary w-full mt-4"
                >
                  <SparklesIcon className="w-4 h-4 mr-2" />
                  {checkoutLoading && selectedPlan === 'yearly' ? 'Processing...' : 'Choose Yearly'}
                </button>
              </div>
            </div>

            {/* Lifetime */}
            <div
              className={cn(
                'card border cursor-pointer transition-all hover:border-accent-500/30 relative',
                selectedPlan === 'lifetime' ? 'border-accent-500/50 ring-1 ring-accent-500/30' : 'border-dark-700',
              )}
              onClick={() => setSelectedPlan('lifetime')}
            >
              {pricing.lifetime.badge && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-success-500 text-white text-xs font-bold px-3 py-1 rounded-full">
                  {pricing.lifetime.badge.toUpperCase()}
                </div>
              )}
              <div className="text-center">
                <h3 className="text-lg font-semibold text-dark-200">Lifetime</h3>
                <div className="mt-3">
                  <span className="text-4xl font-bold text-dark-100">${pricing.lifetime.price}</span>
                  <span className="text-dark-400"> once</span>
                </div>
                <p className="text-sm text-dark-500 mt-2">One-time payment, yours forever</p>
                <button
                  onClick={(e) => { e.stopPropagation(); handleCheckout('lifetime'); }}
                  disabled={checkoutLoading}
                  className="btn btn-secondary w-full mt-4"
                >
                  {checkoutLoading && selectedPlan === 'lifetime' ? 'Processing...' : 'Choose Lifetime'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Admin Key Manager ───── */}
      <div className="card">
        <button
          onClick={() => setShowKeyManager(!showKeyManager)}
          className="w-full flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-accent-500/10 rounded-lg flex items-center justify-center">
              <KeyIcon className="w-5 h-5 text-accent-400" />
            </div>
            <div className="text-left">
              <h3 className="text-lg font-semibold text-dark-100">License Key Manager</h3>
              <p className="text-xs text-dark-500">Generate, view, and manage premium keys to give to users</p>
            </div>
          </div>
          <CogIcon className={cn('w-5 h-5 text-dark-400 transition-transform', showKeyManager && 'rotate-90')} />
        </button>

        {showKeyManager && (
          <div className="mt-6 space-y-6">
            {/* Generate New Key Form */}
            <div className="p-4 bg-dark-800 rounded-lg border border-dark-700">
              <h4 className="text-sm font-medium text-dark-200 mb-3">Generate New Key</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                <div>
                  <label className="block text-xs text-dark-500 mb-1">Recipient Email (optional)</label>
                  <input
                    type="email"
                    value={newKeyEmail}
                    onChange={(e) => setNewKeyEmail(e.target.value)}
                    placeholder="user@example.com"
                    className="input w-full text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-dark-500 mb-1">Note (optional)</label>
                  <input
                    type="text"
                    value={newKeyNote}
                    onChange={(e) => setNewKeyNote(e.target.value)}
                    placeholder="e.g. Beta tester reward"
                    className="input w-full text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-dark-500 mb-1">Duration</label>
                  <div className="flex gap-2">
                    {(['monthly', 'yearly', 'lifetime'] as const).map((dur) => (
                      <button
                        key={dur}
                        onClick={() => setNewKeyDuration(dur)}
                        className={cn(
                          'px-3 py-2 rounded-lg text-xs font-medium transition-all flex-1',
                          newKeyDuration === dur
                            ? 'bg-accent-500 text-white'
                            : 'bg-dark-700 text-dark-300 hover:bg-dark-600',
                        )}
                      >
                        {dur.charAt(0).toUpperCase() + dur.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <button
                onClick={handleGenerateKey}
                disabled={generatingKey}
                className="btn btn-primary text-sm flex items-center gap-2"
              >
                <KeyIcon className="w-4 h-4" />
                {generatingKey ? 'Generating...' : 'Generate Premium Key'}
              </button>
            </div>

            {/* Keys List */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-medium text-dark-200">
                  Generated Keys ({generatedKeys.length})
                </h4>
                <button
                  onClick={fetchKeys}
                  disabled={loadingKeys}
                  className="text-dark-400 hover:text-dark-200 text-xs flex items-center gap-1"
                >
                  <ArrowPathIcon className={cn('w-3 h-3', loadingKeys && 'animate-spin')} />
                  Refresh
                </button>
              </div>

              {loadingKeys ? (
                <div className="text-center py-8 text-dark-500 text-sm">Loading keys...</div>
              ) : generatedKeys.length === 0 ? (
                <div className="text-center py-8 text-dark-500 text-sm">
                  No keys generated yet. Create one above to give to a user.
                </div>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {generatedKeys.map((k) => (
                    <div
                      key={k.id}
                      className={cn(
                        'flex items-center gap-3 p-3 rounded-lg border',
                        k.status === 'revoked'
                          ? 'bg-danger-500/5 border-danger-500/20 opacity-60'
                          : k.isExpired
                            ? 'bg-warning-500/5 border-warning-500/20 opacity-70'
                            : k.isBound
                              ? 'bg-success-500/5 border-success-500/20'
                              : 'bg-dark-800 border-dark-700',
                      )}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <code className="text-sm font-mono text-dark-200 truncate">{k.licenseKey}</code>
                          <button
                            onClick={() => copyKey(k.licenseKey, k.id)}
                            className="text-dark-400 hover:text-accent-400 flex-shrink-0"
                            title="Copy key"
                          >
                            {copiedKeyId === k.id ? (
                              <CheckCircleIcon className="w-4 h-4 text-success-400" />
                            ) : (
                              <ClipboardDocumentIcon className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-dark-500">
                          {k.email && <span>{k.email}</span>}
                          <span>{k.isBound ? 'Redeemed' : 'Available'}</span>
                          {k.expiresAt && (
                            <span>
                              {k.isExpired ? 'Expired' : `Expires ${new Date(k.expiresAt).toLocaleDateString()}`}
                            </span>
                          )}
                          {!k.expiresAt && <span>Lifetime</span>}
                          <span>{new Date(k.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        {/* Status badge */}
                        <span
                          className={cn(
                            'text-xs px-2 py-0.5 rounded-full font-medium',
                            k.status === 'active' && !k.isExpired
                              ? 'bg-success-500/20 text-success-400'
                              : k.status === 'revoked'
                                ? 'bg-danger-500/20 text-danger-400'
                                : 'bg-warning-500/20 text-warning-400',
                          )}
                        >
                          {k.status === 'revoked' ? 'Revoked' : k.isExpired ? 'Expired' : k.isBound ? 'Active' : 'Unredeemed'}
                        </span>

                        {/* Revoke button */}
                        {k.status !== 'revoked' && !k.isExpired && (
                          <button
                            onClick={() => handleRevokeKey(k.id, k.licenseKey)}
                            className="text-xs text-danger-400 hover:text-danger-300 px-2 py-1 rounded hover:bg-danger-500/10"
                            title="Revoke this key"
                          >
                            Revoke
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ─── Trial Key Generator (Dev/Testing) ───── */}
      <div className="card border border-dashed border-accent-500/30">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-accent-500/10 rounded-lg flex items-center justify-center">
            <BeakerIcon className="w-5 h-5 text-accent-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-dark-100">Generate Trial Key</h3>
            <p className="text-xs text-dark-500">Create a time-limited premium key for testing</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4">
          <div className="flex-1">
            <label className="block text-sm text-dark-400 mb-1">Trial Duration</label>
            <div className="flex gap-2">
              {[5, 15, 30, 60].map((mins) => (
                <button
                  key={mins}
                  onClick={() => setTrialMinutes(mins)}
                  className={cn(
                    'px-3 py-2 rounded-lg text-sm font-medium transition-all',
                    trialMinutes === mins
                      ? 'bg-accent-500 text-white'
                      : 'bg-dark-700 text-dark-300 hover:bg-dark-600',
                  )}
                >
                  {mins < 60 ? `${mins}m` : `${mins / 60}h`}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handleGenerateTrialKey}
            disabled={generatingTrial}
            className="btn btn-primary flex items-center gap-2"
          >
            <BeakerIcon className="w-4 h-4" />
            {generatingTrial ? 'Generating...' : 'Generate Trial Key'}
          </button>
        </div>

        {/* Show generated trial key info */}
        {trialKey && trialExpiry && (
          <div className="mt-4 p-4 bg-dark-800 rounded-lg border border-accent-500/20">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-dark-500 uppercase tracking-wider">Generated Key</span>
              {trialCountdown && (
                <span className="text-xs font-mono text-warning-400 flex items-center gap-1">
                  <ClockIcon className="w-3 h-3" />
                  {trialCountdown}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <code className="text-accent-400 font-mono text-sm tracking-wider flex-1">{trialKey}</code>
              <button
                onClick={() => { navigator.clipboard.writeText(trialKey); toast.success('Key copied!'); }}
                className="text-dark-400 hover:text-dark-200"
                title="Copy key"
              >
                <ClipboardDocumentIcon className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-dark-500 mt-2">
              Expires: {new Date(trialExpiry).toLocaleString()}
            </p>
          </div>
        )}
      </div>

      {/* ─── License Key Activation ───── */}
      {status?.tier !== 'premium' && (
        <div className="card">
          <div className="flex items-center gap-3 mb-4">
            <KeyIcon className="w-5 h-5 text-accent-400" />
            <h3 className="text-lg font-semibold text-dark-100">Have a License Key?</h3>
          </div>

          {!showActivate ? (
            <div className="flex items-center gap-4">
              <p className="text-dark-400 text-sm">
                Already purchased a premium license key? Enter it below to activate.
              </p>
              <button
                onClick={() => setShowActivate(true)}
                className="btn btn-secondary whitespace-nowrap"
              >
                Enter Key
              </button>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                value={licenseKey}
                onChange={(e) => setLicenseKey(e.target.value.toUpperCase())}
                placeholder="CRAFT-XXXX-XXXX-XXXX-XXXX"
                className="input flex-1 font-mono tracking-wider"
                maxLength={24}
              />
              <div className="flex gap-2">
                <button
                  onClick={handleActivate}
                  disabled={loading || !licenseKey.trim()}
                  className="btn btn-primary"
                >
                  {loading ? 'Activating...' : 'Activate'}
                </button>
                <button
                  onClick={() => { setShowActivate(false); setLicenseKey(''); }}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── Feature Comparison ───── */}
      {categories.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-dark-100">Feature Comparison</h2>
            <div className="flex items-center gap-4 text-sm text-dark-400">
              <div className="flex items-center gap-1.5">
                <ShieldCheckIcon className="w-4 h-4" />
                Free
              </div>
              <div className="flex items-center gap-1.5 text-accent-400">
                <SparklesIcon className="w-4 h-4" />
                Premium
              </div>
            </div>
          </div>

          {/* Category Tabs */}
          <div className="flex flex-wrap gap-2 mb-4">
            <button
              onClick={() => setActiveCategory(null)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                activeCategory === null
                  ? 'bg-accent-500/20 text-accent-400'
                  : 'bg-dark-800 text-dark-400 hover:text-dark-200',
              )}
            >
              All
            </button>
            {categories.map((cat) => {
              const Icon = CATEGORY_ICONS[cat] || CogIcon;
              return (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5',
                    activeCategory === cat
                      ? 'bg-accent-500/20 text-accent-400'
                      : 'bg-dark-800 text-dark-400 hover:text-dark-200',
                  )}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {cat}
                </button>
              );
            })}
          </div>

          {/* Comparison Table */}
          <div className="card overflow-hidden p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-dark-700 bg-dark-800/50">
                  <th className="text-left py-3 px-4 text-dark-400 font-medium">Feature</th>
                  <th className="text-center py-3 px-4 text-dark-400 font-medium w-32">Free</th>
                  <th className="text-center py-3 px-4 text-accent-400 font-medium w-32">
                    <span className="flex items-center justify-center gap-1">
                      <SparklesIcon className="w-3.5 h-3.5" />
                      Premium
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {categories
                  .filter((cat) => !activeCategory || cat === activeCategory)
                  .map((category) => (
                    <>
                      {/* Category Header */}
                      <tr key={`cat-${category}`} className="bg-dark-850">
                        <td colSpan={3} className="py-2 px-4">
                          <div className="flex items-center gap-2">
                            {(() => {
                              const Icon = CATEGORY_ICONS[category] || CogIcon;
                              return <Icon className="w-4 h-4 text-accent-400" />;
                            })()}
                            <span className="text-xs font-bold text-dark-300 uppercase tracking-wider">
                              {category}
                            </span>
                          </div>
                        </td>
                      </tr>

                      {/* Features in this category */}
                      {groupedComparison[category].map((item, idx) => (
                        <tr
                          key={`${category}-${idx}`}
                          className="border-b border-dark-800/50 hover:bg-dark-800/30 transition-colors"
                        >
                          <td className="py-2.5 px-4 text-dark-300">{item.feature}</td>
                          <td className="py-2.5 px-4 text-center">
                            {renderCellValue(item.free, false)}
                          </td>
                          <td className="py-2.5 px-4 text-center">
                            {renderCellValue(item.premium, true)}
                          </td>
                        </tr>
                      ))}
                    </>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── CTA for free users ───── */}
      {status?.tier !== 'premium' && (
        <div className="card bg-gradient-to-r from-accent-500/10 to-purple-500/10 border border-accent-500/20">
          <div className="flex flex-col md:flex-row items-center gap-6">
            <div className="flex-1 text-center md:text-left">
              <h3 className="text-xl font-bold text-dark-100 flex items-center gap-2 justify-center md:justify-start">
                <BoltIcon className="w-6 h-6 text-accent-400" />
                Ready to unlock everything?
              </h3>
              <p className="text-dark-400 mt-2">
                Join thousands of server admins using CraftOS Premium. 30+ features,
                unlimited servers, and no ads.
              </p>
            </div>
            <button
              onClick={() => handleCheckout(selectedPlan)}
              disabled={checkoutLoading}
              className="btn btn-primary btn-lg whitespace-nowrap"
            >
              <SparklesIcon className="w-5 h-5 mr-2" />
              {checkoutLoading ? 'Processing...' : 'Get Premium Now'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function renderCellValue(value: boolean | string, isPremium: boolean) {
  if (typeof value === 'boolean') {
    if (value) {
      return (
        <CheckIcon
          className={cn('w-5 h-5 mx-auto', isPremium ? 'text-accent-400' : 'text-success-400')}
        />
      );
    }
    return <XMarkIcon className="w-5 h-5 mx-auto text-dark-600" />;
  }

  // String value (like "1 server", "Unlimited", "Up to 5", "Yes", "None")
  const isPositive = ['unlimited', 'full history', 'all', 'none'].some((w) =>
    value.toLowerCase().includes(w),
  );
  const isNegative = value.toLowerCase() === 'yes' && !isPremium; // "Yes" for ads on free tier

  return (
    <span
      className={cn(
        'text-xs font-medium',
        isPremium
          ? 'text-accent-400'
          : isNegative
            ? 'text-amber-400'
            : 'text-dark-300',
      )}
    >
      {value}
    </span>
  );
}
