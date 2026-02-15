import { create } from 'zustand';

export interface AppNotification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
  serverId?: string;
}

interface NotificationState {
  notifications: AppNotification[];
  unreadCount: number;
  addNotification: (n: Omit<AppNotification, 'id' | 'timestamp' | 'read'>) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  clearAll: () => void;
  removeNotification: (id: string) => void;
}

let counter = 0;

// Deduplication: track recent notifications by key (title + serverId) to prevent spam
// from multiple WebSocket connections receiving the same event
const recentNotifications = new Map<string, number>();
const DEDUP_WINDOW_MS = 5000; // 5 seconds

function isDuplicate(title: string, serverId?: string): boolean {
  const key = `${title}:${serverId || ''}`;
  const now = Date.now();
  const lastTime = recentNotifications.get(key);
  if (lastTime && now - lastTime < DEDUP_WINDOW_MS) {
    return true;
  }
  recentNotifications.set(key, now);
  // Cleanup old entries periodically
  if (recentNotifications.size > 100) {
    for (const [k, t] of recentNotifications) {
      if (now - t > DEDUP_WINDOW_MS) recentNotifications.delete(k);
    }
  }
  return false;
}

export const useNotificationStore = create<NotificationState>()((set, get) => ({
  notifications: [],
  unreadCount: 0,

  addNotification: (n) => {
    // Deduplicate: skip if same title+serverId arrived within 5 seconds
    if (isDuplicate(n.title, n.serverId)) return;

    const notification: AppNotification = {
      ...n,
      id: `notif-${Date.now()}-${counter++}`,
      timestamp: Date.now(),
      read: false,
    };
    set((state) => ({
      notifications: [notification, ...state.notifications].slice(0, 100),
      unreadCount: state.unreadCount + 1,
    }));
  },

  markRead: (id) => {
    set((state) => {
      const wasUnread = state.notifications.find((n) => n.id === id && !n.read);
      return {
        notifications: state.notifications.map((n) =>
          n.id === id ? { ...n, read: true } : n
        ),
        unreadCount: wasUnread ? state.unreadCount - 1 : state.unreadCount,
      };
    });
  },

  markAllRead: () => {
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
      unreadCount: 0,
    }));
  },

  clearAll: () => {
    set({ notifications: [], unreadCount: 0 });
  },

  removeNotification: (id) => {
    set((state) => {
      const n = state.notifications.find((n) => n.id === id);
      return {
        notifications: state.notifications.filter((n) => n.id !== id),
        unreadCount: n && !n.read ? state.unreadCount - 1 : state.unreadCount,
      };
    });
  },
}));
