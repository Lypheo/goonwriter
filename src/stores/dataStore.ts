import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import type { Group, Collection, Story } from '../types';
import { fetchData, saveData } from '../services/apiService';

interface DataState {
  groups: Group[];
  collections: Collection[];
  stories: Story[];
  isLoading: boolean;
  isInitialized: boolean;
  
  // Initialize from server
  initialize: () => Promise<void>;
  
  // Group CRUD
  createGroup: (name: string) => Group;
  updateGroup: (id: string, name: string) => void;
  deleteGroup: (id: string) => void;
  
  // Collection CRUD
  createCollection: (groupId: string, name: string) => Collection;
  updateCollection: (id: string, name: string) => void;
  deleteCollection: (id: string) => void;
  
  // Story CRUD
  createStory: (collectionId: string, name: string) => Story;
  updateStory: (id: string, updates: Partial<Pick<Story, 'name' | 'content' | 'htmlContent' | 'totalCost' | 'totalTokens'>>) => void;
  deleteStory: (id: string) => void;
  duplicateStory: (id: string) => Story | null;
  
  // Helpers
  getStoriesByCollection: (collectionId: string) => Story[];
  getCollectionsByGroup: (groupId: string) => Collection[];
}

// Debounce save operations
let saveGroupsTimeout: ReturnType<typeof setTimeout> | null = null;
let saveCollectionsTimeout: ReturnType<typeof setTimeout> | null = null;
let saveStoriesTimeout: ReturnType<typeof setTimeout> | null = null;
let saveAppStateTimeout: ReturnType<typeof setTimeout> | null = null;

const debouncedSaveGroups = (groups: Group[]) => {
  if (saveGroupsTimeout) clearTimeout(saveGroupsTimeout);
  saveGroupsTimeout = setTimeout(() => saveData('groups', groups), 500);
};

const debouncedSaveCollections = (collections: Collection[]) => {
  if (saveCollectionsTimeout) clearTimeout(saveCollectionsTimeout);
  saveCollectionsTimeout = setTimeout(() => saveData('collections', collections), 500);
};

const debouncedSaveStories = (stories: Story[]) => {
  if (saveStoriesTimeout) clearTimeout(saveStoriesTimeout);
  saveStoriesTimeout = setTimeout(() => saveData('stories', stories), 500);
};

const debouncedSaveAppState = (appState: { selectedStoryId: string | null; userCommandTemplate?: string }) => {
  if (saveAppStateTimeout) clearTimeout(saveAppStateTimeout);
  saveAppStateTimeout = setTimeout(() => saveData('appState', appState), 500);
};

export const useDataStore = create<DataState>()(
  subscribeWithSelector(
    (set, get) => ({
      groups: [],
      collections: [],
      stories: [],
      isLoading: true,
      isInitialized: false,
      
      initialize: async () => {
        if (get().isInitialized) return;
        
        set({ isLoading: true });
        
        try {
          const [groups, collections, stories] = await Promise.all([
            fetchData<Group[]>('groups'),
            fetchData<Collection[]>('collections'),
            fetchData<Story[]>('stories'),
          ]);
          
          set({
            groups: groups || [],
            collections: collections || [],
            stories: stories || [],
            isLoading: false,
            isInitialized: true,
          });
        } catch (error) {
          console.error('Failed to initialize data:', error);
          set({ isLoading: false, isInitialized: true });
        }
      },
      
      // Group CRUD
      createGroup: (name: string) => {
        const now = Date.now();
        const group: Group = {
          id: uuidv4(),
          name,
          createdAt: now,
          updatedAt: now,
        };
        set((state) => {
          const newGroups = [...state.groups, group];
          debouncedSaveGroups(newGroups);
          return { groups: newGroups };
        });
        return group;
      },
      
      updateGroup: (id: string, name: string) => {
        set((state) => {
          const newGroups = state.groups.map((g) =>
            g.id === id ? { ...g, name, updatedAt: Date.now() } : g
          );
          debouncedSaveGroups(newGroups);
          return { groups: newGroups };
        });
      },
      
      deleteGroup: (id: string) => {
        const state = get();
        const collectionIds = state.collections
          .filter((c) => c.groupId === id)
          .map((c) => c.id);
        
        set((state) => {
          const newGroups = state.groups.filter((g) => g.id !== id);
          const newCollections = state.collections.filter((c) => c.groupId !== id);
          const newStories = state.stories.filter((s) => !collectionIds.includes(s.collectionId));
          debouncedSaveGroups(newGroups);
          debouncedSaveCollections(newCollections);
          debouncedSaveStories(newStories);
          return {
            groups: newGroups,
            collections: newCollections,
            stories: newStories,
          };
        });
      },
      
      // Collection CRUD
      createCollection: (groupId: string, name: string) => {
        const now = Date.now();
        const collection: Collection = {
          id: uuidv4(),
          groupId,
          name,
          createdAt: now,
          updatedAt: now,
        };
        set((state) => {
          const newCollections = [...state.collections, collection];
          debouncedSaveCollections(newCollections);
          return { collections: newCollections };
        });
        return collection;
      },
      
      updateCollection: (id: string, name: string) => {
        set((state) => {
          const newCollections = state.collections.map((c) =>
            c.id === id ? { ...c, name, updatedAt: Date.now() } : c
          );
          debouncedSaveCollections(newCollections);
          return { collections: newCollections };
        });
      },
      
      deleteCollection: (id: string) => {
        set((state) => {
          const newCollections = state.collections.filter((c) => c.id !== id);
          const newStories = state.stories.filter((s) => s.collectionId !== id);
          debouncedSaveCollections(newCollections);
          debouncedSaveStories(newStories);
          return {
            collections: newCollections,
            stories: newStories,
          };
        });
      },
      
      // Story CRUD
      createStory: (collectionId: string, name: string) => {
        const now = Date.now();
        const story: Story = {
          id: uuidv4(),
          collectionId,
          name,
          content: '',
          htmlContent: '<p></p>',
          totalCost: 0,
          totalTokens: 0,
          createdAt: now,
          updatedAt: now,
        };
        set((state) => {
          const newStories = [...state.stories, story];
          debouncedSaveStories(newStories);
          return { stories: newStories };
        });
        return story;
      },
      
      updateStory: (id: string, updates: Partial<Pick<Story, 'name' | 'content' | 'htmlContent' | 'totalCost' | 'totalTokens'>>) => {
        set((state) => {
          const newStories = state.stories.map((s) =>
            s.id === id ? { ...s, ...updates, updatedAt: Date.now() } : s
          );
          debouncedSaveStories(newStories);
          return { stories: newStories };
        });
      },
      
      deleteStory: (id: string) => {
        set((state) => {
          const newStories = state.stories.filter((s) => s.id !== id);
          debouncedSaveStories(newStories);
          return { stories: newStories };
        });
      },
      
      duplicateStory: (id: string) => {
        const story = get().stories.find((s) => s.id === id);
        if (!story) return null;
        
        const now = Date.now();
        const duplicated: Story = {
          ...story,
          id: uuidv4(),
          name: `${story.name} (copy)`,
          htmlContent: story.htmlContent || '',
          totalCost: 0, // Reset cost for duplicated story
          totalTokens: 0,
          createdAt: now,
          updatedAt: now,
        };
        set((state) => {
          const newStories = [...state.stories, duplicated];
          debouncedSaveStories(newStories);
          return { stories: newStories };
        });
        return duplicated;
      },
      
      // Helpers
      getStoriesByCollection: (collectionId: string) => {
        return get().stories.filter((s) => s.collectionId === collectionId);
      },
      
      getCollectionsByGroup: (groupId: string) => {
        return get().collections.filter((c) => c.groupId === groupId);
      },
    })
  )
);

// App UI state
interface AppState {
  selectedGroupId: string | null;
  selectedCollectionId: string | null;
  selectedStoryId: string | null;
  userCommandTemplate: string;
  isAppStateInitialized: boolean;
  
  initializeAppState: () => Promise<void>;
  setSelectedGroup: (id: string | null) => void;
  setSelectedCollection: (id: string | null) => void;
  setSelectedStory: (id: string | null) => void;
  setUserCommandTemplate: (template: string) => void;
}

export const useAppStore = create<AppState>()((set, get) => ({
  selectedGroupId: null,
  selectedCollectionId: null,
  selectedStoryId: null,
  userCommandTemplate: '<<end_ai>><<start_user>>{cursor}<<end_user>><<start_ai>><think>\n...\n</think>\n',
  isAppStateInitialized: false,
  
  initializeAppState: async () => {
    if (get().isAppStateInitialized) return;
    
    try {
      const appState = await fetchData<{ selectedStoryId: string | null; userCommandTemplate?: string }>('appState');
      if (appState?.selectedStoryId) {
        // Verify the story still exists
        const stories = useDataStore.getState().stories;
        const storyExists = stories.some(s => s.id === appState.selectedStoryId);
        if (storyExists) {
          set({ selectedStoryId: appState.selectedStoryId });
        }
      }
      if (appState?.userCommandTemplate) {
        set({ userCommandTemplate: appState.userCommandTemplate });
      }
    } catch (error) {
      console.error('Failed to load app state:', error);
    }
    set({ isAppStateInitialized: true });
  },
  
  setSelectedGroup: (id) => set({ selectedGroupId: id }),
  setSelectedCollection: (id) => set({ selectedCollectionId: id }),
  setSelectedStory: (id) => {
    set({ selectedStoryId: id });
    debouncedSaveAppState({ selectedStoryId: id, userCommandTemplate: get().userCommandTemplate });
  },
  setUserCommandTemplate: (template) => {
    set({ userCommandTemplate: template });
    debouncedSaveAppState({ selectedStoryId: get().selectedStoryId, userCommandTemplate: template });
  },
}));
