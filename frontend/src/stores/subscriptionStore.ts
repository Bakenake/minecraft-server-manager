import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from '../lib/api';
import type { SubscriptionStatus, TierInfo, FeatureFlags, FeatureComparisonItem, PricingPlan } from '../types';

interface SubscriptionState {
  status: SubscriptionStatus | null;
  tiers: TierInfo[];
  featureComparison: FeatureComparisonItem[];
  pricing: { monthly: PricingPlan; yearly: PricingPlan; lifetime: PricingPlan } | null;
  loading: boolean;
  checkoutLoading: boolean;
  checkoutPolling: boolean;
  error: string | null;

  // Actions
  fetchStatus: () => Promise<void>;
  fetchTiers: () => Promise<void>;
  activateLicense: (key: string) => Promise<{ success: boolean; message: string }>;
  deactivateLicense: () => Promise<{ success: boolean; message: string }>;
  startCheckout: (plan: 'monthly' | 'yearly' | 'lifetime') => Promise<{ success: boolean; url?: string; error?: string }>;
  stopCheckoutPolling: () => void;
  openPortal: () => Promise<{ success: boolean; url?: string; error?: string }>;
  hasFeature: (feature: keyof FeatureFlags) => boolean;
  isPremium: () => boolean;
}

export const useSubscriptionStore = create<SubscriptionState>()(
  persist(
    (set, get) => {
      // Track checkout polling interval externally
      let checkoutPollTimer: ReturnType<typeof setInterval> | null = null;

      return {
      status: null,
      tiers: [],
      featureComparison: [],
      pricing: null,
      loading: false,
      checkoutLoading: false,
      checkoutPolling: false,
      error: null,

      fetchStatus: async () => {
        set({ loading: true, error: null });
        try {
          const { data } = await api.get<SubscriptionStatus>('/subscription/status');
          set({ status: data, loading: false });
        } catch (err: any) {
          set({ error: err.response?.data?.error || 'Failed to fetch subscription status', loading: false });
        }
      },

      fetchTiers: async () => {
        try {
          const { data } = await api.get('/subscription/tiers');
          set({
            tiers: data.tiers || [],
            featureComparison: data.featureComparison || [],
            pricing: data.pricing || null,
          });
        } catch {
          // Non-critical
        }
      },

      activateLicense: async (key: string) => {
        set({ loading: true, error: null });
        try {
          const { data } = await api.post('/subscription/activate', { licenseKey: key });
          await get().fetchStatus();
          return { success: true, message: data.message };
        } catch (err: any) {
          const message = err.response?.data?.error || 'Activation failed';
          set({ error: message, loading: false });
          return { success: false, message };
        }
      },

      deactivateLicense: async () => {
        set({ loading: true, error: null });
        try {
          const { data } = await api.post('/subscription/deactivate');
          await get().fetchStatus();
          return { success: true, message: data.message };
        } catch (err: any) {
          const message = err.response?.data?.error || 'Deactivation failed';
          set({ error: message, loading: false });
          return { success: false, message };
        }
      },

      startCheckout: async (plan: 'monthly' | 'yearly' | 'lifetime') => {
        set({ checkoutLoading: true, error: null });
        try {
          const { data } = await api.post<{ checkoutUrl: string; sessionId: string }>('/subscription/checkout', { plan });
          set({ checkoutLoading: false });
          if (data.checkoutUrl) {
            window.open(data.checkoutUrl, '_blank');

            // Start polling for license activation (checkout completes in browser,
            // Stripe webhook fires, and license is created server-side)
            const currentTier = get().status?.tier || 'free';
            set({ checkoutPolling: true });

            // Clear any existing poll
            if (checkoutPollTimer) clearInterval(checkoutPollTimer);

            let pollCount = 0;
            const MAX_POLLS = 120; // Poll for up to 10 minutes (5s intervals)

            checkoutPollTimer = setInterval(async () => {
              pollCount++;
              if (pollCount > MAX_POLLS) {
                // Stop polling after timeout
                if (checkoutPollTimer) { clearInterval(checkoutPollTimer); checkoutPollTimer = null; }
                set({ checkoutPolling: false });
                return;
              }
              try {
                const { data: statusData } = await api.get<SubscriptionStatus>('/subscription/status');
                if (statusData.tier !== currentTier && statusData.tier === 'premium') {
                  // License activated! Stop polling and update state
                  if (checkoutPollTimer) { clearInterval(checkoutPollTimer); checkoutPollTimer = null; }
                  set({ status: statusData, checkoutPolling: false });
                }
              } catch {
                // Ignore poll errors
              }
            }, 5000);

            return { success: true, url: data.checkoutUrl };
          }
          return { success: false, error: 'No checkout URL returned' };
        } catch (err: any) {
          const error = err.response?.data?.error || 'Failed to start checkout';
          set({ checkoutLoading: false, error });
          return { success: false, error };
        }
      },

      stopCheckoutPolling: () => {
        if (checkoutPollTimer) { clearInterval(checkoutPollTimer); checkoutPollTimer = null; }
        set({ checkoutPolling: false });
      },

      openPortal: async () => {
        try {
          const { data } = await api.post<{ portalUrl: string }>('/subscription/portal');
          if (data.portalUrl) {
            window.open(data.portalUrl, '_blank');
            return { success: true, url: data.portalUrl };
          }
          return { success: false, error: 'No portal URL returned' };
        } catch (err: any) {
          const error = err.response?.data?.error || 'Failed to open billing portal';
          return { success: false, error };
        }
      },

      hasFeature: (feature: keyof FeatureFlags) => {
        const status = get().status;
        if (!status) return false;
        return status.features[feature] ?? false;
      },

      isPremium: () => {
        const status = get().status;
        return status?.tier === 'premium';
      },
    }; },
    {
      name: 'craftos-subscription',
      partialize: (state) => ({
        status: state.status,
        tiers: state.tiers,
      }),
    },
  ),
);
