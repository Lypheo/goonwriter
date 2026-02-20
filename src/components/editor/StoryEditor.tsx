import { useEffect, useRef, useState, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import Placeholder from '@tiptap/extension-placeholder';
import HardBreak from '@tiptap/extension-hard-break';
import { useDataStore, useAppStore, useGenerationStore, useModelStore } from '../../stores';
import { StoryDecorations, AiAuthored } from './extensions';

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
  const { isGenerating } = useGenerationStore();
  const { models } = useModelStore();
  
  const selectedStory = stories.find((s) => s.id === selectedStoryId);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedHtmlRef = useRef<string>('');
  const isUpdatingRef = useRef(false);
  
  // Track cursor position for authorship display
  const [cursorAuthor, setCursorAuthor] = useState<{ author: 'user' | 'ai'; modelId?: string }>({ author: 'user' });
  
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
  
  const editor = useEditor({
    extensions: [
      Document,
      Paragraph,
      Text,
      HardBreak,
      AiAuthored, // Mark for tracking AI-authored text
      Placeholder.configure({
        placeholder: 'Start writing your story...',
      }),
      StoryDecorations,
    ],
    content: getEditorContent(),
    editable: !isGenerating,
    onSelectionUpdate: ({ editor }) => {
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
  );
}
