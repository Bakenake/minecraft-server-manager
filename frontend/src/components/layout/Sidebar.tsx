import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { cn } from '../../lib/utils';
import {
  HomeIcon,
  ServerStackIcon,
  CommandLineIcon,
  UsersIcon,
  FolderIcon,
  PuzzlePieceIcon,
  ArchiveBoxIcon,
  Cog6ToothIcon,
  ClipboardDocumentListIcon,
  WrenchScrewdriverIcon,
  ChartBarSquareIcon,
  GlobeAltIcon,
  ChevronLeftIcon,
  Bars3Icon,
  SignalIcon,
  XMarkIcon,
  PresentationChartBarIcon,
  DocumentDuplicateIcon,
  MagnifyingGlassIcon,
  CpuChipIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import { useWebSocket } from '../../hooks/useWebSocket';
import { useSubscriptionStore } from '../../stores/subscriptionStore';
import { SidebarAd } from '../AdBanner';
import type { FeatureFlags } from '../../types';

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
}

const navItems: Array<{
  to: string;
  icon: React.ElementType;
  label: string;
  premiumFeature?: keyof FeatureFlags;
}> = [
  { to: '/', icon: HomeIcon, label: 'Dashboard' },
  { to: '/servers', icon: ServerStackIcon, label: 'Servers' },
  { to: '/console', icon: CommandLineIcon, label: 'Console' },
  { to: '/players', icon: UsersIcon, label: 'Players' },
  { to: '/files', icon: FolderIcon, label: 'Files' },
  { to: '/plugins', icon: PuzzlePieceIcon, label: 'Plugins' },
  { to: '/backups', icon: ArchiveBoxIcon, label: 'Backups' },
  { to: '/performance', icon: ChartBarSquareIcon, label: 'Performance', premiumFeature: 'performanceMonitor' },
  { to: '/worlds', icon: GlobeAltIcon, label: 'Worlds', premiumFeature: 'worldManagement' },
  { to: '/properties', icon: WrenchScrewdriverIcon, label: 'Properties' },
  { to: '/analytics', icon: PresentationChartBarIcon, label: 'Analytics', premiumFeature: 'analytics' },
  { to: '/templates', icon: DocumentDuplicateIcon, label: 'Templates', premiumFeature: 'templates' },
  { to: '/logs', icon: MagnifyingGlassIcon, label: 'Logs & Crashes', premiumFeature: 'logSearch' },
  { to: '/tools', icon: CpuChipIcon, label: 'Tools', premiumFeature: 'jvmTuner' },
  { to: '/network', icon: SignalIcon, label: 'Networks', premiumFeature: 'networkProxy' },
  { to: '/audit', icon: ClipboardDocumentListIcon, label: 'Audit Log' },
  { to: '/settings', icon: Cog6ToothIcon, label: 'Settings' },
  { to: '/subscription', icon: SparklesIcon, label: 'Subscription' },
];

export default function Sidebar({ isOpen, onToggle }: SidebarProps) {
  const location = useLocation();
  const { isConnected } = useWebSocket();
  const isPremium = useSubscriptionStore((s) => s.isPremium);

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onToggle}
        />
      )}

      <aside
        className={cn(
          'fixed left-0 top-0 z-50 h-full bg-dark-900 border-r border-dark-700',
          'flex flex-col transition-all duration-300',
          'lg:relative lg:translate-x-0',
          isOpen ? 'w-64 translate-x-0' : 'w-64 -translate-x-full lg:w-20 lg:translate-x-0'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between h-16 px-4 border-b border-dark-700">
          <div className={cn('flex items-center gap-3', !isOpen && 'lg:justify-center lg:w-full')}>
            <div className="w-8 h-8 bg-accent-600 rounded-lg flex items-center justify-center flex-shrink-0">
              <span className="text-white font-bold text-sm">C</span>
            </div>
            <span className={cn('font-bold text-lg text-dark-100 whitespace-nowrap', !isOpen && 'lg:hidden')}>
              CraftOS
            </span>
          </div>
          <button
            onClick={onToggle}
            className="text-dark-400 hover:text-dark-200 lg:hidden"
          >
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map(({ to, icon: Icon, label, premiumFeature }) => {
            const isActive =
              to === '/'
                ? location.pathname === '/'
                : location.pathname.startsWith(to);

            const showProBadge = premiumFeature && !isPremium();

            return (
              <NavLink
                key={to}
                to={to}
                onClick={() => {
                  if (window.innerWidth < 1024) onToggle();
                }}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium',
                  'transition-all duration-200',
                  isActive
                    ? 'bg-accent-600/10 text-accent-400 border border-accent-500/20'
                    : 'text-dark-400 hover:text-dark-200 hover:bg-dark-800',
                  !isOpen && 'lg:justify-center lg:px-2'
                )}
                title={label}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                <span className={cn('flex-1', !isOpen && 'lg:hidden')}>{label}</span>
                {showProBadge && (
                  <span className={cn(
                    'text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-accent-500/20 text-accent-400',
                    !isOpen && 'lg:hidden'
                  )}>
                    PRO
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* Ad slot for free tier */}
        {isOpen && <SidebarAd />}

        {/* Footer */}
        <div className="p-4 border-t border-dark-700">
          <div className={cn('flex items-center gap-2', !isOpen && 'lg:justify-center')}>
            <div className={cn('w-2 h-2 rounded-full', isConnected ? 'bg-success-400' : 'bg-danger-400')} />
            <span className={cn('text-xs text-dark-400', !isOpen && 'lg:hidden')}>
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
          <p className={cn('text-xs text-dark-500 mt-2', !isOpen && 'lg:hidden')}>
            v{__APP_VERSION__}
          </p>
        </div>

        {/* Collapse button (desktop) */}
        <button
          onClick={onToggle}
          className={cn(
            'hidden lg:flex absolute -right-3 top-20 w-6 h-6',
            'bg-dark-800 border border-dark-600 rounded-full',
            'items-center justify-center text-dark-400 hover:text-dark-200',
            'transition-transform duration-300',
            !isOpen && 'rotate-180'
          )}
        >
          <ChevronLeftIcon className="w-3.5 h-3.5" />
        </button>
      </aside>
    </>
  );
}
