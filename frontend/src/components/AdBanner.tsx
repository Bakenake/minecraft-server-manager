import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { SparklesIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { useAdStore } from '../stores/adStore';
import { cn } from '../lib/utils';

// ─── AdSense Banner ──────────────────────────────────────────
// Place your Google AdSense script tag in index.html:
//   <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-XXXXXXX" crossorigin="anonymous"></script>

interface AdBannerProps {
  placement: string;
  className?: string;
  fallbackToPromo?: boolean;
}

/**
 * Renders an ad banner for the given placement.
 * Falls back to a self-promo upgrade CTA if no external ad is configured.
 * Only renders for free-tier users.
 */
export function AdBanner({ placement, className = '', fallbackToPromo = true }: AdBannerProps) {
  const showAds = useAdStore((s) => s.showAds);
  const getPlacement = useAdStore((s) => s.getPlacement);
  const trackImpression = useAdStore((s) => s.trackImpression);
  const adRef = useRef<HTMLDivElement>(null);

  const config = getPlacement(placement);

  useEffect(() => {
    if (!config?.enabled || !config.slot) return;

    // Try to push AdSense ad
    try {
      const adsbygoogle = (window as any).adsbygoogle;
      if (adsbygoogle) {
        adsbygoogle.push({});
        trackImpression(placement, config.slot);
      }
    } catch {
      // AdSense not loaded — self-promo will show instead
    }
  }, [config?.slot]);

  if (!showAds()) return null;

  // If we have a configured external ad slot, try to render AdSense
  if (config?.enabled && config.slot && !config.slot.includes('XXXXXXX')) {
    return (
      <div ref={adRef} className={cn('ad-container', className)}>
        <ins
          className="adsbygoogle"
          style={{
            display: 'block',
            width: config.size?.width || 'auto',
            height: config.size?.height || 'auto',
          }}
          data-ad-client={config.slot.split('/')[0]}
          data-ad-slot={config.slot.split('/')[1]}
          data-ad-format="auto"
          data-full-width-responsive="true"
        />
        <p className="text-[10px] text-dark-600 text-center mt-1">Advertisement</p>
      </div>
    );
  }

  // Fallback: self-promo upgrade banner
  if (fallbackToPromo) {
    return <UpgradeBanner placement={placement} className={className} />;
  }

  return null;
}

// ─── Self-Promo Upgrade Banner ───────────────────────────────

interface UpgradeBannerProps {
  placement: string;
  className?: string;
}

const PROMO_MESSAGES = [
  { text: 'Remove ads & unlock all features', highlight: 'Upgrade to Premium' },
  { text: 'Unlimited servers, advanced analytics, crash analysis', highlight: 'Go Premium' },
  { text: 'JVM tuning, SFTP, Discord bridge & more', highlight: 'Try Premium' },
  { text: 'Running a community server?', highlight: 'Premium has you covered' },
];

export function UpgradeBanner({ placement, className = '' }: UpgradeBannerProps) {
  const showAds = useAdStore((s) => s.showAds);
  const [dismissed, setDismissed] = useState(false);
  const [promoIdx] = useState(() => Math.floor(Math.random() * PROMO_MESSAGES.length));

  if (!showAds() || dismissed) return null;

  const promo = PROMO_MESSAGES[promoIdx];
  const isCompact = placement === 'sidebar';

  if (isCompact) {
    return (
      <div className={cn(
        'mx-3 p-3 rounded-lg bg-gradient-to-br from-accent-500/10 to-purple-500/10',
        'border border-accent-500/20',
        className,
      )}>
        <div className="flex items-center gap-2 mb-2">
          <SparklesIcon className="w-4 h-4 text-accent-400" />
          <span className="text-xs font-semibold text-accent-400">{promo.highlight}</span>
        </div>
        <p className="text-[11px] text-dark-400 mb-2">{promo.text}</p>
        <Link
          to="/subscription"
          className="block w-full text-center text-xs font-medium py-1.5 rounded bg-accent-500/20 text-accent-300 hover:bg-accent-500/30 transition-colors"
        >
          View Plans
        </Link>
      </div>
    );
  }

  return (
    <div className={cn(
      'relative p-4 rounded-xl bg-gradient-to-r from-accent-500/5 via-purple-500/5 to-accent-500/5',
      'border border-accent-500/15',
      className,
    )}>
      <button
        onClick={() => setDismissed(true)}
        className="absolute top-2 right-2 p-1 text-dark-500 hover:text-dark-300 transition-colors"
        title="Dismiss"
      >
        <XMarkIcon className="w-3.5 h-3.5" />
      </button>
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 bg-accent-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
          <SparklesIcon className="w-5 h-5 text-accent-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-dark-200">{promo.highlight}</p>
          <p className="text-xs text-dark-400 mt-0.5">{promo.text}</p>
        </div>
        <Link
          to="/subscription"
          className="flex-shrink-0 px-4 py-2 text-xs font-semibold rounded-lg bg-accent-500 text-white hover:bg-accent-600 transition-colors"
        >
          Upgrade
        </Link>
      </div>
      <p className="text-[9px] text-dark-600 mt-2 text-right">Sponsored</p>
    </div>
  );
}

// ─── Sidebar Ad Slot ─────────────────────────────────────────
// A pre-sized container for the sidebar bottom ad area

export function SidebarAd() {
  const showAds = useAdStore((s) => s.showAds);
  if (!showAds()) return null;

  return (
    <div className="mt-auto pb-3">
      <AdBanner placement="sidebar" fallbackToPromo />
    </div>
  );
}

// ─── Page Footer Ad ──────────────────────────────────────────

export function PageFooterAd({ className = '' }: { className?: string }) {
  const showAds = useAdStore((s) => s.showAds);
  if (!showAds()) return null;

  return (
    <div className={cn('mt-6', className)}>
      <AdBanner placement="pageFooter" fallbackToPromo />
    </div>
  );
}

// ─── Dashboard Ad ────────────────────────────────────────────

export function DashboardAd({ className = '' }: { className?: string }) {
  const showAds = useAdStore((s) => s.showAds);
  if (!showAds()) return null;

  return (
    <div className={cn('col-span-full', className)}>
      <AdBanner placement="dashboard" fallbackToPromo />
    </div>
  );
}
