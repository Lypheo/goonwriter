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
  onCancel?: () => void;
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

  useEffect(() => {
    if (!visible || !popupRef.current) {
      setAdjustedPos(position);
      return;
    }

    const rect = popupRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let { top, left } = position;

    if (left + rect.width > vw - 16) {
      left = Math.max(16, vw - rect.width - 16);
    }
    if (top + rect.height > vh - 16) {
      top = Math.max(16, position.top - rect.height - 24);
    }
    setAdjustedPos({ top, left });
  }, [position, visible, items]);

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
              e.preventDefault();
              onSelect(i);
            }}
            onMouseEnter={() => {
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
        <span>↑/↓ navigate</span>
        <span>Enter/Tab accept</span>
        <span>Esc or click away close</span>
      </div>
    </div>
  );
}

const MODEL_COLORS = [
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#8b5cf6',
  '#ef4444',
  '#06b6d4',
  '#ec4899',
  '#84cc16',
];

function getModelColor(index: number): string {
  return MODEL_COLORS[index % MODEL_COLORS.length];
}
