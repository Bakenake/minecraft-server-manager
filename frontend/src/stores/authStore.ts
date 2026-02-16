import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from '../lib/api';
import type { User, LoginResponse } from '../types';

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setupRequired: boolean;
  backendError: string | null;
  backendConnected: boolean;

  login: (username: string, password: string, totpToken?: string) => Promise<LoginResponse>;
  logout: () => void;
  checkAuth: () => Promise<void>;
  checkSetup: () => Promise<void>;
  retryBackend: () => Promise<void>;
  setup: (username: string, email: string, password: string) => Promise<void>;
}

/**
 * Try to reach the backend with retries.
 * Returns the status data or throws after all retries fail.
 */
async function fetchSetupStatusWithRetry(
  retries = 8,
  delayMs = 2000
): Promise<{ setupRequired: boolean }> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const { data } = await api.get<{ setupRequired: boolean }>('/auth/status');
      return data;
    } catch (err: any) {
      const isNetworkError =
        !err.response || err.code === 'ECONNREFUSED' || err.code === 'ERR_NETWORK';
      if (!isNetworkError) {
        // Got a real HTTP response (4xx/5xx) — backend is running but errored
        throw err;
      }
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }
  throw new Error(
    'Could not connect to the CraftOS backend. The server may still be starting — please wait and retry.'
  );
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: true,
      setupRequired: false,
      backendError: null,
      backendConnected: false,

      login: async (username, password, totpToken?) => {
        const { data } = await api.post<LoginResponse>('/auth/login', {
          username,
          password,
          totpToken,
        });

        if (data.requiresTwoFactor) {
          return data;
        }

        localStorage.setItem('token', data.token);
        set({
          user: data.user,
          token: data.token,
          isAuthenticated: true,
        });

        return data;
      },

      logout: () => {
        localStorage.removeItem('token');
        set({
          user: null,
          token: null,
          isAuthenticated: false,
        });
      },

      checkAuth: async () => {
        const token = localStorage.getItem('token');
        if (!token) {
          set({ isLoading: false, isAuthenticated: false });
          return;
        }

        try {
          const { data } = await api.get<User>('/auth/me');
          set({
            user: data,
            token,
            isAuthenticated: true,
            isLoading: false,
          });
        } catch {
          localStorage.removeItem('token');
          set({
            user: null,
            token: null,
            isAuthenticated: false,
            isLoading: false,
          });
        }
      },

      checkSetup: async () => {
        try {
          const data = await fetchSetupStatusWithRetry();
          // If setup is required, clear any stale auth tokens from previous installs
          if (data.setupRequired) {
            localStorage.removeItem('token');
            set({
              setupRequired: true,
              backendConnected: true,
              backendError: null,
              isLoading: false,
              user: null,
              token: null,
              isAuthenticated: false,
            });
          } else {
            set({
              setupRequired: false,
              backendConnected: true,
              backendError: null,
              isLoading: false,
            });
          }
        } catch (err: any) {
          const message =
            err.response?.data?.error || err.message || 'Unknown error connecting to backend';
          set({
            backendError: message,
            backendConnected: false,
            isLoading: false,
          });
        }
      },

      retryBackend: async () => {
        set({ isLoading: true, backendError: null });
        await get().checkSetup();
        // If connected successfully and not setup required, also check auth
        const state = get();
        if (state.backendConnected && !state.setupRequired) {
          await state.checkAuth();
        }
      },

      setup: async (username, email, password) => {
        await api.post('/auth/setup', { username, email, password });
        set({ setupRequired: false });
      },
    }),
    {
      name: 'craftos-auth',
      partialize: (state) => ({
        token: state.token,
        user: state.user,
      }),
    }
  )
);
