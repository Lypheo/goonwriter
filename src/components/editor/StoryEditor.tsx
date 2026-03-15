import { useEffect, useRef, useState, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import Placeholder from '@tiptap/extension-placeholder';
import HardBreak from '@tiptap/extension-hard-break';
import { UndoRedo } from '@tiptap/extensions';
import { useDataStore, useAppStore, useGenerationStore, useModelStore, useCompletionModelStore } from '../../stores';
import { StoryDecorations, AiAuthored } from './extensions';
import { CompletionPopup, type CompletionItem } from './CompletionPopup';
import { streamSentenceCompletion } from '../../services/completionService';
import type { CompletionModelConfig } from '../../types';

// Escape HTML entities for special tokens that should be visible as-is
function escapeSpecialTokens(html: string): string {
  // Only escape angle brackets that are part of special tokens like <<start_sys_prompt>>
  // but NOT the HTML tags we use for structure
  return html
    .replace(/<<([^>]+)>>/g, '&lt;&lt;$1&gt;&gt;');
}

// Convert plain text with newlines to HTML paragraphs (for legacy migration)
function textToHtml(text: string): string {
  if (!text) return '<p></p>';
  // Split by double newlines for paragraphs
  const paragraphs = text.split(/\n\n+/);
  return paragraphs
    .map(p => {
      // Escape special tokens, then convert single newlines to <br>
      const escaped = escapeSpecialTokens(
        p.replace(/&/g, '&amp;')
         .replace(/</g, '&lt;')
         .replace(/>/g, '&gt;')
      );
      const withBreaks = escaped.replace(/\n/g, '<br>');
      return `<p>${withBreaks || '<br>'}</p>`;
    })
    .join('');
}

export function StoryEditor() {
  const { stories, updateStory } = useDataStore();
  const { selectedStoryId } = useAppStore();
  const { userCommandTemplate, setUserCommandTemplate } = useAppStore();
  const { isGenerating } = useGenerationStore();
  const { models } = useModelStore();
  const { getEnabledModels, accumulateCost } = useCompletionModelStore();
  
  const selectedStory = stories.find((s) => s.id === selectedStoryId);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedHtmlRef = useRef<string>('');
  const isUpdatingRef = useRef(false);
  
  // User command template editor state
  const [showTemplateEditor, setShowTemplateEditor] = useState(false);
  const [templateDraft, setTemplateDraft] = useState('');
  
  // Chapter summaries editor state
  const [showSummariesEditor, setShowSummariesEditor] = useState(false);
  const [summariesDraft, setSummariesDraft] = useState('');
  const summariesMirrorRef = useRef<HTMLDivElement>(null);
  
  // Track cursor position for authorship display
  const [cursorAuthor, setCursorAuthor] = useState<{ author: 'user' | 'ai'; modelId?: string }>({ author: 'user' });
  
  // Sentence completion state
  const [completionItems, setCompletionItems] = useState<CompletionItem[]>([]);
  const [completionVisible, setCompletionVisible] = useState(false);
  const [completionSelectedIndex, setCompletionSelectedIndex] = useState(0);
  const [completionPosition, setCompletionPosition] = useState({ top: 0, left: 0 });
  const completionAbortControllers = useRef<Map<string, AbortController>>(new Map());
  const completionActiveRef = useRef(false);
  const editorRef = useRef<ReturnType<typeof useEditor>>(null);
  
  // Refs to avoid re-creating the keyboard handler on every streaming chunk
  const completionItemsRef = useRef<CompletionItem[]>([]);
  const completionSelectedIndexRef = useRef(0);
  const acceptCompletionRef = useRef<(index: number) => void>(() => {});
  
  // Get the HTML content, migrating from plain text if needed
  const getEditorContent = useCallback(() => {
    if (!selectedStory) return '<p></p>';
    
    // If htmlContent exists, use it
    if (selectedStory.htmlContent) {
      return selectedStory.htmlContent;
    }
    
    // Migration: convert plain text content to HTML
    return textToHtml(selectedStory.content || '');
  }, [selectedStory]);
  
  // Cancel all active completion streams
  const cancelCompletions = useCallback(() => {
    completionAbortControllers.current.forEach((c) => c.abort());
    completionAbortControllers.current.clear();
    completionActiveRef.current = false;
    setCompletionVisible(false);
    setCompletionItems([]);
    setCompletionSelectedIndex(0);
  }, []);
  
  // Accept a completion and insert it at cursor
  const acceptCompletion = useCallback(
    (index: number) => {
      const item = completionItemsRef.current[index];
      if (!item || !item.text || !editorRef.current) return;
      
      cancelCompletions();
      
      // Insert the text at current cursor position
      editorRef.current.chain().focus().insertContent(item.text).run();
    },
    [cancelCompletions]
  );

  // Keep ref in sync for keyboard handler
  acceptCompletionRef.current = acceptCompletion;

  // Keep refs in sync with state
  completionItemsRef.current = completionItems;
  completionSelectedIndexRef.current = completionSelectedIndex;

  // Start streaming completions from all enabled models
  const startCompletionStreams = useCallback(
    (enabledModels: CompletionModelConfig[], context: string, pos: { top: number; left: number }) => {
      cancelCompletions();
      completionActiveRef.current = true;
      
      setCompletionPosition(pos);
      setCompletionSelectedIndex(0);
      
      const initialItems: CompletionItem[] = enabledModels.map((m) => ({
        modelId: m.id,
        modelName: m.name,
        text: '',
        isLoading: true,
      }));
      setCompletionItems(initialItems);
      setCompletionVisible(true);
      
      enabledModels.forEach((model) => {
        const controller = new AbortController();
        completionAbortControllers.current.set(model.id, controller);
        
        streamSentenceCompletion(model, context, {
          onChunk: (fullText) => {
            if (!completionActiveRef.current) return;
            setCompletionItems((prev) =>
              prev.map((item) =>
                item.modelId === model.id ? { ...item, text: fullText } : item
              )
            );
          },
          onUsage: (usage) => {
            accumulateCost(model.id, usage.cost || 0, usage.total_tokens || 0);
          },
          onError: (error) => {
            if (!completionActiveRef.current) return;
            setCompletionItems((prev) =>
              prev.map((item) =>
                item.modelId === model.id
                  ? { ...item, isLoading: false, error }
                  : item
              )
            );
          },
          onComplete: (finalText) => {
            if (!completionActiveRef.current) return;
            setCompletionItems((prev) =>
              prev.map((item) =>
                item.modelId === model.id
                  ? { ...item, text: finalText, isLoading: false }
                  : item
              )
            );
            completionAbortControllers.current.delete(model.id);
          },
        }, controller.signal);
      });
    },
    [cancelCompletions, accumulateCost]
  );

  const editor = useEditor({
    extensions: [
      Document,
      Paragraph,
      Text,
      HardBreak,
      UndoRedo,
      AiAuthored, // Mark for tracking AI-authored text
      Placeholder.configure({
        placeholder: 'Start writing your story...',
      }),
      StoryDecorations,
    ],
    content: getEditorContent(),
    editable: !isGenerating,
    onSelectionUpdate: ({ editor }) => {
      // Dismiss completion popup when cursor moves
      if (completionActiveRef.current) {
        cancelCompletions();
      }
      // Check if the cursor is in AI-authored text by checking marks at position
      const { from } = editor.state.selection;
      const $pos = editor.state.doc.resolve(from);
      
      // Check marks at cursor position
      const marks = $pos.marks();
      const aiMark = marks.find(m => m.type.name === 'aiAuthored');
      
      if (aiMark) {
        setCursorAuthor({ 
          author: 'ai', 
          modelId: aiMark.attrs.modelId 
        });
      } else {
        setCursorAuthor({ author: 'user' });
      }
    },
    onUpdate: ({ editor }) => {
      if (isUpdatingRef.current) return;
      
      const htmlContent = editor.getHTML();
      const plainText = editor.getText({ blockSeparator: '\n\n' });
      
      if (selectedStory && htmlContent !== lastSavedHtmlRef.current) {
        // Schedule auto-save
        if (autoSaveTimerRef.current) {
          clearTimeout(autoSaveTimerRef.current);
        }
        
        autoSaveTimerRef.current = setTimeout(() => {
          updateStory(selectedStory.id, {
            content: plainText,
            htmlContent: htmlContent,
          });
          lastSavedHtmlRef.current = htmlContent;
        }, 1000); // Auto-save after 1 second of inactivity
        
        // Update the ref immediately to track changes
        lastSavedHtmlRef.current = htmlContent;
      }
    },
  });
  
  // Keep editor ref in sync
  editorRef.current = editor;
  
  // Update editor content when story changes
  useEffect(() => {
    if (editor && selectedStory) {
      const targetContent = getEditorContent();
      const currentContent = editor.getHTML();
      
      // Only update if content is different
      if (currentContent !== targetContent) {
        isUpdatingRef.current = true;
        editor.commands.setContent(targetContent);
        lastSavedHtmlRef.current = targetContent;
        isUpdatingRef.current = false;
      }
    }
  }, [editor, selectedStory?.id, selectedStory?.htmlContent, getEditorContent]);
  
  // Update editable state when generating
  useEffect(() => {
    if (editor) {
      editor.setEditable(!isGenerating);
    }
  }, [editor, isGenerating]);
  
  // Cleanup
  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
      cancelCompletions();
    };
  }, [cancelCompletions]);
  
  // Cancel completions when story changes
  useEffect(() => {
    cancelCompletions();
  }, [selectedStoryId, cancelCompletions]);
  
  // Keyboard handler for completion popup + Tab trigger
  // Registered on editor.view.dom in CAPTURE phase so it fires BEFORE
  // ProseMirror's own handler. stopImmediatePropagation prevents PM from
  // ever seeing consumed keys (PM's captureKeyDown swallows Escape/arrows).
  useEffect(() => {
    if (!editor) return;
    
    const handleEditorKeyDown = (e: KeyboardEvent) => {
      // When completion popup is active, Enter accepts the selected completion
      if (completionActiveRef.current) {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.stopImmediatePropagation();
          acceptCompletionRef.current(completionSelectedIndexRef.current);
          return;
        }
        // Tab cycles through completions instead of triggering new ones
        if (e.key === 'Tab' && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
          e.preventDefault();
          e.stopImmediatePropagation();
          setCompletionSelectedIndex((prev) =>
            prev < completionItemsRef.current.length - 1 ? prev + 1 : 0
          );
          return;
        }
        if (e.key === 'Tab' && e.shiftKey) {
          e.preventDefault();
          e.stopImmediatePropagation();
          setCompletionSelectedIndex((prev) =>
            prev > 0 ? prev - 1 : completionItemsRef.current.length - 1
          );
          return;
        }
      }
      
      // Tab triggers completion (only when popup is not active)
      if (e.key !== 'Tab' || e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;
      if (isGenerating) return;
      
      const enabledModels = getEnabledModels();
      if (enabledModels.length === 0) return;
      
      e.preventDefault();
      e.stopImmediatePropagation();
      
      // Get text before cursor using ProseMirror's textBetween for accurate mapping
      const { from } = editor.state.selection;
      const textBeforeCursor = editor.state.doc.textBetween(0, from, '\n\n');
      
      // Get context (last N chars)
      const defaultContextLen = 1000;
      const contextLength = enabledModels[0]?.contextLength || defaultContextLen;
      const context = textBeforeCursor.slice(-contextLength);
      
      if (!context.trim()) return; // No content to complete from
      
      // Get cursor screen position for popup placement  
      const view = editor.view;
      const coords = view.coordsAtPos(from);
      const popupPos = {
        top: coords.bottom + 4,
        left: coords.left,
      };
      
      // Start streaming completions
      startCompletionStreams(enabledModels, context, popupPos);
    };

    // Click outside popup dismisses it
    const handleMouseDown = (e: MouseEvent) => {
      if (!completionActiveRef.current) return;
      const popup = document.querySelector('.completion-popup');
      if (popup && !popup.contains(e.target as Node)) {
        cancelCompletions();
      }
    };
    
    // CAPTURE phase on editor DOM — fires before ProseMirror's bubble-phase handler
    const editorDom = editor.view.dom;
    editorDom.addEventListener('keydown', handleEditorKeyDown, true);
    document.addEventListener('mousedown', handleMouseDown);
    
    return () => {
      editorDom.removeEventListener('keydown', handleEditorKeyDown, true);
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, [editor, isGenerating, getEnabledModels, startCompletionStreams, cancelCompletions]);
  
  if (!selectedStory) {
    return (
      <div className="flex-1 flex items-center justify-center bg-white">
        <div className="text-center text-gray-400">
          <svg
            className="w-16 h-16 mx-auto mb-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <p className="text-lg">Select a story to start writing</p>
          <p className="text-sm mt-2">
            Or create a new one using the sidebar
          </p>
        </div>
      </div>
    );
  }
  
  // Get model name from ID
  const getModelName = (modelId?: string) => {
    if (!modelId) return 'Unknown Model';
    const model = models.find(m => m.modelId === modelId);
    return model?.name || modelId;
  };
  
  // Compute total completion cost across all models
  const completionModels = useCompletionModelStore((s) => s.models);
  const totalCompletionCost = completionModels.reduce((sum, m) => sum + m.totalCost, 0);
  const totalCompletionTokens = completionModels.reduce((sum, m) => sum + m.totalTokens, 0);
  
  return (
    <div className="flex-1 flex flex-col bg-white overflow-hidden">
      {/* Story Title */}
      <div className="px-6 py-3 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-gray-800">{selectedStory.name}</h1>
          {/* Undo/Redo buttons */}
          <div className="flex items-center gap-1 ml-2">
            <button
              onClick={() => editor?.chain().focus().undo().run()}
              disabled={!editor?.can().undo()}
              className="p-1.5 rounded text-gray-500 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Undo (Ctrl+Z)"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a5 5 0 015 5v2M3 10l4-4M3 10l4 4" />
              </svg>
            </button>
            <button
              onClick={() => editor?.chain().focus().redo().run()}
              disabled={!editor?.can().redo()}
              className="p-1.5 rounded text-gray-500 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Redo (Ctrl+Y)"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 10H11a5 5 0 00-5 5v2M21 10l-4-4M21 10l-4 4" />
              </svg>
            </button>
            <div className="flex items-center gap-1 border-l border-gray-200 pl-2 ml-1">
              <input 
                type="number"
                min="1"
                className="w-12 h-6 px-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                value={selectedStory.chapterNumber ?? 1}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (!isNaN(val)) {
                    updateStory(selectedStory.id, { chapterNumber: val });
                  }
                }}
                title="Chapter number (n)"
              />
              <button
                onClick={() => {
                  setSummariesDraft(selectedStory.chapterSummaries ?? '');
                  setShowSummariesEditor(true);
                }}
                className="p-1 rounded text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                title="Edit Chapter Summaries"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
            </div>
            <button
              onClick={() => {
                if (!editor) return;
                const template = userCommandTemplate;
                const cursorMarker = '{cursor}';
                const chapterNum = selectedStory.chapterNumber ?? 1;
                const summaries = (selectedStory.chapterSummaries ?? '').split(/\r?\n/);

                let resolved = template.replace(/\{\{\s*n\s*\}\}/g, chapterNum.toString());

                resolved = resolved.replace(/\{\{\s*(-?\d+)\s*\}\}/g, (_, match) => {
                  const targetNum = chapterNum + parseInt(match, 10);
                  const idx = targetNum - 1; // 1-based index to 0-based array index
                  return (idx >= 0 && idx < summaries.length) ? summaries[idx] : `[Missing Summary ${targetNum}]`;
                });

                // Replace literal \n with actual newlines
                resolved = resolved.replace(/\\n/g, '\n');
                
                const resolvedCursorIdx = resolved.indexOf(cursorMarker) >= 0 ? resolved.indexOf(cursorMarker) : -1;
                if (resolvedCursorIdx >= 0) {
                  const before = resolved.slice(0, resolvedCursorIdx);
                  const after = resolved.slice(resolvedCursorIdx + cursorMarker.length);
                  editor.chain().focus().insertContent(before + after).run();
                  const { to } = editor.state.selection;
                  const newPos = to - after.length;
                  editor.commands.setTextSelection(newPos);
                } else {
                  editor.chain().focus().insertContent(resolved).run();
                }

                // Increment chapter number automatically
                updateStory(selectedStory.id, { chapterNumber: chapterNum + 1 });
              }}
              className="p-1.5 rounded text-gray-500 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Insert user command"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </button>
            <button
              onClick={() => {
                setTemplateDraft(userCommandTemplate);
                setShowTemplateEditor(true);
              }}
              className="p-1.5 rounded text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
              title="Configure user command template"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </div>
        </div>
        {isGenerating && (
          <span className="text-sm text-blue-600 flex items-center gap-2">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
                fill="none"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            Generating...
          </span>
        )}
      </div>
      
      {/* Editor */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <EditorContent
            editor={editor}
            className="story-editor prose prose-lg max-w-none"
          />
        </div>
      </div>
      
      {/* Sentence Completion Popup */}
      <CompletionPopup
        items={completionItems}
        position={completionPosition}
        selectedIndex={completionSelectedIndex}
        onSelect={acceptCompletion}
        onCancel={cancelCompletions}
        visible={completionVisible}
      />
      
      {/* Authorship Footer */}
      <div className="px-6 py-2 border-t border-gray-200 bg-gray-50 text-xs text-gray-600 flex items-center justify-between">
        <div>
          {cursorAuthor.author === 'ai' ? (
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-400"></span>
              Generated by {getModelName(cursorAuthor.modelId)}
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-gray-400"></span>
              Written by you
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {totalCompletionCost > 0 && (
            <span className="text-gray-400 font-mono" title="Sentence completion cost (all models)">
              ✎{' '}
              {totalCompletionCost < 0.1
                ? `${(totalCompletionCost * 100).toFixed(3)}¢`
                : `$${totalCompletionCost.toFixed(3)}`}
              {' '}({totalCompletionTokens.toLocaleString()} tok)
            </span>
          )}
          {" | "}
          {(selectedStory.totalCost > 0 || selectedStory.totalTokens > 0) && (
            <div className="text-gray-400 font-mono" title="Accumulated generation cost and tokens for this story">
              {selectedStory.totalTokens.toLocaleString()} tokens | 
              {selectedStory.totalCost > 0 && (
                <span className="ml-2">
                  {selectedStory.totalCost < 0.1 
                    ? `${(selectedStory.totalCost * 100).toFixed(3)}¢`
                    : `$${selectedStory.totalCost.toFixed(3)}`}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
      
      {/* User Command Template Editor */}
      {showTemplateEditor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setShowTemplateEditor(false)}>
          <div className="bg-white rounded-lg shadow-xl w-[480px] p-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">User Command Template</h3>
            <p className="text-xs text-gray-500 mb-3">
              Use <code className="bg-gray-100 px-1 rounded">{'{cursor}'}</code> to mark where the cursor should be placed.
              Use <code className="bg-gray-100 px-1 rounded">\n</code> for newlines.
            </p>
            <textarea
              value={templateDraft}
              onChange={(e) => setTemplateDraft(e.target.value)}
              className="w-full h-32 px-3 py-2 text-sm font-mono border border-gray-300 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500 resize-none"
              spellCheck={false}
            />
            <div className="flex justify-between items-center mt-3">
              <button
                onClick={() => {
                  setTemplateDraft('<<end_ai>><<start_user>>{cursor}<<end_user>><<start_ai>><think>\\n...\\n</think>\\n');
                }}
                className="text-xs text-gray-500 hover:text-gray-700 underline"
              >
                Reset to default
              </button>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowTemplateEditor(false)}
                  className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-md"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setUserCommandTemplate(templateDraft);
                    setShowTemplateEditor(false);
                  }}
                  className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Chapter Summaries Editor */}
      {showSummariesEditor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setShowSummariesEditor(false)}>
          <div className="bg-white rounded-lg shadow-xl w-[800px] p-4 flex flex-col h-[70vh] max-h-[800px]" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-800 mb-2">Chapter Summaries</h3>
            <p className="text-sm text-gray-600 mb-4">
              Enter one summary per line. The first line is Chapter 1, the second is Chapter 2, etc. Use <code className="bg-gray-100 px-1 rounded">{'{{n}}'}</code> in the User Command Template to inject summaries relative to the current chapter.
            </p>
            <div className="flex-1 min-h-0 relative border border-gray-300 rounded-md group focus-within:ring-1 focus-within:ring-blue-500 focus-within:border-blue-500 bg-white shadow-sm overflow-hidden">
              {/* Left Gutter Background */}
              <div aria-hidden="true" className="absolute top-0 left-0 bottom-0 w-12 bg-gray-50 border-r border-gray-200 pointer-events-none z-0" />
              
              {/* Invisible Mirror for sync layout */}
              <div 
                ref={summariesMirrorRef}
                aria-hidden="true" 
                className="absolute inset-0 z-10 overflow-y-auto pointer-events-none text-transparent font-mono text-sm leading-6 py-3 whitespace-pre-wrap break-words pr-3"
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
              >
                <div className="flex flex-col w-full">
                  {(summariesDraft || '').split('\n').map((line, i) => (
                    <div key={i} className="flex min-w-0">
                      <div className="w-12 flex-shrink-0 text-right pr-3 text-gray-400 select-none">
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0 break-words pl-3">
                        {line || '\u200B'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              
              <textarea
                value={summariesDraft}
                onChange={(e) => setSummariesDraft(e.target.value)}
                className="relative z-20 w-full h-full py-3 pl-[3.75rem] pr-3 text-sm font-mono focus:outline-none resize-none leading-6 bg-transparent text-gray-700 whitespace-pre-wrap break-words"
                spellCheck={false}
                onScroll={(e) => {
                  if (summariesMirrorRef.current) {
                    summariesMirrorRef.current.scrollTop = e.currentTarget.scrollTop;
                  }
                }}
              />
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setShowSummariesEditor(false)}
                className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-md"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  updateStory(selectedStory.id, { chapterSummaries: summariesDraft });
                  setShowSummariesEditor(false);
                }}
                className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
