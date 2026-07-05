import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import type { Group, Collection, Story } from '../types';
import { fetchData, saveData, saveStory, deleteStory } from '../services/apiService';
import { createInitialSections, normalizeStory } from '../services/storySections';
import {
  applyMutableVariableEdit,
  getLatestValidWritingPlanInStory,
  parseWritingPlanFromText,
  replaceWritingPlanInText,
} from '../services/promptEngineering';

interface DataState {
  groups: Group[];
  collections: Collection[];
  stories: Story[];
  isLoading: boolean;
  isInitialized: boolean;
  hasPendingStorySaves: () => boolean;
  flushPendingStorySaves: () => Promise<void>;
  
  // Initialize from server
  initialize: () => Promise<void>;
  // Periodic sync to detect remote changes
  syncWithServer: () => Promise<void>;
  
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
  updateStory: (id: string, updates: Partial<Pick<Story, 'name' | 'collectionId' | 'sections' | 'totalCost' | 'totalTokens'>>) => void;
  deleteStory: (id: string) => void;
  duplicateStory: (id: string) => Story | null;
  updateStoryPromptConfig: (storyId: string, updates: Partial<Pick<Story, 'promptPlaceholders' | 'childPromptTemplate' | 'childResponseTemplate' | 'writingPlan'>>) => void;
  applyWritingPlanFromStoryResponse: (storyId: string, assistantContent: string) => void;
  updateWritingPlanFromVariableEdit: (storyId: string, variableKey: string, value: string) => void;
  
  // Helpers
  getStoriesByCollection: (collectionId: string) => Story[];
  getCollectionsByGroup: (groupId: string) => Collection[];
}

// Debounce save operations
let saveGroupsTimeout: ReturnType<typeof setTimeout> | null = null;
let saveCollectionsTimeout: ReturnType<typeof setTimeout> | null = null;
let saveAppStateTimeout: ReturnType<typeof setTimeout> | null = null;

const debouncedSaveGroups = (groups: Group[]) => {
  if (saveGroupsTimeout) clearTimeout(saveGroupsTimeout);
  saveGroupsTimeout = setTimeout(() => saveData('groups', groups), 500);
};

const debouncedSaveCollections = (collections: Collection[]) => {
  if (saveCollectionsTimeout) clearTimeout(saveCollectionsTimeout);
  saveCollectionsTimeout = setTimeout(() => saveData('collections', collections), 500);
};

const debouncedSaveAppState = (appState: { selectedStoryId: string | null; userCommandTemplate?: string; titleSuggestionPrompt?: string }) => {
  if (saveAppStateTimeout) clearTimeout(saveAppStateTimeout);
  saveAppStateTimeout = setTimeout(() => saveData('appState', appState), 500);
};

function syncPlanChildren(stories: Story[], parentStory: Story, now: number): Story[] {
  const canonicalSource = getLatestValidWritingPlanInStory(parentStory);
  if (!canonicalSource) {
    return stories;
  }
  const plan = canonicalSource.plan;

  const currentStories = stories.map((story) => ({ ...story }));
  const existingChildren = currentStories.filter((story) => story.parentStoryId === parentStory.id);
  const byChapter = new Map(existingChildren.map((story) => [story.chapterNumber || 0, story]));

  const upsertedChildren: Story[] = [];

  for (const chapter of plan.chapters) {
    const existingChild = byChapter.get(chapter.chapterNumber);
    const systemContent = parentStory.sections.find((section) => section.type === 'system')?.content || '';

    if (existingChild) {
      const systemSection = existingChild.sections.find((section) => section.type === 'system')
        || { id: uuidv4(), type: 'system' as const, content: '', thinkingContent: '', collapsed: false };
      const userSection = existingChild.sections.find((section) => section.type === 'user')
        || { id: uuidv4(), type: 'user' as const, content: parentStory.childPromptTemplate || '', thinkingContent: '', collapsed: false };
      const assistantSection = existingChild.sections.find((section) => section.type === 'assistant')
        || { id: uuidv4(), type: 'assistant' as const, content: parentStory.childResponseTemplate || '', thinkingContent: '', collapsed: false };

      const sections = [
        { ...systemSection, content: systemContent },
        userSection,
        assistantSection,
      ];

      upsertedChildren.push({
        ...existingChild,
        name: `${parentStory.name} - Chapter ${chapter.chapterNumber}`,
        chapterNumber: chapter.chapterNumber,
        chapterTitle: chapter.title,
        sections,
        updatedAt: now,
      });
      continue;
    }

    const sections = [
      { id: uuidv4(), type: 'system' as const, content: systemContent, thinkingContent: '', collapsed: false },
      { id: uuidv4(), type: 'user' as const, content: parentStory.childPromptTemplate || '', thinkingContent: '', collapsed: false },
      { id: uuidv4(), type: 'assistant' as const, content: parentStory.childResponseTemplate || '', thinkingContent: '', collapsed: false },
    ];

    upsertedChildren.push({
      id: uuidv4(),
      collectionId: parentStory.collectionId,
      name: `${parentStory.name} - Chapter ${chapter.chapterNumber}`,
      parentStoryId: parentStory.id,
      chapterNumber: chapter.chapterNumber,
      chapterTitle: chapter.title,
      writingPlan: null,
      promptPlaceholders: [],
      childPromptTemplate: '',
      childResponseTemplate: '',
      sections,
      totalCost: 0,
      totalTokens: 0,
      createdAt: now,
      updatedAt: now,
    });
  }

  const retained = currentStories.filter((story) => story.parentStoryId !== parentStory.id);
  return [...retained, ...upsertedChildren];
}

export const useDataStore = create<DataState>()(
  subscribeWithSelector(
    (set, get) => {
      const SAVE_DEBOUNCE_MS = 500;
      const SAVE_MAX_WAIT_MS = 3000;
      const storySaveTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
      const storyMaxWaitTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
      const pendingStorySaves = new Map<string, Story>();
      const saveStoryPayload = (story: Story) => story as unknown as { id: string; updatedAt?: number; [key: string]: unknown };
      const flushStorySave = async (storyId: string) => {
        const pending = pendingStorySaves.get(storyId);
        if (!pending) return;
        pendingStorySaves.delete(storyId);
        storySaveTimeouts.delete(storyId);
        const maxWaitTimeout = storyMaxWaitTimeouts.get(storyId);
        if (maxWaitTimeout) {
          clearTimeout(maxWaitTimeout);
          storyMaxWaitTimeouts.delete(storyId);
        }
        await saveStory(saveStoryPayload(pending));
      };

      const queueStorySave = (story: Story) => {
        pendingStorySaves.set(story.id, story);

        const existing = storySaveTimeouts.get(story.id);
        if (existing) {
          clearTimeout(existing);
        }

        if (!storyMaxWaitTimeouts.has(story.id)) {
          const maxWaitTimeout = setTimeout(() => {
            void flushStorySave(story.id);
          }, SAVE_MAX_WAIT_MS);
          storyMaxWaitTimeouts.set(story.id, maxWaitTimeout);
        }

        const timeout = setTimeout(() => {
          storySaveTimeouts.delete(story.id);
          void flushStorySave(story.id);
        }, SAVE_DEBOUNCE_MS);
        storySaveTimeouts.set(story.id, timeout);
      };

      const hasPendingStorySaves = () => pendingStorySaves.size > 0;

      const flushPendingStorySaves = async () => {
        const storyIds = Array.from(pendingStorySaves.keys());
        await Promise.all(storyIds.map((storyId) => flushStorySave(storyId)));
      };

      const queueStoryDeletes = (ids: string[]) => {
        ids.forEach((id) => {
          deleteStory(id);
        });
      };

      return {
      groups: [],
      collections: [],
      stories: [],
      isLoading: true,
      isInitialized: false,
      hasPendingStorySaves,
      flushPendingStorySaves,
      
      initialize: async () => {
        if (get().isInitialized) return;
        
        set({ isLoading: true });
        
        try {
          const [groups, collections, stories] = await Promise.all([
            fetchData<Group[]>('groups'),
            fetchData<Collection[]>('collections'),
            fetchData<Story[]>('stories'),
          ]);

          if (!groups || !collections || !stories) {
            throw new Error('Failed to load data from server');
          }
          
          const normalizedStories = (stories || []).map((story) => normalizeStory(story));

          set({
            groups: groups || [],
            collections: collections || [],
            stories: normalizedStories,
            isLoading: false,
            isInitialized: true,
          });
        } catch (error) {
          console.error('Failed to initialize data:', error);
          set({ isLoading: false, isInitialized: false });
          throw error;
        }
      },
      
      // Periodic sync with server to pull remote changes
      syncWithServer: async () => {
        try {
          const [groups, collections, stories] = await Promise.all([
            fetchData<Group[]>('groups'),
            fetchData<Collection[]>('collections'),
            fetchData<Story[]>('stories'),
          ]);
          
          if (!stories) return;
          
          const normalizedServerStories = stories.map((story) => normalizeStory(story));
          set({
            groups: groups || [],
            collections: collections || [],
            stories: normalizedServerStories,
          });
        } catch (error) {
          console.error('Failed to sync with server:', error);
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
          const removedStoryIds = state.stories
            .filter((s) => collectionIds.includes(s.collectionId))
            .map((s) => s.id);
          debouncedSaveGroups(newGroups);
          debouncedSaveCollections(newCollections);
          queueStoryDeletes(removedStoryIds);
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
          const removedStoryIds = state.stories
            .filter((s) => s.collectionId === id)
            .map((s) => s.id);
          debouncedSaveCollections(newCollections);
          queueStoryDeletes(removedStoryIds);
          return {
            collections: newCollections,
            stories: newStories,
          };
        });
      },
      
      // Story CRUD
      createStory: (collectionId: string, name: string) => {
        const now = Date.now();
        const sections = createInitialSections();
        const story: Story = {
          id: uuidv4(),
          collectionId,
          name,
          sections,
          totalCost: 0,
          totalTokens: 0,
          createdAt: now,
          updatedAt: now,
        };
        set((state) => {
          const newStories = [...state.stories, story];
          queueStorySave(story);
          return { stories: newStories };
        });
        return story;
      },
      
      updateStory: (id: string, updates: Partial<Pick<Story, 'name' | 'collectionId' | 'sections' | 'totalCost' | 'totalTokens'>>) => {
        set((state) => {
          const mappedStories = state.stories.map((s) =>
            s.id === id
              ? {
                  ...s,
                  ...updates,
                  updatedAt: Date.now(),
                }
              : s
          );
          const updatedStory = mappedStories.find((story) => story.id === id);
          const shouldSyncChildren = !!updates.sections && !!updatedStory && !updatedStory.parentStoryId && !!getLatestValidWritingPlanInStory(updatedStory);
          const newStories = shouldSyncChildren
            ? syncPlanChildren(mappedStories, updatedStory as Story, Date.now())
            : mappedStories;
          
          // Save individual story to avoid overwriting concurrent edits on other devices
          const storyToSave = newStories.find(s => s.id === id);
          if (storyToSave) {
            queueStorySave(storyToSave);
          }
          
          return { stories: newStories };
        });
      },
      
      deleteStory: (id: string) => {
        set((state) => {
          const queue = [id];
          const removeSet = new Set<string>();

          while (queue.length > 0) {
            const currentId = queue.pop();
            if (!currentId || removeSet.has(currentId)) continue;
            removeSet.add(currentId);

            state.stories
              .filter((story) => story.parentStoryId === currentId)
              .forEach((child) => queue.push(child.id));
          }

          const newStories = state.stories.filter((s) => !removeSet.has(s.id));
          queueStoryDeletes(Array.from(removeSet));
          return { stories: newStories };
        });
      },
      
      duplicateStory: (id: string) => {
        const story = get().stories.find((s) => s.id === id);
        if (!story) return null;
        
        const now = Date.now();
        const duplicatedSections = story.sections?.map((section) => ({
          ...section,
          id: uuidv4(),
        })) || createInitialSections();
        const duplicated: Story = {
          ...story,
          id: uuidv4(),
          name: `${story.name} (copy)`,
          sections: duplicatedSections,
          originalStoryId: story.id,
          totalCost: 0, // Reset cost for duplicated story
          totalTokens: 0,
          createdAt: now,
          updatedAt: now,
        };
        set((state) => {
          const newStories = [...state.stories, duplicated];
          queueStorySave(duplicated);
          return { stories: newStories };
        });
        return duplicated;
      },

      updateStoryPromptConfig: (storyId: string, updates: Partial<Pick<Story, 'promptPlaceholders' | 'childPromptTemplate' | 'childResponseTemplate' | 'writingPlan'>>) => {
        set((state) => {
          const now = Date.now();
          const mappedStories = state.stories.map((story) => {
            if (story.id !== storyId) return story;
            return {
              ...story,
              ...updates,
              updatedAt: now,
            };
          });

          const updatedParent = mappedStories.find((story) => story.id === storyId);
          const newStories = updatedParent && !updatedParent.parentStoryId && updates.writingPlan
            ? syncPlanChildren(mappedStories, updatedParent, now)
            : mappedStories;
          if (updatedParent) {
            const storiesToSave = newStories.filter((story) => (
              story.id === updatedParent.id || story.parentStoryId === updatedParent.id
            ));
            storiesToSave.forEach((story) =>
              queueStorySave(story)
            );
          }
          return { stories: newStories };
        });
      },

      applyWritingPlanFromStoryResponse: (storyId: string, assistantContent: string) => {
        set((state) => {
          const parentStory = state.stories.find((story) => story.id === storyId);
          if (!parentStory || parentStory.parentStoryId) return state;

          const parsedPlan = parseWritingPlanFromText(assistantContent);
          if (!parsedPlan) return state;

          const now = Date.now();
          const mappedStories = state.stories.map((story) => (
            story.id === parentStory.id
              ? { ...story, updatedAt: now }
              : story
          ));
          const refreshedParent = mappedStories.find((story) => story.id === parentStory.id);
          const newStories = refreshedParent
            ? syncPlanChildren(mappedStories, refreshedParent, now)
            : mappedStories;
          if (refreshedParent) {
            const storiesToSave = newStories.filter((story) => (
              story.id === refreshedParent.id || story.parentStoryId === refreshedParent.id
            ));
            storiesToSave.forEach((story) =>
              queueStorySave(story)
            );
          }
          return { stories: newStories };
        });
      },

      updateWritingPlanFromVariableEdit: (storyId: string, variableKey: string, value: string) => {
        set((state) => {
          const sourceStory = state.stories.find((story) => story.id === storyId);
          if (!sourceStory) return state;

          const parentStory = sourceStory.parentStoryId
            ? state.stories.find((story) => story.id === sourceStory.parentStoryId)
            : sourceStory;
          if (!parentStory) return state;

          const canonicalSource = getLatestValidWritingPlanInStory(parentStory);
          if (!canonicalSource) return state;

          const nextPlan = applyMutableVariableEdit(
            canonicalSource.plan,
            variableKey,
            value,
            sourceStory.chapterNumber
          );
          if (!nextPlan) return state;

          const canonicalSection = parentStory.sections[canonicalSource.sectionIndex];
          if (!canonicalSection || canonicalSection.type !== 'assistant') return state;

          const updatedCanonicalText = replaceWritingPlanInText(canonicalSection.content || '', nextPlan);
          const updatedSections = parentStory.sections.map((section, index) => (
            index === canonicalSource.sectionIndex
              ? { ...section, content: updatedCanonicalText }
              : section
          ));

          const newStories = state.stories.map((story) => (
            story.id === parentStory.id
              ? {
                ...story,
                sections: updatedSections,
                updatedAt: Date.now(),
              }
              : story
          ));

          const refreshedParent = newStories.find((story) => story.id === parentStory.id);
          const syncedStories = refreshedParent
            ? syncPlanChildren(newStories, refreshedParent, Date.now())
            : newStories;
          if (refreshedParent) {
            const storiesToSave = syncedStories.filter((story) => (
              story.id === refreshedParent.id || story.parentStoryId === refreshedParent.id
            ));
            storiesToSave.forEach((story) =>
              queueStorySave(story)
            );
          }
          return { stories: syncedStories };
        });
      },
      
      // Helpers
      getStoriesByCollection: (collectionId: string) => {
        return get().stories.filter((s) => s.collectionId === collectionId);
      },
      
      getCollectionsByGroup: (groupId: string) => {
        return get().collections.filter((c) => c.groupId === groupId);
      },
      };
    }
  )
);

// App UI state
interface AppState {
  selectedGroupId: string | null;
  selectedCollectionId: string | null;
  selectedStoryId: string | null;
  userCommandTemplate: string;
  titleSuggestionPrompt: string;
  isAppStateInitialized: boolean;
  
  initializeAppState: () => Promise<void>;
  setSelectedGroup: (id: string | null) => void;
  setSelectedCollection: (id: string | null) => void;
  setSelectedStory: (id: string | null) => void;
  setUserCommandTemplate: (template: string) => void;
  setTitleSuggestionPrompt: (prompt: string) => void;
}

export const useAppStore = create<AppState>()((set, get) => ({
  selectedGroupId: null,
  selectedCollectionId: null,
  selectedStoryId: null,
  userCommandTemplate: '{cursor}',
  titleSuggestionPrompt: 'Suggest a short, compelling title for this story. Reply with ONLY the title, no quotes, no extra text.\n\nStory content:\n{story}\n\nOther stories in this collection:\n{adjacent_titles}',
  isAppStateInitialized: false,
  
  initializeAppState: async () => {
    if (get().isAppStateInitialized) return;
    
    try {
      const appState = await fetchData<{ selectedStoryId: string | null; userCommandTemplate?: string; titleSuggestionPrompt?: string }>('appState');
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
      if (appState?.titleSuggestionPrompt) {
        set({ titleSuggestionPrompt: appState.titleSuggestionPrompt });
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
  setTitleSuggestionPrompt: (prompt) => {
    set({ titleSuggestionPrompt: prompt });
    debouncedSaveAppState({ selectedStoryId: get().selectedStoryId, userCommandTemplate: get().userCommandTemplate, titleSuggestionPrompt: prompt });
  },
}));
