import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

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

const decorationPluginKey = new PluginKey('storyDecorations');

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
