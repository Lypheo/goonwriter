import { useEffect, useRef, useState } from 'react';

export interface CompletionItem {
  modelId: string;
  modelName: string;
  text: string;
  isLoading: boolean;
  error?: string;
}

interface CompletionPopupProps {
  items: CompletionItem[];
  position: { top: number; left: number };
  selectedIndex: number;
  onSelect: (index: number) => void;
  onCancel: () => void;
  visible: boolean;
}

export function CompletionPopup({
  items,
  position,
  selectedIndex,
  onSelect,
  visible,
}: CompletionPopupProps) {
  const popupRef = useRef<HTMLDivElement>(null);
  const [adjustedPos, setAdjustedPos] = useState(position);

  // Adjust position to stay within viewport
  useEffect(() => {
    if (!visible || !popupRef.current) {
      setAdjustedPos(position);
      return;
    }
    const rect = popupRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let { top, left } = position;

    // Push left if overflowing right
    if (left + rect.width > vw - 16) {
      left = Math.max(16, vw - rect.width - 16);
    }
    // Push up if overflowing bottom
    if (top + rect.height > vh - 16) {
      top = Math.max(16, position.top - rect.height - 24);
    }
    setAdjustedPos({ top, left });
  }, [position, visible, items]);

  // Scroll selected item into view
  useEffect(() => {
    if (!popupRef.current) return;
    const el = popupRef.current.querySelector(`[data-index="${selectedIndex}"]`);
    if (el) {
      el.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  if (!visible || items.length === 0) return null;

  return (
    <div
      ref={popupRef}
      className="completion-popup"
      style={{
        position: 'fixed',
        top: adjustedPos.top,
        left: adjustedPos.left,
        zIndex: 1000,
      }}
    >
      <div className="completion-popup-list">
        {items.map((item, i) => (
          <div
            key={item.modelId}
            data-index={i}
            className={`completion-popup-item ${i === selectedIndex ? 'selected' : ''}`}
            onMouseDown={(e) => {
              e.preventDefault(); // Don't blur editor
              onSelect(i);
            }}
            onMouseEnter={() => {
              // Handled by parent through events
            }}
          >
            <div className="completion-popup-item-header">
              <span
                className="completion-popup-model-badge"
                style={{
                  backgroundColor: getModelColor(i),
                }}
              >
                {item.modelName.slice(0, 12)}
              </span>
              {item.isLoading && (
                <span className="completion-popup-spinner" />
              )}
            </div>
            <div className="completion-popup-item-text">
              {item.error ? (
                <span className="text-red-500 text-xs">{item.error}</span>
              ) : item.text ? (
                item.text
              ) : (
                <span className="text-gray-400 italic">Generating...</span>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="completion-popup-footer">
        <span>tab/⇧tab navigate</span>
        <span>↵ accept</span>
        <span>move cursor to dismiss</span>
      </div>
    </div>
  );
}

// Assign distinct colors for different models
const MODEL_COLORS = [
  '#3b82f6', // blue
  '#10b981', // emerald
  '#f59e0b', // amber
  '#8b5cf6', // violet
  '#ef4444', // red
  '#06b6d4', // cyan
  '#ec4899', // pink
  '#84cc16', // lime
];

function getModelColor(index: number): string {
  return MODEL_COLORS[index % MODEL_COLORS.length];
}
