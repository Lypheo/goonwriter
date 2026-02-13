import React, { useState } from 'react';
import { useModelStore, defaultInstructionTemplate } from '../../stores';
import type { ModelConfig, InstructionTemplate } from '../../types';
import { Button, Input, Textarea, Select, Modal } from '../ui/common';

interface ModelConfigDialogProps {
  isOpen: boolean;
  onClose: () => void;
  editingModel?: ModelConfig | null;
}

export function ModelConfigDialog({ isOpen, onClose, editingModel }: ModelConfigDialogProps) {
  const { createModel, updateModel, deleteModel } = useModelStore();
  
  const [formData, setFormData] = useState<{
    name: string;
    baseUrl: string;
    token: string;
    modelId: string;
    instructionTemplate: InstructionTemplate;
  }>({
    name: editingModel?.name || '',
    baseUrl: editingModel?.baseUrl || '',
    token: editingModel?.token || '',
    modelId: editingModel?.modelId || '',
    instructionTemplate: editingModel?.instructionTemplate || { ...defaultInstructionTemplate },
  });
  
  // Local state for comma-separated fields (to allow typing commas)
  const [allowedProvidersText, setAllowedProvidersText] = useState(
    editingModel?.instructionTemplate.allowedProviders.join(', ') || ''
  );
  const [bannedProvidersText, setBannedProvidersText] = useState(
    editingModel?.instructionTemplate.bannedProviders.join(', ') || ''
  );
  const [allowedQuantizationsText, setAllowedQuantizationsText] = useState(
    editingModel?.instructionTemplate.allowedQuantizations.join(', ') || ''
  );
  
  // Reset form when dialog opens/closes or editingModel changes
  React.useEffect(() => {
    if (isOpen) {
      setFormData({
        name: editingModel?.name || '',
        baseUrl: editingModel?.baseUrl || '',
        token: editingModel?.token || '',
        modelId: editingModel?.modelId || '',
        instructionTemplate: editingModel?.instructionTemplate || { ...defaultInstructionTemplate },
      });
      setAllowedProvidersText(editingModel?.instructionTemplate.allowedProviders.join(', ') || '');
      setBannedProvidersText(editingModel?.instructionTemplate.bannedProviders.join(', ') || '');
      setAllowedQuantizationsText(editingModel?.instructionTemplate.allowedQuantizations.join(', ') || '');
    }
  }, [isOpen, editingModel]);
  
  const handleSave = () => {
    if (!formData.name.trim() || !formData.baseUrl.trim() || !formData.modelId.trim()) {
      return;
    }
    
    if (editingModel) {
      updateModel(editingModel.id, formData);
    } else {
      createModel(formData);
    }
    onClose();
  };
  
  const handleDelete = () => {
    if (editingModel) {
      deleteModel(editingModel.id);
      onClose();
    }
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
  
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editingModel ? 'Edit Model Configuration' : 'Add Model Configuration'}
      size="lg"
    >
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
          label="API Token *"
          type="password"
          value={formData.token}
          onChange={(e) => setFormData((prev) => ({ ...prev, token: e.target.value }))}
          placeholder="sk-..."
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
              onChange={(e) => setAllowedProvidersText(e.target.value)}
              onBlur={() => updateTemplate('allowedProviders', parseArrayValue(allowedProvidersText))}
              placeholder="DeepInfra, Together"
            />
            <Input
              label="Banned Providers (comma-separated)"
              value={bannedProvidersText}
              onChange={(e) => setBannedProvidersText(e.target.value)}
              onBlur={() => updateTemplate('bannedProviders', parseArrayValue(bannedProvidersText))}
              placeholder="OpenAI"
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Allowed Quantizations (comma-separated)"
              value={allowedQuantizationsText}
              onChange={(e) => setAllowedQuantizationsText(e.target.value)}
              onBlur={() => updateTemplate('allowedQuantizations', parseArrayValue(allowedQuantizationsText))}
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
        
        {/* Actions */}
        <div className="flex justify-between border-t pt-4">
          <div>
            {editingModel && (
              <Button variant="danger" onClick={handleDelete}>
                Delete Model
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleSave}>
              {editingModel ? 'Save Changes' : 'Add Model'}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
