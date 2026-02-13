import { useState } from 'react';
import { useModelStore, useGenerationStore, useDataStore, useAppStore } from '../../stores';
import { streamCompletion } from '../../services/llmService';
import type { ModelConfig } from '../../types';
import { Button, Select, Slider } from '../ui/common';
import { ModelConfigDialog } from './ModelConfigDialog';
import { SamplingParams } from './SamplingParams';
import { ResponseMetadata } from './ResponseMetadata';

const SettingsIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

const PlayIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const StopIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
  </svg>
);

export function RightSidebar() {
  const {
    models,
    selectedModelId,
    setSelectedModel,
    getSelectedModel,
    samplingParams,
    setSamplingParams,
  } = useModelStore();
  
  const { isGenerating, startGeneration, stopGeneration, setResponseMetadata } = useGenerationStore();
  const { stories, updateStory } = useDataStore();
  const { selectedStoryId } = useAppStore();
  
  const [showModelDialog, setShowModelDialog] = useState(false);
  const [editingModel, setEditingModel] = useState<ModelConfig | null>(null);
  
  const selectedModel = getSelectedModel();
  const selectedStory = stories.find((s) => s.id === selectedStoryId);
  
  const handleGenerate = async () => {
    if (!selectedModel || !selectedStory || isGenerating) return;
    
    const abortController = startGeneration();
    let generatedText = '';
    let wordCount = 0;
    const startTime = Date.now();
    const initialContent = selectedStory.content || '';
    const initialLength = initialContent.length;
    
    try {
      await streamCompletion(
        selectedModel,
        selectedStory.content,
        samplingParams,
        {
          onChunk: (text) => {
            generatedText += text;
            wordCount = generatedText.split(/\s+/).filter((w) => w.length > 0).length;
            
            const elapsedSeconds = (Date.now() - startTime) / 1000;
            const wps = elapsedSeconds > 0 ? wordCount / elapsedSeconds : 0;
            
            // Update story content
            updateStory(selectedStory.id, {
              content: initialContent + generatedText,
              // Update authorship spans
              authorshipSpans: [
                ...selectedStory.authorshipSpans.filter(
                  (span) => span.end <= initialLength
                ),
                {
                  start: initialLength,
                  end: initialLength + generatedText.length,
                  author: 'ai' as const,
                  modelId: selectedModel.modelId,
                },
              ],
            });
            
            setResponseMetadata({ wordsPerSecond: wps });
          },
          onMetadata: (chunk) => {
            setResponseMetadata({
              id: chunk.id,
              provider: chunk.provider,
              model: chunk.model,
              created: chunk.created,
              finishReason: chunk.choices?.[0]?.finish_reason || null,
              nativeFinishReason: chunk.choices?.[0]?.native_finish_reason || null,
              usage: chunk.usage || null,
            });
          },
          onError: (error) => {
            setResponseMetadata({ error });
            stopGeneration();
          },
          onComplete: () => {
            stopGeneration();
          },
        },
        abortController.signal
      );
    } catch (error) {
      setResponseMetadata({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      stopGeneration();
    }
  };
  
  const handleStop = () => {
    stopGeneration();
  };
  
  const modelOptions = [
    { value: '', label: 'Select a model...' },
    ...models.map((m) => ({ value: m.id, label: m.name })),
  ];
  
  return (
    <div className="w-72 h-full bg-gray-50 border-l border-gray-200 flex flex-col">
      {/* Header */}
      <div className="p-3 border-b border-gray-200">
        <h2 className="font-semibold text-gray-800">LLM Controls</h2>
      </div>
      
      {/* Model Selection */}
      <div className="p-3 border-b border-gray-200">
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Select
              label="Model"
              value={selectedModelId || ''}
              onChange={(e) => setSelectedModel(e.target.value || null)}
              options={modelOptions}
            />
          </div>
          <Button
            variant="ghost"
            size="md"
            onClick={() => {
              setEditingModel(null);
              setShowModelDialog(true);
            }}
            title="Configure Models"
          >
            <SettingsIcon />
          </Button>
        </div>
        
        {selectedModel && (
          <button
            className="mt-2 text-xs text-blue-600 hover:underline"
            onClick={() => {
              setEditingModel(selectedModel);
              setShowModelDialog(true);
            }}
          >
            Edit selected model
          </button>
        )}
        
        {models.length === 0 && (
          <p className="mt-2 text-xs text-gray-500">
            No models configured.{' '}
            <button
              className="text-blue-600 hover:underline"
              onClick={() => {
                setEditingModel(null);
                setShowModelDialog(true);
              }}
            >
              Add one
            </button>
          </p>
        )}
      </div>
      
      {/* Max Tokens */}
      <div className="p-3 border-b border-gray-200">
        <Slider
          label="Max Tokens"
          value={samplingParams.max_tokens || 256}
          onChange={(value) => setSamplingParams({ max_tokens: Math.round(value) })}
          min={1}
          max={4096}
          step={1}
          tooltip="The maximum number of tokens to generate in the response."
        />
      </div>
      
      {/* Generate Button */}
      <div className="p-3 border-b border-gray-200">
        {!isGenerating ? (
          <Button
            className="w-full"
            onClick={handleGenerate}
            disabled={!selectedModel || !selectedStory}
          >
            <PlayIcon />
            <span className="ml-2">Generate</span>
          </Button>
        ) : (
          <Button
            className="w-full"
            variant="danger"
            onClick={handleStop}
          >
            <StopIcon />
            <span className="ml-2">Stop</span>
          </Button>
        )}
        
        {!selectedStory && (
          <p className="mt-2 text-xs text-gray-500 text-center">
            Select a story to generate
          </p>
        )}
      </div>
      
      {/* Sampling Parameters */}
      <div className="p-3 border-b border-gray-200">
        <SamplingParams />
      </div>
      
      {/* Response Metadata */}
      <div className="flex-1 overflow-y-auto">
        <ResponseMetadata />
      </div>
      
      {/* Model Config Dialog */}
      <ModelConfigDialog
        isOpen={showModelDialog}
        onClose={() => {
          setShowModelDialog(false);
          setEditingModel(null);
        }}
        editingModel={editingModel}
      />
    </div>
  );
}
