import { Extension, Mark } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { SPECIAL_TOKENS, type SectionType } from '../../types';

// Mark for AI-authored text
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

// Determine section type based on content
function getSectionType(text: string, position: number): SectionType {
  // Find the last opening token before position
  const beforeText = text.slice(0, position);
  
  const sysStart = beforeText.lastIndexOf(SPECIAL_TOKENS.START_SYS_PROMPT);
  const sysEnd = beforeText.lastIndexOf(SPECIAL_TOKENS.END_SYS_PROMPT);
  const userStart = beforeText.lastIndexOf(SPECIAL_TOKENS.START_USER);
  const userEnd = beforeText.lastIndexOf(SPECIAL_TOKENS.END_USER);
  const aiStart = beforeText.lastIndexOf(SPECIAL_TOKENS.START_AI);
  const aiEnd = beforeText.lastIndexOf(SPECIAL_TOKENS.END_AI);
  
  // Check if we're inside any section
  if (sysStart > sysEnd && sysStart !== -1) return 'system';
  if (userStart > userEnd && userStart !== -1) return 'user';
  if (aiStart > aiEnd && aiStart !== -1) return 'ai';
  
  return 'default';
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
            
            // Find section backgrounds
            // Build text with positions
            let fullText = '';
            const textToDocPos: number[] = [];
            
            doc.descendants((node, pos) => {
              if (node.isText && node.text) {
                for (let i = 0; i < node.text.length; i++) {
                  textToDocPos.push(pos + i);
                  fullText += node.text[i];
                }
              }
              return true;
            });
            
            // Track sections
            let currentSection: SectionType = 'default';
            let sectionStartDocPos = 1; // Start of document content
            
            for (let i = 0; i <= fullText.length; i++) {
              const newSection = getSectionType(fullText, i);
              if (newSection !== currentSection || i === fullText.length) {
                const startDocPos = i === 0 ? 1 : (textToDocPos[sectionStartDocPos] ?? 1);
                const endDocPos = i === fullText.length 
                  ? (textToDocPos[i - 1] !== undefined ? textToDocPos[i - 1] + 1 : 1)
                  : (textToDocPos[i] ?? 1);
                
                if (sectionStartDocPos < i && currentSection !== 'default' && startDocPos < endDocPos) {
                  decorations.push(
                    Decoration.inline(
                      textToDocPos[sectionStartDocPos] ?? 1,
                      textToDocPos[i - 1] !== undefined ? textToDocPos[i - 1] + 1 : endDocPos,
                      { class: `section-${currentSection}` }
                    )
                  );
                }
                currentSection = newSection;
                sectionStartDocPos = i;
              }
            }
            
            return DecorationSet.create(doc, decorations);
          },
        },
      }),
    ];
  },
});
