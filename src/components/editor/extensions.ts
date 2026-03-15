import { Extension, Mark } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { SPECIAL_TOKENS } from '../../types';

// Mark for AI-authored text - this is the robust way to track authorship
// Marks persist through all text operations (cut, paste, undo, etc.)
export const AiAuthored = Mark.create({
  name: 'aiAuthored',
  
  // Don't extend the mark when typing at its boundaries
  inclusive: false,
  
  // Allow the mark to be removed without affecting other marks
  excludes: '',
  
  addAttributes() {
    return {
      modelId: {
        default: null,
        parseHTML: element => element.getAttribute('data-model-id'),
        renderHTML: attributes => {
          if (!attributes.modelId) return {};
          return { 'data-model-id': attributes.modelId };
        },
      },
    };
  },
  
  parseHTML() {
    return [
      {
        tag: 'span[data-ai-authored]',
      },
    ];
  },
  
  renderHTML({ HTMLAttributes }) {
    return ['span', { ...HTMLAttributes, 'data-ai-authored': 'true', class: 'ai-authored' }, 0];
  },
  
  // Add a plugin to remove AI marks from user-typed content
  addProseMirrorPlugins() {
    const markType = this.type;
    
    return [
      new Plugin({
        key: new PluginKey('aiAuthoredInput'),
        
        // Handle text input - remove AI mark from typed characters
        props: {
          handleTextInput(view, from, to, text) {
            const { state } = view;
            const $from = state.doc.resolve(from);
            
            // Check if we're typing inside AI-authored text
            const hasAiMark = $from.marks().some(m => m.type.name === 'aiAuthored');
            
            if (hasAiMark) {
              // Insert text without the AI mark
              const tr = state.tr;
              tr.insertText(text, from, to);
              
              // Remove the AI mark from the inserted text
              const insertEnd = from + text.length;
              tr.removeMark(from, insertEnd, markType);
              
              view.dispatch(tr);
              return true; // Handled
            }
            
            return false; // Let default handling occur
          },
          
          // Handle paste - remove AI mark from pasted content when inside AI text
          handlePaste(view, event, slice) {
            const { state } = view;
            const { from, to } = state.selection;
            const $from = state.doc.resolve(from);
            
            // Check if we're pasting inside AI-authored text
            const hasAiMark = $from.marks().some(m => m.type.name === 'aiAuthored');
            
            if (hasAiMark) {
              // Let default paste happen, then remove the mark
              const tr = state.tr;
              tr.replaceSelection(slice);
              
              // Calculate where the pasted content ends
              const insertEnd = from + slice.content.size;
              tr.removeMark(from, insertEnd, markType);
              
              view.dispatch(tr);
              return true;
            }
            
            return false;
          },
        },
      }),
    ];
  },
});

// Find all special tokens in text with document positions
function findSpecialTokensWithPositions(
  doc: import('@tiptap/pm/model').Node
): { from: number; to: number; token: string; type: string; isEndToken: boolean }[] {
  const tokens: { from: number; to: number; token: string; type: string; isEndToken: boolean }[] = [];
  
  const allTokens = [
    { token: SPECIAL_TOKENS.START_SYS_PROMPT, type: 'sys-start', isEndToken: false },
    { token: SPECIAL_TOKENS.END_SYS_PROMPT, type: 'sys-end', isEndToken: true },
    { token: SPECIAL_TOKENS.START_USER, type: 'user-start', isEndToken: false },
    { token: SPECIAL_TOKENS.END_USER, type: 'user-end', isEndToken: true },
    { token: SPECIAL_TOKENS.START_AI, type: 'ai-start', isEndToken: false },
    { token: SPECIAL_TOKENS.END_AI, type: 'ai-end', isEndToken: true },
    { token: SPECIAL_TOKENS.START_THINK, type: 'think-start', isEndToken: false },
    { token: SPECIAL_TOKENS.END_THINK, type: 'think-end', isEndToken: false },
  ];
  
  // Get full text and build chunk map for O(log N) position lookups
  let fullText = '';
  let textPos = 0;
  const chunks: { textPos: number; docPos: number; length: number }[] = [];
  
  doc.descendants((node, pos) => {
    if (node.isText && node.text) {
      chunks.push({ textPos, docPos: pos, length: node.text.length });
      fullText += node.text;
      textPos += node.text.length;
    }
    return true;
  });
  
  const getDocPos = (targetTextPos: number): number => {
    let left = 0;
    let right = chunks.length - 1;
    while (left <= right) {
      const mid = (left + right) >> 1;
      const chunk = chunks[mid];
      if (targetTextPos >= chunk.textPos && targetTextPos < chunk.textPos + chunk.length) {
        return chunk.docPos + (targetTextPos - chunk.textPos);
      }
      if (targetTextPos < chunk.textPos) {
        right = mid - 1;
      } else {
        left = mid + 1;
      }
    }
    return -1;
  };
  
  // Find tokens in text and map to doc positions
  for (const { token, type, isEndToken } of allTokens) {
    let searchPos = 0;
    while ((searchPos = fullText.indexOf(token, searchPos)) !== -1) {
      const startDocPos = getDocPos(searchPos);
      const endDocPos = getDocPos(searchPos + token.length - 1);
      
      if (startDocPos !== -1 && endDocPos !== -1) {
        tokens.push({
          from: startDocPos,
          to: endDocPos + 1,
          token,
          type,
          isEndToken,
        });
      }
      searchPos += token.length;
    }
  }
  
  return tokens.sort((a, b) => a.from - b.from);
}

// Find markdown-style formatting with document positions
function findMarkdownFormattingWithPositions(
  doc: import('@tiptap/pm/model').Node
): { from: number; to: number; type: string }[] {
  const decorations: { from: number; to: number; type: string }[] = [];
  
  // Process each text node
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return true;
    
    const text = node.text;
    const basePos = pos;
    
    // Find headers (lines starting with #) - only works for text at start of paragraph
    const headerMatch = text.match(/^(#{1,6})\s/);
    if (headerMatch) {
      decorations.push({
        from: basePos,
        to: basePos + headerMatch[1].length,
        type: `header-marker-${headerMatch[1].length}`,
      });
      decorations.push({
        from: basePos,
        to: basePos + text.length,
        type: `header-${headerMatch[1].length}`,
      });
    }
    
    // Find bold (**text**)
    const boldRegex = /(\*\*)(.+?)\1/g;
    let match;
    while ((match = boldRegex.exec(text)) !== null) {
      decorations.push({
        from: basePos + match.index,
        to: basePos + match.index + 2,
        type: 'bold-marker',
      });
      decorations.push({
        from: basePos + match.index + 2,
        to: basePos + match.index + match[0].length - 2,
        type: 'bold',
      });
      decorations.push({
        from: basePos + match.index + match[0].length - 2,
        to: basePos + match.index + match[0].length,
        type: 'bold-marker',
      });
    }
    
    // Find italic (*text*) - excluding **
    const italicRegex = /(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g;
    while ((match = italicRegex.exec(text)) !== null) {
      decorations.push({
        from: basePos + match.index,
        to: basePos + match.index + 1,
        type: 'italic-marker',
      });
      decorations.push({
        from: basePos + match.index + 1,
        to: basePos + match.index + match[0].length - 1,
        type: 'italic',
      });
      decorations.push({
        from: basePos + match.index + match[0].length - 1,
        to: basePos + match.index + match[0].length,
        type: 'italic-marker',
      });
    }
    
    return true;
  });
  
  return decorations;
}

// Plugin key
const decorationPluginKey = new PluginKey('storyDecorations');

// Create a section divider widget element
function createSectionDivider(): HTMLElement {
  const divider = document.createElement('div');
  divider.className = 'section-divider';
  divider.contentEditable = 'false';
  return divider;
}

// Extension for custom decorations
export const StoryDecorations = Extension.create({
  name: 'storyDecorations',
  
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: decorationPluginKey,
        props: {
          decorations(state) {
            const { doc } = state;
            const decorations: Decoration[] = [];
            
            // Find special tokens with correct positions
            const tokens = findSpecialTokensWithPositions(doc);
            
            // Find think content ranges (text between think-start and think-end)
            const thinkRanges: { from: number; to: number }[] = [];
            const thinkStarts = tokens.filter(t => t.type === 'think-start');
            const thinkEnds = tokens.filter(t => t.type === 'think-end');
            
            for (const start of thinkStarts) {
              // Find the closest think-end after this think-start
              const matchingEnd = thinkEnds.find(end => end.from > start.to);
              if (matchingEnd) {
                // Content between end of start tag and start of end tag
                if (start.to < matchingEnd.from) {
                  thinkRanges.push({ from: start.to, to: matchingEnd.from });
                }
              }
            }
            
            // Apply think content styling
            for (const range of thinkRanges) {
              decorations.push(
                Decoration.inline(range.from, range.to, {
                  class: 'think-content',
                })
              );
            }
            
            for (const token of tokens) {
              // Add inline decoration for token styling
              decorations.push(
                Decoration.inline(token.from, token.to, {
                  class: `special-token special-token-${token.type}`,
                })
              );
              
              // Add widget decoration after end tokens for visual separation
              if (token.isEndToken) {
                decorations.push(
                  Decoration.widget(token.to, createSectionDivider, {
                    side: 1, // Place after the token
                    key: `divider-${token.from}`,
                  })
                );
              }
            }
            
            // Find markdown formatting with correct positions
            const formatting = findMarkdownFormattingWithPositions(doc);
            for (const fmt of formatting) {
              decorations.push(
                Decoration.inline(fmt.from, fmt.to, {
                  class: `md-${fmt.type}`,
                })
              );
            }
            
            return DecorationSet.create(doc, decorations);
          },
        },
      }),
    ];
  },
});
