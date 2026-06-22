import { create } from 'zustand';
import type { PublicUser } from '../../shared/types';
import { login as apiLogin, getCurrentUser } from '../utils/api';

interface AuthState {
  user: PublicUser | null;
  token: string | null;
  isLoading: boolean;
  error: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  checkAuth: () => Promise<void>;
  clearError: () => void;
}

const TOKEN_KEY = 'auth_token';
const USER_KEY = 'auth_user';

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: localStorage.getItem(TOKEN_KEY),
  isLoading: false,
  error: null,

  login: async (username, password) => {
    set({ isLoading: true, error: null });
    try {
      const result = await apiLogin(username, password);
      localStorage.setItem(TOKEN_KEY, result.token);
      localStorage.setItem(USER_KEY, JSON.stringify(result.user));
      set({ user: result.user, token: result.token, isLoading: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : '登录失败',
        isLoading: false,
      });
      throw err;
    }
  },

  logout: () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    set({ user: null, token: null });
  },

  checkAuth: async () => {
    const token = localStorage.getItem(TOKEN_KEY);
    const savedUser = localStorage.getItem(USER_KEY);
    if (token && savedUser) {
      try {
        set({ user: JSON.parse(savedUser) });
        const result = await getCurrentUser();
        localStorage.setItem(USER_KEY, JSON.stringify(result.user));
        set({ user: result.user });
      } catch {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        set({ user: null, token: null });
      }
    }
  },

  clearError: () => set({ error: null }),
}));
