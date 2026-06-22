import { create } from 'zustand';
import type { Asset, AssetGroup, Priority, PublicUser } from '../../shared/types';
import {
  getAssets as apiGetAssets,
  createAsset as apiCreateAsset,
  updateAsset as apiUpdateAsset,
  deleteAsset as apiDeleteAsset,
  getPriorities as apiGetPriorities,
  updatePriorities as apiUpdatePriorities,
  getTechnicians as apiGetTechnicians,
} from '../utils/api';

interface ConfigState {
  assets: Asset[];
  assetGroups: AssetGroup[];
  priorities: Priority[];
  technicians: PublicUser[];
  isLoading: boolean;
  error: string | null;
  fetchAssets: () => Promise<void>;
  fetchPriorities: () => Promise<void>;
  fetchTechnicians: () => Promise<void>;
  createAsset: (data: Omit<Asset, 'id' | 'createdAt'>) => Promise<void>;
  updateAsset: (id: string, data: Partial<Asset>) => Promise<void>;
  removeAsset: (id: string) => Promise<void>;
  savePriorities: (priorities: Priority[]) => Promise<void>;
  clearError: () => void;
}

export const useConfigStore = create<ConfigState>((set, get) => ({
  assets: [],
  assetGroups: [],
  priorities: [],
  technicians: [],
  isLoading: false,
  error: null,

  fetchAssets: async () => {
    set({ isLoading: true, error: null });
    try {
      const result = await apiGetAssets();
      set({ assets: result.assets, assetGroups: result.groups, isLoading: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : '获取资产失败',
        isLoading: false,
      });
    }
  },

  fetchPriorities: async () => {
    set({ isLoading: true, error: null });
    try {
      const result = await apiGetPriorities();
      set({ priorities: result.priorities, isLoading: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : '获取优先级失败',
        isLoading: false,
      });
    }
  },

  fetchTechnicians: async () => {
    set({ isLoading: true, error: null });
    try {
      const result = await apiGetTechnicians();
      set({ technicians: result.technicians, isLoading: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : '获取技术员失败',
        isLoading: false,
      });
    }
  },

  createAsset: async (data) => {
    set({ isLoading: true, error: null });
    try {
      await apiCreateAsset(data);
      set({ isLoading: false });
      await get().fetchAssets();
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : '创建资产失败',
        isLoading: false,
      });
      throw err;
    }
  },

  updateAsset: async (id, data) => {
    set({ isLoading: true, error: null });
    try {
      await apiUpdateAsset(id, data);
      set({ isLoading: false });
      await get().fetchAssets();
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : '更新资产失败',
        isLoading: false,
      });
      throw err;
    }
  },

  removeAsset: async (id) => {
    set({ isLoading: true, error: null });
    try {
      await apiDeleteAsset(id);
      set({ isLoading: false });
      await get().fetchAssets();
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : '删除资产失败',
        isLoading: false,
      });
      throw err;
    }
  },

  savePriorities: async (priorities) => {
    set({ isLoading: true, error: null });
    try {
      const result = await apiUpdatePriorities(priorities);
      set({ priorities: result.priorities, isLoading: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : '保存优先级失败',
        isLoading: false,
      });
      throw err;
    }
  },

  clearError: () => set({ error: null }),
}));
