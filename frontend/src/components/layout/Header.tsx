import { useState, useRef, useEffect } from 'react';
import { Bars3Icon, BellIcon, UserCircleIcon, CheckIcon, TrashIcon, SunIcon, MoonIcon } from '@heroicons/react/24/outline';
import { useAuthStore } from '../../stores/authStore';
import { useNotificationStore } from '../../stores/notificationStore';
import { useThemeStore } from '../../stores/themeStore';
import { useLocation } from 'react-router-dom';
import { cn } from '../../lib/utils';

interface HeaderProps {
  onMenuToggle: () => void;
}

const pageTitles: Record<string, string> = {
  '/': 'Dashboard',
  '/servers': 'Servers',
  '/console': 'Console',
  '/players': 'Players',
  '/files': 'File Manager',
  '/plugins': 'Plugins & Mods',
  '/backups': 'Backups',
  '/settings': 'Settings',
  '/audit': 'Audit Log',
  '/properties': 'Server Properties',
  '/performance': 'Performance',
  '/worlds': 'World Management',
};

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function Header({ onMenuToggle }: HeaderProps) {
  const { user, logout } = useAuthStore();
  const { notifications, unreadCount, markAllRead, clearAll, removeNotification } = useNotificationStore();
  const { theme, toggleTheme } = useThemeStore();
  const location = useLocation();
  const [showNotifs, setShowNotifs] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  const basePath = '/' + (location.pathname.split('/')[1] || '');
  const title = pageTitles[basePath] || 'CraftOS';

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotifs(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const typeColors: Record<string, string> = {
    info: 'bg-accent-500',
    success: 'bg-success-500',
    warning: 'bg-warning-500',
    error: 'bg-danger-500',
  };

  return (
    <header className="sticky top-0 z-30 h-16 bg-dark-900/80 backdrop-blur-lg border-b border-dark-700 px-4 lg:px-6">
      <div className="flex items-center justify-between h-full">
        {/* Left */}
        <div className="flex items-center gap-4">
          <button
            onClick={onMenuToggle}
            className="text-dark-400 hover:text-dark-200 lg:hidden"
          >
            <Bars3Icon className="w-6 h-6" />
          </button>
          <h1 className="text-lg font-semibold text-dark-100">{title}</h1>
        </div>

        {/* Right */}
        <div className="flex items-center gap-4">
          {/* Theme toggle */}
          <button
            className="text-dark-400 hover:text-dark-200 transition-colors"
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? <SunIcon className="w-5 h-5" /> : <MoonIcon className="w-5 h-5" />}
          </button>

          {/* Notifications */}
          <div className="relative" ref={notifRef}>
            <button
              className="relative text-dark-400 hover:text-dark-200 transition-colors"
              onClick={() => setShowNotifs(!showNotifs)}
            >
              <BellIcon className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 bg-danger-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>

            {showNotifs && (
              <div className="absolute right-0 mt-2 w-80 bg-dark-800 border border-dark-600 rounded-xl shadow-2xl overflow-hidden z-50">
                <div className="flex items-center justify-between px-4 py-3 border-b border-dark-700">
                  <h3 className="text-sm font-semibold text-dark-200">Notifications</h3>
                  <div className="flex gap-1">
                    {unreadCount > 0 && (
                      <button
                        onClick={markAllRead}
                        className="text-xs text-accent-400 hover:text-accent-300"
                        title="Mark all read"
                      >
                        <CheckIcon className="w-4 h-4" />
                      </button>
                    )}
                    {notifications.length > 0 && (
                      <button
                        onClick={clearAll}
                        className="text-xs text-dark-400 hover:text-dark-300"
                        title="Clear all"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="py-8 text-center text-dark-500 text-sm">
                      No notifications
                    </div>
                  ) : (
                    notifications.slice(0, 50).map((n) => (
                      <div
                        key={n.id}
                        className={cn(
                          'px-4 py-3 border-b border-dark-700 last:border-0 hover:bg-dark-700/50 transition-colors flex gap-3',
                          !n.read && 'bg-dark-750'
                        )}
                      >
                        <div className={cn('w-2 h-2 rounded-full mt-1.5 flex-shrink-0', typeColors[n.type] || 'bg-dark-500')} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-dark-200">{n.title}</p>
                          <p className="text-xs text-dark-400 truncate">{n.message}</p>
                          <p className="text-[10px] text-dark-500 mt-1">{timeAgo(n.timestamp)}</p>
                        </div>
                        <button
                          onClick={() => removeNotification(n.id)}
                          className="text-dark-500 hover:text-dark-300 flex-shrink-0"
                        >
                          <TrashIcon className="w-3 h-3" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* User menu */}
          <div className="flex items-center gap-3">
            <div className="hidden sm:block text-right">
              <p className="text-sm font-medium text-dark-200">{user?.username}</p>
              <p className="text-xs text-dark-400 capitalize">{user?.role}</p>
            </div>
            <div className="relative group">
              <button className="w-8 h-8 rounded-full bg-accent-600 flex items-center justify-center">
                <span className="text-white text-sm font-medium">
                  {user?.username?.charAt(0).toUpperCase()}
                </span>
              </button>
              {/* Dropdown */}
              <div className="absolute right-0 mt-2 w-48 bg-dark-800 border border-dark-600 rounded-lg shadow-xl py-1 hidden group-hover:block">
                <div className="px-4 py-2 border-b border-dark-600">
                  <p className="text-sm font-medium text-dark-200">{user?.username}</p>
                  <p className="text-xs text-dark-400">{user?.email}</p>
                </div>
                <button
                  onClick={logout}
                  className="w-full px-4 py-2 text-left text-sm text-dark-300 hover:bg-dark-700 hover:text-dark-100"
                >
                  Sign Out
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
