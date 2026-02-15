import { create } from 'zustand';

type Theme = 'dark' | 'light';

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

export const useThemeStore = create<ThemeState>((set) => {
  // Initialize from localStorage
  const saved = typeof window !== 'undefined' ? localStorage.getItem('craftos-theme') as Theme : null;
  const initial: Theme = saved === 'light' ? 'light' : 'dark';

  // Apply immediately
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', initial);
    if (initial === 'light') {
      document.documentElement.classList.remove('dark');
    } else {
      document.documentElement.classList.add('dark');
    }
  }

  return {
    theme: initial,
    setTheme: (theme) => {
      localStorage.setItem('craftos-theme', theme);
      document.documentElement.setAttribute('data-theme', theme);
      if (theme === 'light') {
        document.documentElement.classList.remove('dark');
      } else {
        document.documentElement.classList.add('dark');
      }
      set({ theme });
    },
    toggleTheme: () => {
      set((state) => {
        const next: Theme = state.theme === 'dark' ? 'light' : 'dark';
        localStorage.setItem('craftos-theme', next);
        document.documentElement.setAttribute('data-theme', next);
        if (next === 'light') {
          document.documentElement.classList.remove('dark');
        } else {
          document.documentElement.classList.add('dark');
        }
        return { theme: next };
      });
    },
  };
});
