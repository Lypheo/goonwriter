import { useState, useEffect, useRef } from 'react';
import { useCompletionModelStore } from '../../stores';
import type { CompletionModelConfig } from '../../types';
import { Input, Textarea, Select, Modal, Slider } from '../ui/common';
import { StringListEditor } from '../ui/StringListEditor';
import { appendUniqueListValues, copyListValues } from './providerListUtils';

interface CompletionModelConfigDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

// Icons
const PlusIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
  </svg>
);

const DuplicateIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
  </svg>
);

const TrashIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
);

const EditIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
  </svg>
);

function formatCost(cost: number): string {
  if (cost === 0) return '$0';
  if (cost < 0.1) return `${(cost * 100).toFixed(3)}¢`;
  return `$${cost.toFixed(3)}`;
}

export function CompletionModelConfigDialog({ isOpen, onClose }: CompletionModelConfigDialogProps) {
  const { models, createModel, updateModel, deleteModel, duplicateModel } = useCompletionModelStore();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const lastLoadedIdRef = useRef<string | null>(null);
  const [bannedProvidersDraft, setBannedProvidersDraft] = useState('');
  const [allowedQuantizationsDraft, setAllowedQuantizationsDraft] = useState('');

  const [formData, setFormData] = useState<Omit<CompletionModelConfig, 'id' | 'createdAt' | 'updatedAt' | 'totalCost' | 'totalTokens'>>({
    name: '',
    baseUrl: '',
    token: '',
    modelId: '',
    bannedProviders: [],
    allowedQuantizations: [],
    sortOrder: null,
    enabled: false,
    isUtilityModel: false,
    mode: 'instruction',
    systemMessage: '',
    prompt: '',
    contextLength: 1000,
  });

  const addListValue = (
    field: 'bannedProviders' | 'allowedQuantizations',
    draft: string,
    setDraft: (value: string) => void
  ) => {
    const current = formData[field];
    const nextValues = appendUniqueListValues(current, draft);
    if (nextValues === current) {
      setDraft('');
      return;
    }

    setFormData((prev) => ({ ...prev, [field]: nextValues }));
    setDraft('');
  };

  const removeListValue = (
    field: 'bannedProviders' | 'allowedQuantizations',
    value: string
  ) => {
    setFormData((prev) => ({
      ...prev,
      [field]: prev[field].filter((item) => item !== value),
    }));
  };

  const selectedModel = models.find((m) => m.id === selectedId);

  // Select first model when dialog opens
  useEffect(() => {
    if (isOpen && models.length > 0 && !selectedId) {
      setSelectedId(models[0].id);
    }
  }, [isOpen, models, selectedId]);

  // Load form data only when selected model id changes
  useEffect(() => {
    if (!selectedId) {
      lastLoadedIdRef.current = null;
      setFormData({
        name: '',
        baseUrl: '',
        token: '',
        modelId: '',
        bannedProviders: [],
        allowedQuantizations: [],
        sortOrder: null,
        enabled: false,
        isUtilityModel: false,
        mode: 'instruction',
        systemMessage: '',
        prompt: '',
        contextLength: 1000,
      });
      setBannedProvidersDraft('');
      setAllowedQuantizationsDraft('');
      return;
    }

    if (lastLoadedIdRef.current === selectedId) return;

    const model = models.find((m) => m.id === selectedId);
    if (!model) return;

    lastLoadedIdRef.current = selectedId;
    setFormData({
      name: model.name,
      baseUrl: model.baseUrl,
      token: model.token,
      modelId: model.modelId,
      bannedProviders: model.bannedProviders,
      allowedQuantizations: model.allowedQuantizations,
      sortOrder: model.sortOrder,
      enabled: model.enabled,
      isUtilityModel: model.isUtilityModel,
      mode: model.mode,
      systemMessage: model.systemMessage,
      prompt: model.prompt,
      contextLength: model.contextLength,
    });
    setBannedProvidersDraft('');
    setAllowedQuantizationsDraft('');
  }, [selectedId, models]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!isOpen) {
      setSelectedId(null);
      setRenamingId(null);
    }
  }, [isOpen]);

  const handleCreate = () => {
    const newModel = createModel();
    setSelectedId(newModel.id);
    setRenamingId(newModel.id);
    setRenameValue('New Completion Model');
  };

  const handleDuplicate = (id: string) => {
    const duplicated = duplicateModel(id);
    if (duplicated) setSelectedId(duplicated.id);
  };

  const handleDelete = (id: string) => {
    if (confirm('Delete this completion model?')) {
      deleteModel(id);
      const remaining = models.filter((m) => m.id !== id);
      setSelectedId(remaining.length > 0 ? remaining[0].id : null);
    }
  };

  const handleStartRename = (id: string, currentName: string) => {
    setRenamingId(id);
    setRenameValue(currentName);
  };

  const handleFinishRename = () => {
    if (renamingId && renameValue.trim()) {
      updateModel(renamingId, { name: renameValue.trim() });
    }
    setRenamingId(null);
    setRenameValue('');
  };

  // Auto-save form changes
  useEffect(() => {
    if (selectedId && formData.name.trim()) {
      const timeout = setTimeout(() => {
        updateModel(selectedId, formData);
      }, 500);
      return () => clearTimeout(timeout);
    }
  }, [formData, selectedId, updateModel]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Sentence Completion Models" size="xl">
      <div className="flex h-[60vh] -m-4">
        {/* Left panel - Model list */}
        <div className="w-56 flex-shrink-0 border-r border-gray-200 flex flex-col bg-gray-50">
          <div className="p-2 border-b border-gray-200 flex items-center gap-1">
            <button
              onClick={handleCreate}
              className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-sm text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50"
              title="Create new completion model"
            >
              <PlusIcon />
              <span>New</span>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {models.length === 0 ? (
              <div className="p-4 text-sm text-gray-500 text-center">
                No completion models.
                <br />
                Click "New" to add one.
              </div>
            ) : (
              <ul className="py-1">
                {models.map((model) => (
                  <li key={model.id}>
                    <div
                      className={`group flex items-center px-2 py-1.5 cursor-pointer ${
                        selectedId === model.id
                          ? 'bg-blue-100 text-blue-900'
                          : 'hover:bg-gray-100 text-gray-700'
                      }`}
                      onClick={() => setSelectedId(model.id)}
                    >
                      {renamingId === model.id ? (
                        <input
                          type="text"
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onBlur={handleFinishRename}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleFinishRename();
                            if (e.key === 'Escape') {
                              setRenamingId(null);
                              setRenameValue('');
                            }
                          }}
                          className="flex-1 px-1 py-0.5 text-sm border border-blue-400 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                          autoFocus
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <>
                          <span className="flex items-center gap-1 flex-1 min-w-0">
                            {model.enabled && (
                              <span className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" title="Enabled" />
                            )}
                            <span className="text-sm truncate" title={model.name}>
                              {model.name}
                            </span>
                          </span>
                          <div
                            className={`flex items-center gap-0.5 flex-shrink-0 ${
                              selectedId === model.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                            }`}
                          >
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleStartRename(model.id, model.name);
                              }}
                              className="p-1 text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded"
                              title="Rename"
                            >
                              <EditIcon />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDuplicate(model.id);
                              }}
                              className="p-1 text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded"
                              title="Duplicate"
                            >
                              <DuplicateIcon />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(model.id);
                              }}
                              className="p-1 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded"
                              title="Delete"
                            >
                              <TrashIcon />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Right panel - Edit form */}
        <div className="flex-1 overflow-y-auto p-4">
          {selectedModel ? (
            <div className="space-y-4">
              {/* Enable toggle */}
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.enabled}
                  onChange={(e) => setFormData((prev) => ({ ...prev, enabled: e.target.checked }))}
                  className="rounded border-gray-300"
                />
                <span>Enable for sentence completion</span>
              </label>

              {/* Utility model toggle */}
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.isUtilityModel}
                  onChange={(e) => setFormData((prev) => ({ ...prev, isUtilityModel: e.target.checked }))}
                  className="rounded border-gray-300"
                />
                <span>Enable as utility model</span>
                <span className="text-xs text-gray-400 font-normal">(only one at a time)</span>
              </label>

              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Display Name *"
                  value={formData.name}
                  onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="My Completion Model"
                />
                <Input
                  label="Model ID *"
                  value={formData.modelId}
                  onChange={(e) => setFormData((prev) => ({ ...prev, modelId: e.target.value }))}
                  placeholder="openai/gpt-4o-mini"
                />
              </div>

              <Input
                label="API Base URL *"
                value={formData.baseUrl}
                onChange={(e) => setFormData((prev) => ({ ...prev, baseUrl: e.target.value }))}
                placeholder="https://openrouter.ai/api/v1"
              />

              <Input
                label="API Token"
                type="password"
                value={formData.token}
                onChange={(e) => setFormData((prev) => ({ ...prev, token: e.target.value }))}
                placeholder="sk-..."
              />

              {/* Provider filtering */}
              <div className="border-t pt-4">
                <h4 className="text-sm font-medium text-gray-700 mb-3">Provider Settings</h4>

                <div className="grid grid-cols-2 gap-4">
                  <StringListEditor
                    label="Banned Providers"
                    values={formData.bannedProviders}
                    draft={bannedProvidersDraft}
                    onDraftChange={setBannedProvidersDraft}
                    onAdd={() => addListValue('bannedProviders', bannedProvidersDraft, setBannedProvidersDraft)}
                    onRemove={(value) => removeListValue('bannedProviders', value)}
                    onCopy={() => copyListValues(formData.bannedProviders)}
                    emptyText="No providers added"
                    placeholder="OpenAI or OpenAI, Groq"
                    chipClassName="bg-red-100 text-red-800"
                    chipRemoveClassName="text-red-700 hover:text-red-900"
                  />
                  <StringListEditor
                    label="Allowed Quantizations"
                    values={formData.allowedQuantizations}
                    draft={allowedQuantizationsDraft}
                    onDraftChange={setAllowedQuantizationsDraft}
                    onAdd={() => addListValue('allowedQuantizations', allowedQuantizationsDraft, setAllowedQuantizationsDraft)}
                    onRemove={(value) => removeListValue('allowedQuantizations', value)}
                    onCopy={() => copyListValues(formData.allowedQuantizations)}
                    emptyText="No quantizations added"
                    placeholder="fp16 or fp16, int8"
                    chipClassName="bg-purple-100 text-purple-800"
                    chipRemoveClassName="text-purple-700 hover:text-purple-900"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <Select
                    label="Sort Order"
                    value={formData.sortOrder || ''}
                    onChange={(e) => setFormData((prev) => ({
                      ...prev,
                      sortOrder: (e.target.value || null) as 'price' | 'throughput' | 'latency' | null,
                    }))}
                    options={[
                      { value: '', label: 'None' },
                      { value: 'price', label: 'Price' },
                      { value: 'throughput', label: 'Throughput' },
                      { value: 'latency', label: 'Latency' },
                    ]}
                  />
                </div>
              </div>

              {/* Mode */}
              <div className="border-t pt-4">
                <Select
                  label="Completion Mode"
                  value={formData.mode}
                  onChange={(e) => setFormData((prev) => ({ ...prev, mode: e.target.value as 'instruction' | 'raw' }))}
                  options={[
                    { value: 'instruction', label: 'Instruction (Chat Completion)' },
                    { value: 'raw', label: 'Raw (Text Completion)' },
                  ]}
                />
                <p className="text-xs text-gray-500 mt-1">
                  {formData.mode === 'instruction'
                    ? 'Uses /chat/completions with system message + prompt + context'
                    : 'Uses /completions with context as the raw prompt'}
                </p>
              </div>

              {/* Instruction mode settings */}
              {formData.mode === 'instruction' && (
                <div className="space-y-3">
                  <Textarea
                    label="System Message"
                    value={formData.systemMessage}
                    onChange={(e) => setFormData((prev) => ({ ...prev, systemMessage: e.target.value }))}
                    rows={3}
                    placeholder="You are a writing assistant..."
                  />
                  <Textarea
                    label="Prompt (prepended to context)"
                    value={formData.prompt}
                    onChange={(e) => setFormData((prev) => ({ ...prev, prompt: e.target.value }))}
                    rows={3}
                    placeholder="Continue the following text naturally..."
                  />
                </div>
              )}

              {/* Context length */}
              <Slider
                label="Context Length (chars)"
                value={formData.contextLength}
                onChange={(v) => setFormData((prev) => ({ ...prev, contextLength: Math.round(v) }))}
                min={100}
                max={5000}
                step={100}
                tooltip="Number of characters before the cursor to send as context"
              />

              {/* Cost tracking display */}
              {(selectedModel.totalCost > 0 || selectedModel.totalTokens > 0) && (
                <div className="border-t pt-3">
                  <h4 className="text-sm font-medium text-gray-700 mb-1">Usage</h4>
                  <p className="text-xs text-gray-500 font-mono">
                    {selectedModel.totalTokens.toLocaleString()} tokens &middot; {formatCost(selectedModel.totalCost)}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500 text-sm">
              Select a model to configure, or create a new one.
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
