import { useEffect, useState } from 'react';
import { useAppStore, useDataStore } from '../../stores';
import type { PromptPlaceholder, Story } from '../../types';

const BLUEPRINT_EDITOR_HEIGHTS_KEY = 'goonwriter:blueprintEditorHeights';
type EditorHeights = Record<string, number>;

const ChevronIcon = ({ isOpen }: { isOpen: boolean }) => (
  <svg
    className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-90' : ''}`}
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
  >
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
  </svg>
);

export function PromptEngineeringSidebar() {
  const { stories, updateStoryPromptConfig } = useDataStore();
  const { selectedStoryId } = useAppStore();

  const [isTemplatesOpen, setIsTemplatesOpen] = useState(true);
  const [isPlaceholdersOpen, setIsPlaceholdersOpen] = useState(true);
  const [editorHeights, setEditorHeights] = useState<EditorHeights>({});
  const [loadedEditorHeightsStoryId, setLoadedEditorHeightsStoryId] = useState<string | null>(null);

  const selectedStory = stories.find((story) => story.id === selectedStoryId) || null;
  const selectedParentStory = selectedStory
    ? (selectedStory.parentStoryId ? stories.find((story) => story.id === selectedStory.parentStoryId) || null : selectedStory)
    : null;

  const getEditorHeightsStorageKey = (storyId: string) => `${BLUEPRINT_EDITOR_HEIGHTS_KEY}:${storyId}`;

  const setEditorHeight = (key: string, height: number) => {
    const normalized = Math.max(80, Math.round(height));
    setEditorHeights((prev) => {
      if (prev[key] === normalized) return prev;
      return { ...prev, [key]: normalized };
    });
  };

  const getEditorHeight = (key: string, fallback: number) => editorHeights[key] ?? fallback;

  const updateSelectedParent = (updates: Partial<Pick<Story, 'childPromptTemplate' | 'childResponseTemplate' | 'promptPlaceholders'>>) => {
    if (!selectedParentStory) return;
    updateStoryPromptConfig(selectedParentStory.id, updates);
  };

  useEffect(() => {
    const storyId = selectedParentStory?.id;
    if (!storyId || typeof window === 'undefined') {
      setEditorHeights({});
      setLoadedEditorHeightsStoryId(null);
      return;
    }

    const raw = window.localStorage.getItem(getEditorHeightsStorageKey(storyId));
    if (!raw) {
      setEditorHeights({});
      setLoadedEditorHeightsStoryId(storyId);
      return;
    }

    try {
      const parsed = JSON.parse(raw) as EditorHeights;
      setEditorHeights(parsed && typeof parsed === 'object' ? parsed : {});
      setLoadedEditorHeightsStoryId(storyId);
    } catch {
      setEditorHeights({});
      setLoadedEditorHeightsStoryId(storyId);
    }
  }, [selectedParentStory?.id]);

  useEffect(() => {
    const storyId = selectedParentStory?.id;
    if (!storyId || typeof window === 'undefined') return;
    if (loadedEditorHeightsStoryId !== storyId) return;
    window.localStorage.setItem(getEditorHeightsStorageKey(storyId), JSON.stringify(editorHeights));
  }, [editorHeights, selectedParentStory?.id, loadedEditorHeightsStoryId]);

  const addPlaceholder = () => {
    if (!selectedParentStory) return;
    const current = selectedParentStory.promptPlaceholders || [];
    const next: PromptPlaceholder[] = [
      ...current,
      {
        id: crypto.randomUUID(),
        name: `placeholder_${current.length + 1}`,
        value: '',
        collapsed: false,
      },
    ];
    updateSelectedParent({ promptPlaceholders: next });
  };

  const updatePlaceholder = (id: string, updates: Partial<PromptPlaceholder>) => {
    if (!selectedParentStory) return;
    const current = selectedParentStory.promptPlaceholders || [];
    const next = current.map((placeholder) => (placeholder.id === id ? { ...placeholder, ...updates } : placeholder));
    updateSelectedParent({ promptPlaceholders: next });
  };

  const updatePlaceholderEditorHeight = (id: string, height: number) => {
    const normalized = Math.max(80, Math.round(height));
    const current = selectedParentStory?.promptPlaceholders?.find((placeholder) => placeholder.id === id);
    if (!current) return;
    if ((current.editorHeight ?? 96) === normalized) return;
    updatePlaceholder(id, { editorHeight: normalized });
  };

  const removePlaceholder = (id: string) => {
    if (!selectedParentStory) return;
    const current = selectedParentStory.promptPlaceholders || [];
    const next = current.filter((placeholder) => placeholder.id !== id);
    updateSelectedParent({ promptPlaceholders: next });
  };

  return (
    <div className="w-full h-full bg-gray-50 flex flex-col">
      <div className="p-3 border-b border-gray-200">
        <h2 className="font-semibold text-gray-800">Story Blueprint</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {!selectedParentStory ? (
          <p className="text-xs text-gray-500">Select a parent story (or one of its chapters) to edit placeholders and templates.</p>
        ) : (
          <>
            <div className="rounded border border-gray-200 bg-white overflow-hidden">
              <button
                type="button"
                className="w-full px-2 py-1.5 bg-gray-50 text-left flex items-center justify-between"
                onClick={() => setIsTemplatesOpen((value) => !value)}
              >
                <span className="text-xs font-semibold text-gray-700">Templates</span>
                <ChevronIcon isOpen={isTemplatesOpen} />
              </button>

              {isTemplatesOpen && (
                <div className="p-2 border-t border-gray-200 space-y-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-600 mb-1">Child prompt template</label>
                    <textarea
                      value={selectedParentStory.childPromptTemplate || ''}
                      onChange={(e) => updateSelectedParent({ childPromptTemplate: e.target.value })}
                      onMouseUp={(e) => setEditorHeight('child-prompt-template', e.currentTarget.offsetHeight)}
                      onBlur={(e) => setEditorHeight('child-prompt-template', e.currentTarget.offsetHeight)}
                      style={{ height: `${getEditorHeight('child-prompt-template', 96)}px` }}
                      className="w-full px-2 py-1.5 text-sm leading-relaxed border border-gray-300 rounded resize-y"
                      spellCheck={false}
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-600 mb-1">Child response template</label>
                    <textarea
                      value={selectedParentStory.childResponseTemplate || ''}
                      onChange={(e) => updateSelectedParent({ childResponseTemplate: e.target.value })}
                      onMouseUp={(e) => setEditorHeight('child-response-template', e.currentTarget.offsetHeight)}
                      onBlur={(e) => setEditorHeight('child-response-template', e.currentTarget.offsetHeight)}
                      style={{ height: `${getEditorHeight('child-response-template', 80)}px` }}
                      className="w-full px-2 py-1.5 text-sm leading-relaxed border border-gray-300 rounded resize-y"
                      spellCheck={false}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="rounded border border-gray-200 bg-white overflow-hidden">
              <button
                type="button"
                className="w-full px-2 py-1.5 bg-gray-50 text-left flex items-center justify-between"
                onClick={() => setIsPlaceholdersOpen((value) => !value)}
              >
                <span className="text-xs font-semibold text-gray-700">Placeholders</span>
                <ChevronIcon isOpen={isPlaceholdersOpen} />
              </button>

              {isPlaceholdersOpen && (
                <div className="p-2 border-t border-gray-200 space-y-2">
                  <div className="flex justify-between items-center">
                    <p className="text-[11px] text-gray-500">Use syntax like <span className="font-mono">{'{{style_guide}}'}</span></p>
                    <button
                      type="button"
                      onClick={addPlaceholder}
                      className="px-2 py-1 text-[11px] rounded border border-gray-300 hover:bg-gray-50"
                    >
                      Add
                    </button>
                  </div>
                  {(selectedParentStory.promptPlaceholders || []).map((placeholder) => (
                    <div key={placeholder.id} className="border border-gray-200 rounded">
                      <div className="flex items-center gap-1 p-1.5 bg-gray-50 border-b border-gray-200">
                        <button
                          type="button"
                          className="p-0.5"
                          onClick={() => updatePlaceholder(placeholder.id, { collapsed: !placeholder.collapsed })}
                          title={placeholder.collapsed ? 'Expand' : 'Collapse'}
                        >
                          <ChevronIcon isOpen={!placeholder.collapsed} />
                        </button>
                        <input
                          value={placeholder.name}
                          onChange={(e) => updatePlaceholder(placeholder.id, { name: e.target.value })}
                          className="flex-1 min-w-0 px-1.5 py-1 text-xs border border-gray-300 rounded"
                          placeholder="placeholder_name"
                        />
                        <button
                          type="button"
                          className="px-1.5 py-1 text-[11px] text-red-600 hover:bg-red-50 rounded"
                          onClick={() => removePlaceholder(placeholder.id)}
                        >
                          Remove
                        </button>
                      </div>
                      {!placeholder.collapsed && (
                        <textarea
                          value={placeholder.value}
                          onChange={(e) => updatePlaceholder(placeholder.id, { value: e.target.value })}
                          onMouseUp={(e) => updatePlaceholderEditorHeight(placeholder.id, e.currentTarget.offsetHeight)}
                          onBlur={(e) => updatePlaceholderEditorHeight(placeholder.id, e.currentTarget.offsetHeight)}
                          style={{ height: `${placeholder.editorHeight ?? 96}px` }}
                          className="w-full p-2 text-sm leading-relaxed border-0 rounded-b resize-y"
                          spellCheck={false}
                        />
                      )}
                    </div>
                  ))}
                  {(selectedParentStory.promptPlaceholders || []).length === 0 && (
                    <p className="text-xs text-gray-400">No placeholders yet.</p>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
