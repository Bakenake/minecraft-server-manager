import { create } from 'zustand';
import api from '../lib/api';

export interface AdPlacement {
  enabled: boolean;
  type: 'banner' | 'interstitial';
  slot: string;
  size?: { width: number; height: number };
  refreshInterval?: number;
  frequency?: number;
}

export interface AdConfig {
  showAds: boolean;
  tier: string;
  placements: Record<string, AdPlacement>;
  selfPromo: {
    upgradeMessages: string[];
    upgradeUrl: string;
  } | null;
}

interface AdState {
  config: AdConfig | null;
  loading: boolean;
  currentPromoIndex: number;

  fetchConfig: () => Promise<void>;
  showAds: () => boolean;
  getPlacement: (name: string) => AdPlacement | null;
  getPromoMessage: () => string | null;
  trackImpression: (placement: string, adSlot: string) => void;
}

export const useAdStore = create<AdState>()((set, get) => ({
  config: null,
  loading: false,
  currentPromoIndex: 0,

  fetchConfig: async () => {
    set({ loading: true });
    try {
      const { data } = await api.get<AdConfig>('/ads/config');
      set({ config: data, loading: false });
    } catch {
      // Default to showing self-promo if config fetch fails
      set({
        config: {
          showAds: true,
          tier: 'free',
          placements: {},
          selfPromo: {
            upgradeMessages: ['Upgrade to Premium for the best experience!'],
            upgradeUrl: '/subscription',
          },
        },
        loading: false,
      });
    }
  },

  showAds: () => {
    return get().config?.showAds ?? false;
  },

  getPlacement: (name: string) => {
    const config = get().config;
    if (!config?.showAds) return null;
    return config.placements[name] ?? null;
  },

  getPromoMessage: () => {
    const config = get().config;
    if (!config?.selfPromo) return null;
    const messages = config.selfPromo.upgradeMessages;
    if (!messages.length) return null;
    const idx = get().currentPromoIndex % messages.length;
    set({ currentPromoIndex: idx + 1 });
    return messages[idx];
  },

  trackImpression: (placement: string, adSlot: string) => {
    api.post('/ads/impression', { placement, adSlot }).catch(() => {});
  },
}));
