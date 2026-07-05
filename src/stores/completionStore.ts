import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import type { CompletionModelConfig, CompletionSettings } from '../types';
import { fetchData, saveData } from '../services/apiService';

// Debounce save
let saveTimeout: ReturnType<typeof setTimeout> | null = null;
const debouncedSave = (data: CompletionSettings) => {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => saveData('completionModels', data), 500);
};

interface CompletionModelState {
  models: CompletionModelConfig[];
  isInitialized: boolean;

  initialize: () => Promise<void>;
  createModel: (partial?: Partial<Omit<CompletionModelConfig, 'id' | 'createdAt' | 'updatedAt' | 'totalCost' | 'totalTokens'>>) => CompletionModelConfig;
  updateModel: (id: string, updates: Partial<Omit<CompletionModelConfig, 'id' | 'createdAt' | 'updatedAt'>>) => void;
  deleteModel: (id: string) => void;
  duplicateModel: (id: string) => CompletionModelConfig | null;
  getEnabledModels: () => CompletionModelConfig[];
  getUtilityModel: () => CompletionModelConfig | null;
  accumulateCost: (id: string, cost: number, tokens: number) => void;
}

export const useCompletionModelStore = create<CompletionModelState>()(
  subscribeWithSelector((set, get) => ({
    models: [],
    isInitialized: false,

    initialize: async () => {
      if (get().isInitialized) return;
      try {
        const data = await fetchData<CompletionSettings>('completionModels');
        const normalizedModels = (data?.models || []).map((model) => ({
          ...model,
          bannedProviders: model.bannedProviders || [],
          allowedQuantizations: model.allowedQuantizations || [],
          sortOrder: model.sortOrder || null,
          isUtilityModel: model.isUtilityModel ?? false,
        }));
        set({
          models: normalizedModels,
          isInitialized: true,
        });
      } catch (error) {
        console.error('Failed to initialize completion models:', error);
        set({ isInitialized: true });
      }
    },

    createModel: (partial) => {
      const now = Date.now();
      const model: CompletionModelConfig = {
        id: uuidv4(),
        name: partial?.name || 'New Completion Model',
        baseUrl: partial?.baseUrl || 'https://openrouter.ai/api/v1',
        token: partial?.token || '',
        modelId: partial?.modelId || '',
        bannedProviders: partial?.bannedProviders || [],
        allowedQuantizations: partial?.allowedQuantizations || [],
        sortOrder: partial?.sortOrder || null,
        enabled: partial?.enabled ?? false,
        isUtilityModel: partial?.isUtilityModel ?? false,
        mode: partial?.mode || 'instruction',
        systemMessage: partial?.systemMessage || 'You are a writing assistant. Complete the sentence or predict the next sentence naturally and concisely. Output ONLY the completion text with no commentary.',
        prompt: partial?.prompt || 'Continue the following text naturally. Output only the completion:\n\n',
        contextLength: partial?.contextLength ?? 1000,
        totalCost: 0,
        totalTokens: 0,
        createdAt: now,
        updatedAt: now,
      };
      set((state) => {
        const newModels = [...state.models, model];
        debouncedSave({ models: newModels });
        return { models: newModels };
      });
      return model;
    },

    updateModel: (id, updates) => {
      set((state) => {
        let newModels = state.models.map((m) =>
          m.id === id ? { ...m, ...updates, updatedAt: Date.now() } : m
        );
        // Enforce only one utility model at a time
        if (updates.isUtilityModel === true) {
          newModels = newModels.map((m) =>
            m.id === id ? m : { ...m, isUtilityModel: false, updatedAt: Date.now() }
          );
        }
        debouncedSave({ models: newModels });
        return { models: newModels };
      });
    },

    deleteModel: (id) => {
      set((state) => {
        const newModels = state.models.filter((m) => m.id !== id);
        debouncedSave({ models: newModels });
        return { models: newModels };
      });
    },

    duplicateModel: (id) => {
      const model = get().models.find((m) => m.id === id);
      if (!model) return null;
      const now = Date.now();
      const dup: CompletionModelConfig = {
        ...model,
        id: uuidv4(),
        name: `${model.name} (copy)`,
        bannedProviders: [...model.bannedProviders],
        allowedQuantizations: [...model.allowedQuantizations],
        isUtilityModel: false,
        totalCost: 0,
        totalTokens: 0,
        createdAt: now,
        updatedAt: now,
      };
      set((state) => {
        const newModels = [...state.models, dup];
        debouncedSave({ models: newModels });
        return { models: newModels };
      });
      return dup;
    },

    getEnabledModels: () => {
      return get().models.filter((m) => m.enabled && m.modelId.trim() && m.baseUrl.trim());
    },

    getUtilityModel: () => {
      return get().models.find((m) => m.isUtilityModel) || null;
    },

    accumulateCost: (id, cost, tokens) => {
      set((state) => {
        const newModels = state.models.map((m) =>
          m.id === id
            ? {
                ...m,
                totalCost: m.totalCost + cost,
                totalTokens: m.totalTokens + tokens,
                updatedAt: Date.now(),
              }
            : m
        );
        debouncedSave({ models: newModels });
        return { models: newModels };
      });
    },
  }))
);
