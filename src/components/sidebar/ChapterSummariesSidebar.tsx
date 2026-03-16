import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore, useDataStore } from '../../stores';
import { Button } from '../ui/common';

function measureWrappedRows(line: string, maxWidth: number, font: string): number {
  if (maxWidth <= 0) return 1;
  if (!line) return 1;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return 1;
  ctx.font = font;

  const parts = line.split(/(\s+)/).filter((part) => part.length > 0);
  let rows = 1;
  let current = '';

  for (const part of parts) {
    const next = current + part;
    if (ctx.measureText(next).width <= maxWidth) {
      current = next;
      continue;
    }

    if (!current.trim()) {
      let chunk = '';
      for (const char of part) {
        const charNext = chunk + char;
        if (ctx.measureText(charNext).width <= maxWidth) {
          chunk = charNext;
        } else {
          rows += 1;
          chunk = char;
        }
      }
      current = chunk;
    } else {
      rows += 1;
      current = part;

      if (ctx.measureText(current).width > maxWidth) {
        let chunk = '';
        for (const char of part) {
          const charNext = chunk + char;
          if (ctx.measureText(charNext).width <= maxWidth) {
            chunk = charNext;
          } else {
            rows += 1;
            chunk = char;
          }
        }
        current = chunk;
      }
    }
  }

  return Math.max(1, rows);
}

export function ChapterSummariesSidebar() {
  const { stories, updateStory } = useDataStore();
  const { selectedStoryId } = useAppStore();

  const selectedStory = useMemo(
    () => stories.find((story) => story.id === selectedStoryId),
    [stories, selectedStoryId]
  );

  const [draft, setDraft] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const lineNumbersRef = useRef<HTMLDivElement | null>(null);
  const [textWrapWidth, setTextWrapWidth] = useState(0);
  const [textareaFont, setTextareaFont] = useState('14px system-ui');

  useEffect(() => {
    setDraft(selectedStory?.chapterSummaries ?? '');
  }, [selectedStory?.id, selectedStory?.chapterSummaries]);

  const hasChanges = (selectedStory?.chapterSummaries ?? '') !== draft;

  const chapterLines = useMemo(() => {
    const lines = draft.split('\n');
    const max = Math.max(1, lines.length);
    const numberedRows: string[] = [];

    for (let idx = 0; idx < max; idx += 1) {
      const line = lines[idx] ?? '';
      const chapterNum = String(idx + 1);
      const wraps = measureWrappedRows(line, textWrapWidth, textareaFont);
      numberedRows.push(chapterNum);
      for (let row = 1; row < wraps; row += 1) {
        numberedRows.push('');
      }
    }

    return numberedRows;
  }, [draft, textWrapWidth, textareaFont]);

  const syncLineNumberScroll = () => {
    if (!textareaRef.current || !lineNumbersRef.current) return;
    lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
  };

  useEffect(() => {
    if (!textareaRef.current) return;

    const updateMetrics = () => {
      if (!textareaRef.current) return;
      const styles = window.getComputedStyle(textareaRef.current);
      const paddingLeft = parseFloat(styles.paddingLeft || '0') || 0;
      const paddingRight = parseFloat(styles.paddingRight || '0') || 0;
      setTextWrapWidth(Math.max(0, textareaRef.current.clientWidth - paddingLeft - paddingRight));
      setTextareaFont(`${styles.fontSize} ${styles.fontFamily}`);
    };

    updateMetrics();

    const observer = new ResizeObserver(() => updateMetrics());
    observer.observe(textareaRef.current);

    return () => observer.disconnect();
  }, []);

  return (
    <div className="w-full h-full bg-gray-50 border-r border-gray-200 flex flex-col">
      <div className="p-3 border-b border-gray-200">
        <h2 className="font-semibold text-gray-800">Chapter Summaries</h2>
      </div>

      {!selectedStory ? (
        <div className="flex-1 flex items-center justify-center px-4">
          <p className="text-sm text-gray-500 text-center">Select a story to edit chapter summaries</p>
        </div>
      ) : (
        <>
          <div className="p-3 text-xs text-gray-600 border-b border-gray-200">
            One summary per line. Use <code className="bg-gray-100 px-1 rounded">{'{summaries}'}</code>, <code className="bg-gray-100 px-1 rounded">{'{cs}'}</code>, and <code className="bg-gray-100 px-1 rounded">{'{cn}'}</code> in prompts.
          </div>

          <div className="flex-1 p-3 overflow-hidden">
            <div className="h-full border border-gray-300 rounded-md bg-white shadow-sm overflow-hidden">
              <div className="h-full grid grid-cols-[56px_1fr]">
                <div
                  ref={lineNumbersRef}
                  className="h-full overflow-hidden border-r border-gray-200 bg-gray-50 text-right text-xs text-gray-500 pt-2 pb-2"
                  aria-hidden="true"
                >
                  {chapterLines.map((chapter) => (
                    <div key={chapter} className="h-6 leading-6 pr-3 select-none">
                      {chapter}
                    </div>
                  ))}
                </div>

                <textarea
                  ref={textareaRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onScroll={syncLineNumberScroll}
                  className="w-full h-full px-3 py-2 text-sm text-gray-800 leading-6 border-0 focus:ring-0 resize-none bg-white"
                  spellCheck={true}
                  placeholder="Chapter 1 summary..."
                />
              </div>
            </div>
          </div>

          <div className="p-3 border-t border-gray-200 flex items-center justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => setDraft(selectedStory.chapterSummaries ?? '')}
              disabled={!hasChanges}
            >
              Reset
            </Button>
            <Button
              onClick={() => updateStory(selectedStory.id, { chapterSummaries: draft })}
              disabled={!hasChanges}
            >
              Save
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
