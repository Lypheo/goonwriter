import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { getVariableMode } from '../../services/promptEngineering';

export type EmbeddedPlanEditorConfigMap = Map<string, {
  variableKey: string;
  value: string;
  collapsed: boolean;
  onToggle: () => void;
  onChange: (nextValue: string) => void;
}>;

interface StoryDecorationsOptions {
  collapseThinkBlocks?: boolean;
  embeddedPlanEditors?: EmbeddedPlanEditorConfigMap | (() => EmbeddedPlanEditorConfigMap);
  highlightWritingPlanBlock?: boolean;
}

function findWritingPlanBlockRange(
  doc: import('@tiptap/pm/model').Node
): { from: number; to: number } | null {
  const summaryOpenRegex = /\[SUMMARY\]/g;
  const chaptersCloseRegex = /\[\/CHAPTERS\]/g;

  let summaryOpenPos: number | null = null;
  let chaptersCloseEndPos: number | null = null;

  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return true;

    const text = node.text;

    if (summaryOpenPos == null) {
      const openMatch = summaryOpenRegex.exec(text);
      if (openMatch) {
        summaryOpenPos = pos + openMatch.index;
      }
      summaryOpenRegex.lastIndex = 0;
    }

    if (summaryOpenPos != null && chaptersCloseEndPos == null) {
      const closeMatch = chaptersCloseRegex.exec(text);
      if (closeMatch) {
        chaptersCloseEndPos = pos + closeMatch.index + closeMatch[0].length;
      }
      chaptersCloseRegex.lastIndex = 0;
    }

    return chaptersCloseEndPos == null;
  });

  if (summaryOpenPos == null || chaptersCloseEndPos == null || chaptersCloseEndPos <= summaryOpenPos) {
    return null;
  }

  return { from: summaryOpenPos, to: chaptersCloseEndPos };
}

function findMarkdownFormattingWithPositions(
  doc: import('@tiptap/pm/model').Node
): { from: number; to: number; type: string }[] {
  const decorations: { from: number; to: number; type: string }[] = [];

  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return true;

    const text = node.text;
    const basePos = pos;

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

function findPromptTokensWithPositions(
  doc: import('@tiptap/pm/model').Node
): { from: number; to: number; type: string }[] {
  const decorations: { from: number; to: number; type: string }[] = [];

  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return true;

    const text = node.text;
    const basePos = pos;

    const placeholderRegex = /\{\{\s*([a-zA-Z0-9_\-.]+)\s*\}\}/g;
    let match: RegExpExecArray | null;
    while ((match = placeholderRegex.exec(text)) !== null) {
      decorations.push({ from: basePos + match.index, to: basePos + match.index + match[0].length, type: 'placeholder-token' });
    }

    const variableRegex = /\[\[\s*([a-zA-Z0-9_\-.]+)\s*\]\]/g;
    while ((match = variableRegex.exec(text)) !== null) {
      const variableKey = match[1];
      const mode = getVariableMode(variableKey);
      const type = mode === 'expanded-immutable'
        ? 'variable-token-immutable'
        : mode === 'unexpanded'
          ? 'variable-token-unexpanded'
          : 'variable-token-mutable';
      decorations.push({ from: basePos + match.index, to: basePos + match.index + match[0].length, type });
    }

    return true;
  });

  return decorations;
}

const decorationPluginKey = new PluginKey('storyDecorations');

export const StoryDecorations = Extension.create({
  name: 'storyDecorations',

  addOptions() {
    return {
      collapseThinkBlocks: false,
      embeddedPlanEditors: new Map(),
      highlightWritingPlanBlock: false,
    } satisfies StoryDecorationsOptions;
  },

  addProseMirrorPlugins() {
    const getEmbeddedEditors = () => {
      const editorOption = this.options.embeddedPlanEditors as StoryDecorationsOptions['embeddedPlanEditors'];
      return typeof editorOption === 'function' ? editorOption() : (editorOption || new Map());
    };
    const shouldHighlightWritingPlanBlock = () => Boolean(this.options.highlightWritingPlanBlock);

    return [
      new Plugin({
        key: decorationPluginKey,
        props: {
          decorations(state) {
            const { doc } = state;
            const decorations: Decoration[] = [];

            if (shouldHighlightWritingPlanBlock()) {
              const range = findWritingPlanBlockRange(doc);
              if (range) {
                decorations.push(
                  Decoration.inline(range.from, range.to, {
                    class: 'md-writing-plan-canonical',
                  })
                );
              }
            }

            const formatting = findMarkdownFormattingWithPositions(doc);
            for (const fmt of formatting) {
              decorations.push(
                Decoration.inline(fmt.from, fmt.to, {
                  class: `md-${fmt.type}`,
                })
              );
            }

            const promptTokens = findPromptTokensWithPositions(doc);
            for (const token of promptTokens) {
              decorations.push(
                Decoration.inline(token.from, token.to, {
                  class: `md-${token.type}`,
                })
              );
            }

            const variableRegex = /\[\[\s*([a-zA-Z0-9_\-.]+)\s*\]\]/g;
            const editorsMap = getEmbeddedEditors();

            if (editorsMap.size > 0) {
              doc.descendants((node, pos) => {
                if (!node.isText || !node.text) return true;

                const text = node.text;
                let match: RegExpExecArray | null;
                while ((match = variableRegex.exec(text)) !== null) {
                  const variableKey = match[1];
                  const config = editorsMap.get(variableKey);
                  if (!config) continue;

                  const widgetPos = pos + match.index + match[0].length;
                  const widgetKey = `embedded-plan-widget:${variableKey}:${widgetPos}:${config.collapsed ? '1' : '0'}`;
                  decorations.push(
                    Decoration.widget(widgetPos, () => {
                      const container = document.createElement('div');
                      container.className = 'embedded-plan-widget';
                      container.contentEditable = 'false';

                      const header = document.createElement('button');
                      header.type = 'button';
                      header.className = 'embedded-plan-widget-header';
                      header.setAttribute('aria-label', `Toggle ${variableKey}`);
                      header.textContent = config.collapsed ? '▶' : '▼';
                      header.addEventListener('mousedown', (event) => {
                        event.preventDefault();
                        event.stopPropagation();
                      });
                      header.addEventListener('click', (event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        config.onToggle();
                      });
                      container.appendChild(header);

                      if (!config.collapsed) {
                        const textarea = document.createElement('textarea');
                        textarea.className = 'embedded-plan-widget-textarea';
                        textarea.value = config.value;
                        textarea.spellcheck = false;
                        textarea.addEventListener('mousedown', (event) => {
                          event.stopPropagation();
                        });
                        textarea.addEventListener('keydown', (event) => {
                          event.stopPropagation();
                        });
                        textarea.addEventListener('keyup', (event) => {
                          event.stopPropagation();
                        });
                        textarea.addEventListener('click', (event) => {
                          event.stopPropagation();
                        });
                        textarea.addEventListener('input', (event) => {
                          event.stopPropagation();
                          const target = event.target as HTMLTextAreaElement;
                          config.onChange(target.value);
                        });

                        container.appendChild(textarea);
                      }

                      return container;
                    }, {
                      side: 1,
                      key: widgetKey,
                      ignoreSelection: true,
                      stopEvent: (event) => {
                        const target = event.target as HTMLElement | null;
                        return !!target?.closest('.embedded-plan-widget');
                      },
                    })
                  );
                }

                return true;
              });
            }

            return DecorationSet.create(doc, decorations);
          },
        },
      }),
    ];
  },
});
