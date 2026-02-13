import { useEffect, useRef, useState, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import Placeholder from '@tiptap/extension-placeholder';
import HardBreak from '@tiptap/extension-hard-break';
import { useDataStore, useAppStore, useGenerationStore, useModelStore } from '../../stores';
import { StoryDecorations, setAuthorshipSpans } from './extensions';
import type { AuthorshipSpan } from '../../types';

// Escape HTML entities to prevent angle brackets from being interpreted as tags
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Convert plain text with newlines to HTML paragraphs
function textToHtml(text: string): string {
  if (!text) return '<p></p>';
  // Split by double newlines for paragraphs
  const paragraphs = text.split(/\n\n+/);
  return paragraphs
    .map(p => {
      // First escape HTML entities, then convert single newlines to <br>
      const escaped = escapeHtml(p);
      const withBreaks = escaped.replace(/\n/g, '<br>');
      return `<p>${withBreaks || '<br>'}</p>`;
    })
    .join('');
}

// Convert HTML content back to plain text (for future use)
// function htmlToText(html: string): string {
//   return html
//     .replace(/<br\s*\/?>/gi, '\n')
//     .replace(/<\/p><p>/gi, '\n\n')
//     .replace(/<\/?p>/gi, '')
//     .replace(/<[^>]+>/g, '');
// }

// Merge overlapping authorship spans and consolidate
function normalizeAuthorshipSpans(spans: AuthorshipSpan[]): AuthorshipSpan[] {
  if (spans.length === 0) return [];
  
  // Sort by start position
  const sorted = [...spans].sort((a, b) => a.start - b.start);
  const result: AuthorshipSpan[] = [];
  let current = { ...sorted[0] };
  
  for (let i = 1; i < sorted.length; i++) {
    const span = sorted[i];
    
    // If same author and adjacent/overlapping, merge
    if (
      span.start <= current.end &&
      span.author === current.author &&
      span.modelId === current.modelId
    ) {
      current.end = Math.max(current.end, span.end);
    } else if (span.start < current.end) {
      // Overlapping with different author - trim current
      if (current.end > span.start) {
        current.end = span.start;
      }
      if (current.end > current.start) {
        result.push(current);
      }
      current = { ...span };
    } else {
      result.push(current);
      current = { ...span };
    }
  }
  
  result.push(current);
  return result.filter((s) => s.end > s.start);
}

// Update spans after text change
function updateSpansOnEdit(
  spans: AuthorshipSpan[],
  changeStart: number,
  removedLength: number,
  addedLength: number
): AuthorshipSpan[] {
  const delta = addedLength - removedLength;
  const changeEnd = changeStart + removedLength;
  
  const updated: AuthorshipSpan[] = [];
  
  for (const span of spans) {
    if (span.end <= changeStart) {
      // Span is entirely before change - keep as is
      updated.push(span);
    } else if (span.start >= changeEnd) {
      // Span is entirely after change - shift by delta
      updated.push({
        ...span,
        start: span.start + delta,
        end: span.end + delta,
      });
    } else if (span.start < changeStart && span.end > changeEnd) {
      // Change is within span - split into two parts (before and after)
      // Part before the change
      updated.push({
        ...span,
        end: changeStart,
      });
      // Part after the change (shifted by delta)
      updated.push({
        ...span,
        start: changeStart + addedLength,
        end: span.end + delta,
      });
    } else if (span.start >= changeStart && span.end <= changeEnd) {
      // Span is entirely within change - remove it
      continue;
    } else if (span.start < changeStart) {
      // Span starts before change but overlaps - truncate
      updated.push({
        ...span,
        end: changeStart,
      });
    } else {
      // Span starts within change but extends beyond - adjust
      updated.push({
        ...span,
        start: changeStart + addedLength,
        end: span.end + delta,
      });
    }
  }
  
  return normalizeAuthorshipSpans(updated);
}

export function StoryEditor() {
  const { stories, updateStory } = useDataStore();
  const { selectedStoryId } = useAppStore();
  const { isGenerating } = useGenerationStore();
  const { models } = useModelStore();
  
  const selectedStory = stories.find((s) => s.id === selectedStoryId);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedContentRef = useRef<string>('');
  const isUpdatingRef = useRef(false);
  
  // Track cursor position for authorship display
  const [cursorAuthor, setCursorAuthor] = useState<{ author: 'user' | 'ai' | null; modelId?: string }>({ author: null });
  
  // Get author at a given text position
  const getAuthorAtPosition = useCallback((pos: number, spans: AuthorshipSpan[]): { author: 'user' | 'ai' | null; modelId?: string } => {
    for (const span of spans) {
      if (pos >= span.start && pos < span.end) {
        return { author: span.author, modelId: span.modelId };
      }
    }
    return { author: null };
  }, []);
  
  // Set initial authorship spans before editor creation
  if (selectedStory) {
    setAuthorshipSpans(selectedStory.authorshipSpans || []);
  }
  
  const editor = useEditor({
    extensions: [
      Document,
      Paragraph,
      Text,
      HardBreak,
      Placeholder.configure({
        placeholder: 'Start writing your story...',
      }),
      StoryDecorations,
    ],
    content: textToHtml(selectedStory?.content || ''),
    editable: !isGenerating,
    onSelectionUpdate: ({ editor }) => {
      if (!selectedStory) return;
      
      // Convert doc position to text position
      const { from } = editor.state.selection;
      let textPos = 0;
      let isFirstBlock = true;
      
      editor.state.doc.descendants((node, pos) => {
        if (pos >= from) return false; // Stop when we've passed the cursor
        
        if (node.isBlock && node.isTextblock) {
          if (!isFirstBlock) {
            textPos += 2; // Account for \n\n between paragraphs
          }
          isFirstBlock = false;
        }
        if (node.isText && node.text) {
          const nodeEnd = pos + node.text.length;
          if (from <= nodeEnd) {
            textPos += from - pos;
            return false;
          }
          textPos += node.text.length;
        }
        return true;
      });
      
      const authorInfo = getAuthorAtPosition(textPos, selectedStory.authorshipSpans || []);
      setCursorAuthor(authorInfo);
    },
    onUpdate: ({ editor }) => {
      if (isUpdatingRef.current) return;
      
      const newContentWithBreaks = editor.getText({ blockSeparator: '\n\n' });
      
      if (selectedStory && newContentWithBreaks !== lastSavedContentRef.current) {
        // Calculate what changed for authorship tracking
        const oldContent = lastSavedContentRef.current;
        
        // Find the first position where content differs
        let changeStart = 0;
        while (
          changeStart < oldContent.length &&
          changeStart < newContentWithBreaks.length &&
          oldContent[changeStart] === newContentWithBreaks[changeStart]
        ) {
          changeStart++;
        }
        
        // Find the last position where content differs
        let oldEnd = oldContent.length;
        let newEnd = newContentWithBreaks.length;
        while (
          oldEnd > changeStart &&
          newEnd > changeStart &&
          oldContent[oldEnd - 1] === newContentWithBreaks[newEnd - 1]
        ) {
          oldEnd--;
          newEnd--;
        }
        
        const removedLength = oldEnd - changeStart;
        const addedLength = newEnd - changeStart;
        
        // Update authorship spans
        let updatedSpans = updateSpansOnEdit(
          selectedStory.authorshipSpans,
          changeStart,
          removedLength,
          addedLength
        );
        
        // Mark new content as user-authored
        if (addedLength > 0) {
          updatedSpans.push({
            start: changeStart,
            end: changeStart + addedLength,
            author: 'user',
          });
          updatedSpans = normalizeAuthorshipSpans(updatedSpans);
        }
        
        // Schedule auto-save
        if (autoSaveTimerRef.current) {
          clearTimeout(autoSaveTimerRef.current);
        }
        
        autoSaveTimerRef.current = setTimeout(() => {
          updateStory(selectedStory.id, {
            content: newContentWithBreaks,
            authorshipSpans: updatedSpans,
          });
          lastSavedContentRef.current = newContentWithBreaks;
        }, 5000); // Auto-save every 5 seconds
        
        // Immediate save for span tracking (content will be debounced)
        updateStory(selectedStory.id, {
          content: newContentWithBreaks,
          authorshipSpans: updatedSpans,
        });
        lastSavedContentRef.current = newContentWithBreaks;
      }
    },
  });
  
  // Update editor content when story changes
  useEffect(() => {
    if (editor && selectedStory) {
      const currentContent = editor.getText({ blockSeparator: '\n\n' });
      if (currentContent !== selectedStory.content) {
        isUpdatingRef.current = true;
        editor.commands.setContent(textToHtml(selectedStory.content || ''));
        lastSavedContentRef.current = selectedStory.content;
        isUpdatingRef.current = false;
      }
      
      // Always update authorship spans and force decoration refresh
      setAuthorshipSpans(selectedStory.authorshipSpans || []);
      // Force editor to re-render decorations after content is set
      setTimeout(() => {
        if (editor && !editor.isDestroyed) {
          editor.view.dispatch(editor.state.tr);
        }
      }, 0);
    }
  }, [editor, selectedStory?.id, selectedStory?.content]);
  
  // Also update spans when they change (e.g., during generation)
  useEffect(() => {
    if (selectedStory && editor && !editor.isDestroyed) {
      setAuthorshipSpans(selectedStory.authorshipSpans || []);
      editor.view.dispatch(editor.state.tr);
    }
  }, [editor, selectedStory?.id, JSON.stringify(selectedStory?.authorshipSpans)]);
  
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
    };
  }, []);
  
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
  
  return (
    <div className="flex-1 flex flex-col bg-white overflow-hidden">
      {/* Story Title */}
      <div className="px-6 py-3 border-b border-gray-200 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-800">{selectedStory.name}</h1>
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
      
      {/* Authorship Footer */}
      <div className="px-6 py-2 border-t border-gray-200 bg-gray-50 text-xs text-gray-600">
        {cursorAuthor.author === 'user' && (
          <span className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-gray-400"></span>
            Written by you
          </span>
        )}
        {cursorAuthor.author === 'ai' && (
          <span className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-400"></span>
            Generated by {getModelName(cursorAuthor.modelId)}
          </span>
        )}
        {cursorAuthor.author === null && (
          <span className="text-gray-400">No text selected</span>
        )}
      </div>
    </div>
  );
}
