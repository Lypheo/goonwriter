import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import type { ModelConfig, InstructionTemplate, SamplingParams, ResponseMetadata } from '../types';
import { DEFAULT_SAMPLING_PARAMS } from '../types';
import { fetchData, saveData } from '../services/apiService';

const defaultInstructionTemplate: InstructionTemplate = {
  systemPromptPrefix: '',
  systemPromptSuffix: '',
  userTagPrefix: '',
  userTagSuffix: '',
  assistantTagPrefix: '',
  assistantTagSuffix: '',
  thinkTagPrefix: '<think>',
  thinkTagSuffix: '</think>',
  allowedProviders: [],
  bannedProviders: [],
  allowedQuantizations: [],
  sortOrder: null,
};

interface ModelState {
  models: ModelConfig[];
  selectedModelId: string | null;
  samplingParams: SamplingParams;
  isInitialized: boolean;
  
  // Initialize from server
  initialize: () => Promise<void>;
  
  // Model CRUD
  createModel: (config: Omit<ModelConfig, 'id' | 'createdAt' | 'updatedAt'>) => ModelConfig;
  updateModel: (id: string, updates: Partial<Omit<ModelConfig, 'id' | 'createdAt' | 'updatedAt'>>) => void;
  deleteModel: (id: string) => void;
  
  // Selection
  setSelectedModel: (id: string | null) => void;
  getSelectedModel: () => ModelConfig | null;
  
  // Sampling params
  setSamplingParams: (params: Partial<SamplingParams>) => void;
  resetSamplingParams: () => void;
}

// Debounce save operations
let saveModelsTimeout: ReturnType<typeof setTimeout> | null = null;
let saveSettingsTimeout: ReturnType<typeof setTimeout> | null = null;

const debouncedSaveModels = (models: ModelConfig[]) => {
  if (saveModelsTimeout) clearTimeout(saveModelsTimeout);
  saveModelsTimeout = setTimeout(() => saveData('models', models), 500);
};

const debouncedSaveSettings = (settings: { selectedModelId: string | null; samplingParams: SamplingParams }) => {
  if (saveSettingsTimeout) clearTimeout(saveSettingsTimeout);
  saveSettingsTimeout = setTimeout(() => saveData('settings', settings), 500);
};

export const useModelStore = create<ModelState>()(
  subscribeWithSelector(
    (set, get) => ({
      models: [],
      selectedModelId: null,
      samplingParams: { ...DEFAULT_SAMPLING_PARAMS },
      isInitialized: false,
      
      initialize: async () => {
        if (get().isInitialized) return;
        
        try {
          const [models, settings] = await Promise.all([
            fetchData<ModelConfig[]>('models'),
            fetchData<{ selectedModelId: string | null; samplingParams: SamplingParams }>('settings'),
          ]);
          
          set({
            models: models || [],
            selectedModelId: settings?.selectedModelId || null,
            samplingParams: settings?.samplingParams || { ...DEFAULT_SAMPLING_PARAMS },
            isInitialized: true,
          });
        } catch (error) {
          console.error('Failed to initialize models:', error);
          set({ isInitialized: true });
        }
      },
      
      createModel: (config) => {
        const now = Date.now();
        const model: ModelConfig = {
          ...config,
          id: uuidv4(),
          createdAt: now,
          updatedAt: now,
        };
        set((state) => {
          const newModels = [...state.models, model];
          debouncedSaveModels(newModels);
          return { models: newModels };
        });
        return model;
      },
      
      updateModel: (id, updates) => {
        set((state) => {
          const newModels = state.models.map((m) =>
            m.id === id ? { ...m, ...updates, updatedAt: Date.now() } : m
          );
          debouncedSaveModels(newModels);
          return { models: newModels };
        });
      },
      
      deleteModel: (id) => {
        set((state) => {
          const newModels = state.models.filter((m) => m.id !== id);
          const newSelectedId = state.selectedModelId === id ? null : state.selectedModelId;
          debouncedSaveModels(newModels);
          debouncedSaveSettings({ selectedModelId: newSelectedId, samplingParams: state.samplingParams });
          return {
            models: newModels,
            selectedModelId: newSelectedId,
          };
        });
      },
      
      setSelectedModel: (id) => {
        set((state) => {
          debouncedSaveSettings({ selectedModelId: id, samplingParams: state.samplingParams });
          return { selectedModelId: id };
        });
      },
      
      getSelectedModel: () => {
        const state = get();
        return state.models.find((m) => m.id === state.selectedModelId) || null;
      },
      
      setSamplingParams: (params) => {
        set((state) => {
          const newParams = { ...state.samplingParams, ...params };
          debouncedSaveSettings({ selectedModelId: state.selectedModelId, samplingParams: newParams });
          return { samplingParams: newParams };
        });
      },
      
      resetSamplingParams: () => {
        set((state) => {
          const newParams = { ...DEFAULT_SAMPLING_PARAMS };
          debouncedSaveSettings({ selectedModelId: state.selectedModelId, samplingParams: newParams });
          return { samplingParams: newParams };
        });
      },
    })
  )
);

// Generation state (not persisted)
interface GenerationState {
  isGenerating: boolean;
  responseMetadata: ResponseMetadata | null;
  abortController: AbortController | null;
  
  startGeneration: () => AbortController;
  stopGeneration: () => void;
  setResponseMetadata: (metadata: Partial<ResponseMetadata>) => void;
  clearResponseMetadata: () => void;
}

export const useGenerationStore = create<GenerationState>()((set, get) => ({
  isGenerating: false,
  responseMetadata: null,
  abortController: null,
  
  startGeneration: () => {
    const controller = new AbortController();
    set({
      isGenerating: true,
      abortController: controller,
      responseMetadata: {
        id: '',
        provider: '',
        model: '',
        created: 0,
        finishReason: null,
        nativeFinishReason: null,
        usage: null,
        error: null,
        wordsPerSecond: 0,
        generationStartTime: Date.now(),
        generationEndTime: null,
      },
    });
    return controller;
  },
  
  stopGeneration: () => {
    const controller = get().abortController;
    if (controller) {
      controller.abort();
    }
    set((state) => ({
      isGenerating: false,
      abortController: null,
      responseMetadata: state.responseMetadata
        ? { ...state.responseMetadata, generationEndTime: Date.now() }
        : null,
    }));
  },
  
  setResponseMetadata: (metadata) => {
    set((state) => ({
      responseMetadata: state.responseMetadata
        ? { ...state.responseMetadata, ...metadata }
        : null,
    }));
  },
  
  clearResponseMetadata: () => {
    set({ responseMetadata: null });
  },
}));

export { defaultInstructionTemplate };
