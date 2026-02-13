import { Extension, Mark } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { SPECIAL_TOKENS, type AuthorshipSpan } from '../../types';

// Mark for AI-authored text (kept for potential future use)
export const AiAuthored = Mark.create({
  name: 'aiAuthored',
  
  addAttributes() {
    return {
      modelId: {
        default: null,
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
});

// Storage for authorship spans - will be updated from React
let currentAuthorshipSpans: AuthorshipSpan[] = [];

export function setAuthorshipSpans(spans: AuthorshipSpan[]) {
  currentAuthorshipSpans = spans;
}

export function getAuthorshipSpans(): AuthorshipSpan[] {
  return currentAuthorshipSpans;
}

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
  ];
  
  // Build a map of text positions to document positions
  let textPos = 0;
  const posMap: { textPos: number; docPos: number }[] = [];
  
  doc.descendants((node, pos) => {
    if (node.isText && node.text) {
      for (let i = 0; i < node.text.length; i++) {
        posMap.push({ textPos: textPos + i, docPos: pos + i });
      }
      textPos += node.text.length;
    } else if (node.isBlock && pos > 0) {
      // Account for newlines between blocks
      posMap.push({ textPos, docPos: pos });
    }
    return true;
  });
  
  // Get full text
  let fullText = '';
  doc.descendants((node) => {
    if (node.isText) {
      fullText += node.text;
    }
    return true;
  });
  
  // Find tokens in text and map to doc positions
  for (const { token, type, isEndToken } of allTokens) {
    let searchPos = 0;
    while ((searchPos = fullText.indexOf(token, searchPos)) !== -1) {
      const startEntry = posMap.find(p => p.textPos === searchPos);
      const endEntry = posMap.find(p => p.textPos === searchPos + token.length - 1);
      
      if (startEntry && endEntry) {
        tokens.push({
          from: startEntry.docPos,
          to: endEntry.docPos + 1,
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
            
            // Build text with positions for mapping
            // This needs to match how content is stored (with \n\n between paragraphs)
            let fullText = '';
            const textToDocPos: number[] = [];
            let isFirstBlock = true;
            
            doc.descendants((node, pos) => {
              if (node.isBlock && node.isTextblock) {
                // Add paragraph separator for non-first blocks (matching \n\n in stored content)
                if (!isFirstBlock) {
                  // These positions don't map to doc positions, use -1 as placeholder
                  textToDocPos.push(-1); // \n
                  textToDocPos.push(-1); // \n
                  fullText += '\n\n';
                }
                isFirstBlock = false;
              }
              if (node.isText && node.text) {
                for (let i = 0; i < node.text.length; i++) {
                  textToDocPos.push(pos + i);
                  fullText += node.text[i];
                }
              }
              return true;
            });
            
            // Apply authorship span decorations (AI-authored text)
            const authorshipSpans = getAuthorshipSpans();
            console.log('Authorship spans:', authorshipSpans, 'Full text length:', fullText.length);
            for (const span of authorshipSpans) {
              if (span.author === 'ai' && span.start < span.end) {
                // Find valid doc positions within the span range
                let fromDocPos: number | undefined;
                let toDocPos: number | undefined;
                
                // Find first valid position >= span.start
                for (let i = span.start; i < Math.min(span.end, textToDocPos.length); i++) {
                  if (textToDocPos[i] !== -1) {
                    fromDocPos = textToDocPos[i];
                    break;
                  }
                }
                
                // Find last valid position < span.end
                for (let i = Math.min(span.end - 1, textToDocPos.length - 1); i >= span.start; i--) {
                  if (textToDocPos[i] !== -1) {
                    toDocPos = textToDocPos[i];
                    break;
                  }
                }
                
                if (fromDocPos !== undefined && toDocPos !== undefined && fromDocPos <= toDocPos) {
                  decorations.push(
                    Decoration.inline(fromDocPos, toDocPos + 1, {
                      class: 'ai-authored',
                    })
                  );
                }
              }
            }
            
            // Find special tokens with correct positions
            const tokens = findSpecialTokensWithPositions(doc);
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
