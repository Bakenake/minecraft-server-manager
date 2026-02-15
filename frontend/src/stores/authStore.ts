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

  login: (username: string, password: string, totpToken?: string) => Promise<LoginResponse>;
  logout: () => void;
  checkAuth: () => Promise<void>;
  checkSetup: () => Promise<void>;
  setup: (username: string, email: string, password: string) => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: true,
      setupRequired: false,

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
          const { data } = await api.get<{ setupRequired: boolean }>('/auth/status');
          set({ setupRequired: data.setupRequired, isLoading: false });
        } catch {
          set({ isLoading: false });
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
