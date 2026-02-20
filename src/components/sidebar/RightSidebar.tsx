import { useState, useEffect, useCallback } from 'react';
import { useModelStore, useGenerationStore, useDataStore, useAppStore } from '../../stores';
import { streamCompletion } from '../../services/llmService';
import { Button, Select, Slider } from '../ui/common';
import { ModelConfigDialog } from './ModelConfigDialog';
import { SamplingParams } from './SamplingParams';
import { ResponseMetadata } from './ResponseMetadata';

// Escape HTML entities
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '<br>');
}

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

const HelpIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
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
  const [autoCloseThink, setAutoCloseThink] = useState(true);
  const [showHelp, setShowHelp] = useState(false);
  
  const selectedModel = getSelectedModel();
  const selectedStory = stories.find((s) => s.id === selectedStoryId);
  
  const handleGenerate = useCallback(async () => {
    if (!selectedModel || !selectedStory || isGenerating) return;
    
    const abortController = startGeneration();
    let generatedText = '';
    let wordCount = 0;
    const startTime = Date.now();
    
    // Get the current HTML content as the base
    const initialHtml = selectedStory.htmlContent || `<p>${escapeHtml(selectedStory.content || '')}</p>`;
    
    try {
      await streamCompletion(
        selectedModel,
        selectedStory.content,
        samplingParams,
        {
          onChunk: (text) => {
            generatedText += text;
            wordCount = generatedText.split(/\\s+/).filter((w) => w.length > 0).length;
            
            const elapsedSeconds = (Date.now() - startTime) / 1000;
            const wps = elapsedSeconds > 0 ? wordCount / elapsedSeconds : 0;
            
            // Build HTML with AI-authored mark wrapping the generated text
            // The mark will persist through all text operations
            const escapedGenerated = escapeHtml(generatedText);
            const aiMarkedText = `<span data-ai-authored="true" data-model-id="${selectedModel.modelId}" class="ai-authored">${escapedGenerated}</span>`;
            
            // Insert at end of last paragraph or create new content
            let newHtml: string;
            if (initialHtml.endsWith('</p>')) {
              // Insert before the closing </p> tag
              newHtml = initialHtml.slice(0, -4) + aiMarkedText + '</p>';
            } else {
              newHtml = initialHtml + aiMarkedText;
            }
            
            // Update story with both plain text and HTML
            updateStory(selectedStory.id, {
              content: (selectedStory.content || '') + generatedText,
              htmlContent: newHtml,
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
        abortController.signal,
        { autoCloseThink }
      );
    } catch (error) {
      setResponseMetadata({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      stopGeneration();
    }
  }, [selectedModel, selectedStory, isGenerating, samplingParams, autoCloseThink, startGeneration, stopGeneration, setResponseMetadata, updateStory]);
  
  // Ctrl+Enter hotkey for generate/stop
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        if (isGenerating) {
          stopGeneration();
        } else {
          handleGenerate();
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleGenerate, isGenerating, stopGeneration]);
  
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
      <div className="p-3 border-b border-gray-200 flex items-center justify-between">
        <h2 className="font-semibold text-gray-800">LLM Controls</h2>
        <button
          onClick={() => setShowHelp(!showHelp)}
          className="p-1 text-gray-500 hover:text-gray-700 rounded hover:bg-gray-100"
          title="Help - Special Tokens"
        >
          <HelpIcon />
        </button>
      </div>
      
      {/* Help Panel */}
      {showHelp && (
        <div className="p-3 border-b border-gray-200 bg-blue-50 text-xs">
          <h3 className="font-semibold text-gray-700 mb-2">Special Placeholder Tokens</h3>
          <p className="text-gray-600 mb-2">Use these tokens in your story. They will be replaced with model-specific tags when sent to the API:</p>
          <ul className="space-y-1 text-gray-600 font-mono text-[10px]">
            <li><code className="bg-yellow-100 px-1 rounded">{`<<start_sys_prompt>>`}</code> / <code className="bg-yellow-100 px-1 rounded">{`<<end_sys_prompt>>`}</code></li>
            <li><code className="bg-blue-100 px-1 rounded">{`<<start_user>>`}</code> / <code className="bg-blue-100 px-1 rounded">{`<<end_user>>`}</code></li>
            <li><code className="bg-green-100 px-1 rounded">{`<<start_ai>>`}</code> / <code className="bg-green-100 px-1 rounded">{`<<end_ai>>`}</code></li>
            <li><code className="bg-purple-100 px-1 rounded">{`<think>`}</code> / <code className="bg-purple-100 px-1 rounded">{`</think>`}</code></li>
          </ul>
        </div>
      )}
      
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
            onClick={() => setShowModelDialog(true)}
            title="Configure Models"
          >
            <SettingsIcon />
          </Button>
        </div>
        
        {models.length === 0 && (
          <p className="mt-2 text-xs text-gray-500">
            No models configured.{' '}
            <button
              className="text-blue-600 hover:underline"
              onClick={() => setShowModelDialog(true)}
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
        <label 
          className="flex items-center gap-2 mb-2 text-sm text-gray-600 cursor-pointer"
          title="When enabled, automatically inserts a closing </think> tag when the model transitions from reasoning to text output. Often needed because most providers don't transmit </think> tokens."
        >
          <input
            type="checkbox"
            checked={autoCloseThink}
            onChange={(e) => setAutoCloseThink(e.target.checked)}
            className="rounded border-gray-300"
          />
          <span>Auto-close think tags</span>
        </label>
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
        onClose={() => setShowModelDialog(false)}
      />
    </div>
  );
}
