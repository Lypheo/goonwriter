import { useState, useEffect, useRef } from 'react';
import { useModelStore, defaultInstructionTemplate } from '../../stores';
import type { InstructionTemplate } from '../../types';
import { Input, Textarea, Select, Modal } from '../ui/common';

interface ModelConfigDialogProps {
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

export function ModelConfigDialog({ isOpen, onClose }: ModelConfigDialogProps) {
  const { models, createModel, updateModel, deleteModel, duplicateModel, selectedModelId } = useModelStore();
  
  // Currently selected model in the list (for editing)
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const selectedItemRef = useRef<HTMLDivElement | null>(null);
  const lastLoadedIdRef = useRef<string | null>(null);
  const didInitSelectionRef = useRef(false);
  
  // Form state
  const [formData, setFormData] = useState<{
    name: string;
    baseUrl: string;
    token: string;
    modelId: string;
    disableThinkingPrefill: string;
    instructionTemplate: InstructionTemplate;
  }>({
    name: '',
    baseUrl: '',
    token: '',
    modelId: '',
    disableThinkingPrefill: '</think>',
    instructionTemplate: { ...defaultInstructionTemplate },
  });
  
  // Local state for comma-separated fields
  const [allowedProvidersText, setAllowedProvidersText] = useState('');
  const [bannedProvidersText, setBannedProvidersText] = useState('');
  const [allowedQuantizationsText, setAllowedQuantizationsText] = useState('');
  
  const selectedModel = models.find(m => m.id === selectedId);
  
  // Select the currently selected model when dialog opens (once per open)
  useEffect(() => {
    if (!isOpen) {
      didInitSelectionRef.current = false;
      return;
    }
    if (didInitSelectionRef.current) return;

    if (selectedModelId && models.some((m) => m.id === selectedModelId)) {
      setSelectedId(selectedModelId);
    } else if (models.length > 0) {
      setSelectedId(models[0].id);
    }
    didInitSelectionRef.current = true;
  }, [isOpen, models, selectedModelId]);
  
  // Load form data only when selected model changes
  useEffect(() => {
    if (!selectedId) {
      lastLoadedIdRef.current = null;
      setFormData({
        name: '',
        baseUrl: '',
        token: '',
        modelId: '',
        disableThinkingPrefill: '</think>',
        instructionTemplate: { ...defaultInstructionTemplate },
      });
      setAllowedProvidersText('');
      setBannedProvidersText('');
      setAllowedQuantizationsText('');
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
      disableThinkingPrefill: model.disableThinkingPrefill ?? '</think>',
      instructionTemplate: { ...model.instructionTemplate },
    });
    setAllowedProvidersText(model.instructionTemplate.allowedProviders.join(', '));
    setBannedProvidersText(model.instructionTemplate.bannedProviders.join(', '));
    setAllowedQuantizationsText(model.instructionTemplate.allowedQuantizations.join(', '));
  }, [selectedId, models]);

  // Focus selected model when dialog opens
  useEffect(() => {
    if (!isOpen) return;
    if (!selectedItemRef.current) return;
    const raf = requestAnimationFrame(() => {
      selectedItemRef.current?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, [isOpen, selectedId, models.length]);
  
  // Reset state when dialog closes
  useEffect(() => {
    if (!isOpen) {
      setSelectedId(null);
      setRenamingId(null);
    }
  }, [isOpen]);
  
  const handleCreate = () => {
    const newModel = createModel({
      name: 'New Model',
      baseUrl: 'https://openrouter.ai/api/v1',
      token: '',
      modelId: '',
      disableThinkingPrefill: '</think>',
      instructionTemplate: { ...defaultInstructionTemplate },
    });
    setSelectedId(newModel.id);
    // Start renaming immediately
    setRenamingId(newModel.id);
    setRenameValue('New Model');
  };
  
  const handleDuplicate = (id: string) => {
    const duplicated = duplicateModel(id);
    if (duplicated) {
      setSelectedId(duplicated.id);
    }
  };
  
  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this model?')) {
      deleteModel(id);
      // Select another model if available
      const remaining = models.filter(m => m.id !== id);
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
  
  const updateTemplate = (field: keyof InstructionTemplate, value: unknown) => {
    setFormData((prev) => ({
      ...prev,
      instructionTemplate: {
        ...prev.instructionTemplate,
        [field]: value,
      },
    }));
  };
  
  const parseArrayValue = (value: string): string[] => {
    return value
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  };
  
  // Auto-save on form changes (debounced via updateModel)
  useEffect(() => {
    if (selectedId && formData.name.trim() && formData.baseUrl.trim() && formData.modelId.trim()) {
      const timeoutId = setTimeout(() => {
        updateModel(selectedId, formData);
      }, 500);
      return () => clearTimeout(timeoutId);
    }
  }, [formData, selectedId]);
  
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Model Configuration" size="xl">
      <div className="flex h-[60vh] -m-4">
        {/* Left panel - Model list */}
        <div className="w-56 flex-shrink-0 border-r border-gray-200 flex flex-col bg-gray-50">
          {/* List header with actions */}
          <div className="p-2 border-b border-gray-200 flex items-center gap-1">
            <button
              onClick={handleCreate}
              className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-sm text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50"
              title="Create new model"
            >
              <PlusIcon />
              <span>New</span>
            </button>
          </div>
          
          {/* Model list */}
          <div className="flex-1 overflow-y-auto">
            {models.length === 0 ? (
              <div className="p-4 text-sm text-gray-500 text-center">
                No models configured.
                <br />
                Click "New" to add one.
              </div>
            ) : (
              <ul className="py-1">
                {models.map((model) => (
                  <li key={model.id}>
                    <div
                      ref={selectedId === model.id ? selectedItemRef : null}
                      tabIndex={selectedId === model.id ? 0 : -1}
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
                          <span className="flex-1 text-sm truncate" title={model.name}>
                            {model.name}
                          </span>
                          {/* Action buttons - shown on hover or when selected */}
                          <div
                            className={`flex items-center gap-0.5 ${
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
        
        {/* Right panel - Configuration form */}
        <div className="flex-1 overflow-y-auto p-4">
          {selectedModel ? (
            <div className="space-y-4">
              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Display Name *"
                  value={formData.name}
                  onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="My Model"
                />
                <Input
                  label="Model ID *"
                  value={formData.modelId}
                  onChange={(e) => setFormData((prev) => ({ ...prev, modelId: e.target.value }))}
                  placeholder="deepseek/deepseek-v3"
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

              <Input
                label="Disable Thinking Prefill"
                value={formData.disableThinkingPrefill}
                onChange={(e) => setFormData((prev) => ({ ...prev, disableThinkingPrefill: e.target.value }))}
                placeholder="</think>"
              />
              
              {/* Instruction Template */}
              <div className="border-t pt-4">
                <h4 className="font-medium text-gray-700 mb-3">Instruction Template Tokens</h4>
                
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <Textarea
                    label="System Prompt Prefix"
                    value={formData.instructionTemplate.systemPromptPrefix}
                    onChange={(e) => updateTemplate('systemPromptPrefix', e.target.value)}
                    rows={2}
                    placeholder="<|system|>"
                  />
                  <Textarea
                    label="System Prompt Suffix"
                    value={formData.instructionTemplate.systemPromptSuffix}
                    onChange={(e) => updateTemplate('systemPromptSuffix', e.target.value)}
                    rows={2}
                    placeholder="</s>"
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <Textarea
                    label="User Tag Prefix"
                    value={formData.instructionTemplate.userTagPrefix}
                    onChange={(e) => updateTemplate('userTagPrefix', e.target.value)}
                    rows={2}
                    placeholder="<|user|>"
                  />
                  <Textarea
                    label="User Tag Suffix"
                    value={formData.instructionTemplate.userTagSuffix}
                    onChange={(e) => updateTemplate('userTagSuffix', e.target.value)}
                    rows={2}
                    placeholder="</s>"
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <Textarea
                    label="Assistant Tag Prefix"
                    value={formData.instructionTemplate.assistantTagPrefix}
                    onChange={(e) => updateTemplate('assistantTagPrefix', e.target.value)}
                    rows={2}
                    placeholder="<|assistant|>"
                  />
                  <Textarea
                    label="Assistant Tag Suffix"
                    value={formData.instructionTemplate.assistantTagSuffix}
                    onChange={(e) => updateTemplate('assistantTagSuffix', e.target.value)}
                    rows={2}
                    placeholder="</s>"
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <Textarea
                    label="Think Tag Prefix"
                    value={formData.instructionTemplate.thinkTagPrefix}
                    onChange={(e) => updateTemplate('thinkTagPrefix', e.target.value)}
                    rows={2}
                    placeholder="<think>"
                  />
                  <Textarea
                    label="Think Tag Suffix"
                    value={formData.instructionTemplate.thinkTagSuffix}
                    onChange={(e) => updateTemplate('thinkTagSuffix', e.target.value)}
                    rows={2}
                    placeholder="</think>"
                  />
                </div>
              </div>
              
              {/* Provider Settings */}
              <div className="border-t pt-4">
                <h4 className="font-medium text-gray-700 mb-3">Provider Settings</h4>
                
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <Input
                    label="Allowed Providers (comma-separated)"
                    value={allowedProvidersText}
                    onChange={(e) => {
                      const value = e.target.value;
                      setAllowedProvidersText(value);
                      updateTemplate('allowedProviders', parseArrayValue(value));
                    }}
                    placeholder="DeepInfra, Together"
                  />
                  <Input
                    label="Banned Providers (comma-separated)"
                    value={bannedProvidersText}
                    onChange={(e) => {
                      const value = e.target.value;
                      setBannedProvidersText(value);
                      updateTemplate('bannedProviders', parseArrayValue(value));
                    }}
                    placeholder="OpenAI"
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    label="Allowed Quantizations (comma-separated)"
                    value={allowedQuantizationsText}
                    onChange={(e) => {
                      const value = e.target.value;
                      setAllowedQuantizationsText(value);
                      updateTemplate('allowedQuantizations', parseArrayValue(value));
                    }}
                    placeholder="fp16, int8"
                  />
                  <Select
                    label="Sort Order"
                    value={formData.instructionTemplate.sortOrder || ''}
                    onChange={(e) => updateTemplate('sortOrder', e.target.value || null)}
                    options={[
                      { value: '', label: 'None' },
                      { value: 'price', label: 'Price' },
                      { value: 'throughput', label: 'Throughput' },
                      { value: 'latency', label: 'Latency' },
                    ]}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500">
              <div className="text-center">
                <p>Select a model to configure</p>
                <p className="text-sm mt-2">or create a new one</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
