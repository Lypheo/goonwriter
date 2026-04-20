import { Input } from './common';

interface StringListEditorProps {
  label: string;
  values: string[];
  draft: string;
  onDraftChange: (value: string) => void;
  onAdd: () => void;
  onRemove: (value: string) => void;
  onCopy?: () => void;
  emptyText: string;
  placeholder: string;
  chipClassName: string;
  chipRemoveClassName: string;
}

export function StringListEditor({
  label,
  values,
  draft,
  onDraftChange,
  onAdd,
  onRemove,
  onCopy,
  emptyText,
  placeholder,
  chipClassName,
  chipRemoveClassName,
}: StringListEditorProps) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="block text-sm font-medium text-gray-700">{label}</label>
        {onCopy && (
          <button
            type="button"
            onClick={onCopy}
            className="text-xs text-gray-500 hover:text-gray-700 disabled:opacity-40"
            title="Copy list"
            disabled={values.length === 0}
          >
            Copy
          </button>
        )}
      </div>
      <div className="min-h-[2.5rem] w-full px-2 py-2 border border-gray-300 rounded-md bg-white flex flex-wrap gap-1">
        {values.length === 0 && <span className="text-sm text-gray-400">{emptyText}</span>}
        {values.map((value) => (
          <span key={value} className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded ${chipClassName}`}>
            {value}
            <button
              type="button"
              onClick={() => onRemove(value)}
              className={chipRemoveClassName}
              title={`Remove ${value}`}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <Input
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onAdd();
            }
          }}
          placeholder={placeholder}
        />
        <button
          type="button"
          onClick={onAdd}
          className="px-3 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
        >
          Add
        </button>
      </div>
    </div>
  );
}
