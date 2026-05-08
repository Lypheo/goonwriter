import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useModelStore, useGenerationStore, useDataStore, useAppStore, useCompletionModelStore } from '../../stores';
import { replacePlaceholdersWithModelTokens, streamCompletion, streamChatCompletion } from '../../services/llmService';
import { storySectionsToChatMessages, storySectionsToGenerationPrompt } from '../../services/storySections';
import { resolveSectionsForGeneration } from '../../services/promptEngineering';
import { createId } from '../../services/id';
import { fetchOpenRouterModelPricing } from '../../services/apiService';
import { Button, Modal, Slider } from '../ui/common';
import { ModelConfigDialog } from './ModelConfigDialog';
import { CompletionModelConfigDialog } from './CompletionModelConfigDialog';
import { SamplingParams } from './SamplingParams';
import { ResponseMetadata } from './ResponseMetadata';
import type { StorySection } from '../../types';

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
  const { stories, updateStory, applyWritingPlanFromStoryResponse } = useDataStore();
  const { selectedStoryId } = useAppStore();
  
  const [showModelDialog, setShowModelDialog] = useState(false);
  const [showCompletionDialog, setShowCompletionDialog] = useState(false);
  const [showRawPromptModal, setShowRawPromptModal] = useState(false);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [exportStatus, setExportStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const [modelDropdownMaxHeight, setModelDropdownMaxHeight] = useState(384);
  const [disableThinking, setDisableThinking] = useState(false);
  const [useChatCompletion, setUseChatCompletion] = useState(false);
  const [openRouterPricingByModelId, setOpenRouterPricingByModelId] = useState<Record<string, { prompt: number | null; completion: number | null }>>({});
  const [openRouterPricingState, setOpenRouterPricingState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const modelDropdownRef = useRef<HTMLDivElement | null>(null);
  const modelDropdownButtonRef = useRef<HTMLButtonElement | null>(null);
  
  const completionModels = useCompletionModelStore((s) => s.models);
  const updateCompletionModel = useCompletionModelStore((s) => s.updateModel);
  const enabledCompletionCount = completionModels.filter((m) => m.enabled).length;

  const enabledModels = useMemo(
    () => models.filter((model) => model.enabled !== false),
    [models]
  );
  
  const selectedModelRaw = getSelectedModel();
  const selectedModel = selectedModelRaw && selectedModelRaw.enabled !== false ? selectedModelRaw : null;
  const selectedStory = stories.find((s) => s.id === selectedStoryId);
  const effectiveUseChatCompletion = useChatCompletion || !!selectedModel?.chatOnly;

  const extractNumericPrice = (value: unknown): number | null => {
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : null;
    }
    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  };

  const formatPricePerMillion = (pricePerToken: number): string => {
    const perMillion = pricePerToken * 1_000_000;
    const fixed = perMillion.toFixed(perMillion >= 1 ? 4 : 6);
    let normalized = fixed.replace(/\.?0+$/, '');

    if (!normalized.includes('.')) {
      normalized += '.00';
    } else if (normalized.split('.')[1].length === 1) {
      normalized += '0';
    }

    return `$${normalized}/M`;
  };

  const isOpenRouterModel = !!selectedModel?.baseUrl && selectedModel.baseUrl.toLowerCase().includes('openrouter.ai');
  const selectedModelPricing = selectedModel ? openRouterPricingByModelId[selectedModel.id] : undefined;

  useEffect(() => {
    if (!isModelDropdownOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!modelDropdownRef.current?.contains(event.target as Node)) {
        setIsModelDropdownOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsModelDropdownOpen(false);
      }
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [isModelDropdownOpen]);

  useEffect(() => {
    if (!isModelDropdownOpen) return;

    const updateMaxHeight = () => {
      const triggerRect = modelDropdownButtonRef.current?.getBoundingClientRect();
      if (!triggerRect) return;

      const viewportBottomPadding = 8;
      const dropdownTopGap = 4;
      const availableHeight = Math.floor(window.innerHeight - triggerRect.bottom - dropdownTopGap - viewportBottomPadding);

      setModelDropdownMaxHeight(Math.max(120, availableHeight));
    };

    updateMaxHeight();
    window.addEventListener('resize', updateMaxHeight);
    window.addEventListener('scroll', updateMaxHeight, true);

    return () => {
      window.removeEventListener('resize', updateMaxHeight);
      window.removeEventListener('scroll', updateMaxHeight, true);
    };
  }, [isModelDropdownOpen]);

  useEffect(() => {
    let active = true;

    const loadPricing = async () => {
      const openRouterModels = enabledModels.filter(
        (model) => model.baseUrl?.toLowerCase().includes('openrouter.ai') && model.token && model.modelId
      );

      if (openRouterModels.length === 0) {
        setOpenRouterPricingByModelId({});
        setOpenRouterPricingState('idle');
        return;
      }

      setOpenRouterPricingState('loading');

      const pricingEntries = await Promise.all(
        openRouterModels.map(async (model) => {
          const pricing = await fetchOpenRouterModelPricing(model.token, model.modelId);
          if (!pricing) return null;
          return {
            modelId: model.id,
            prompt: extractNumericPrice(pricing.prompt),
            completion: extractNumericPrice(pricing.completion),
          };
        })
      );

      if (!active) return;

      const nextPricingByModelId: Record<string, { prompt: number | null; completion: number | null }> = {};
      for (const entry of pricingEntries) {
        if (!entry) continue;
        if (entry.prompt === null && entry.completion === null) continue;
        nextPricingByModelId[entry.modelId] = {
          prompt: entry.prompt,
          completion: entry.completion,
        };
      }

      setOpenRouterPricingByModelId(nextPricingByModelId);
      setOpenRouterPricingState(Object.keys(nextPricingByModelId).length > 0 ? 'ready' : 'error');
    };

    void loadPricing();

    return () => {
      active = false;
    };
  }, [enabledModels]);

  useEffect(() => {
    if (!selectedModelId) return;
    const stillEnabled = enabledModels.some((model) => model.id === selectedModelId);
    if (!stillEnabled) {
      setSelectedModel(null);
    }
  }, [enabledModels, selectedModelId, setSelectedModel]);

  const ensureAssistantTail = (inputSections: StorySection[]): { sections: StorySection[]; assistantIndex: number } => {
    const next = inputSections.map((section) => ({ ...section }));
    const lastIndex = next.length - 1;

    if (lastIndex < 0) {
      next.push(
        { id: createId(), type: 'system', content: '', thinkingContent: '', collapsed: false },
        { id: createId(), type: 'user', content: '', thinkingContent: '', collapsed: false },
        { id: createId(), type: 'assistant', content: '', thinkingContent: '', collapsed: false }
      );
      return { sections: next, assistantIndex: 2 };
    }

    if (next[lastIndex].type === 'assistant') {
      return { sections: next, assistantIndex: lastIndex };
    }

    next.push({ id: createId(), type: 'assistant', content: '', thinkingContent: '', collapsed: false });
    return { sections: next, assistantIndex: next.length - 1 };
  };

  const splitStreamedContent = (
    rawChunk: string,
    state: { inThink: boolean; buffer: string },
    thinkTagPrefix: string,
    thinkTagSuffix: string
  ): { responsePart: string; thinkingPart: string } => {
    // Some providers emit raw <think> tags in the text stream; others emit only a closing tag.
    if (!thinkTagPrefix || !thinkTagSuffix) {
      return { responsePart: rawChunk, thinkingPart: '' };
    }

    state.buffer += rawChunk;
    let responsePart = '';
    let thinkingPart = '';

    while (state.buffer.length > 0) {
      if (state.inThink) {
        // Continue consuming buffered text as reasoning until we see a closing think tag.
        const endIdx = state.buffer.indexOf(thinkTagSuffix);
        if (endIdx === -1) {
          thinkingPart += state.buffer;
          state.buffer = '';
          break;
        }
        thinkingPart += state.buffer.slice(0, endIdx);
        state.buffer = state.buffer.slice(endIdx + thinkTagSuffix.length);
        state.inThink = false;
        continue;
      }

      const startIdx = state.buffer.indexOf(thinkTagPrefix);
      const endIdx = state.buffer.indexOf(thinkTagSuffix);

      if (endIdx !== -1 && (startIdx === -1 || endIdx < startIdx)) {
        // Handle streams that start with "reasoning</think>" (no opening tag).
        thinkingPart += state.buffer.slice(0, endIdx);
        state.buffer = state.buffer.slice(endIdx + thinkTagSuffix.length);
        continue;
      }

      if (startIdx === -1) {
        responsePart += state.buffer;
        state.buffer = '';
        break;
      }

      responsePart += state.buffer.slice(0, startIdx);
      state.buffer = state.buffer.slice(startIdx + thinkTagPrefix.length);
      state.inThink = true;
    }

    return { responsePart, thinkingPart };
  };
  
  const handleGenerate = useCallback(async () => {
    if (!selectedModel || !selectedStory || isGenerating) return;

    const ensured = ensureAssistantTail(selectedStory.sections || []);
    let workingSections = ensured.sections;
    const assistantIndex = ensured.assistantIndex;
    const assistantBaseContent = workingSections[assistantIndex].content || '';
    const assistantBaseThinking = workingSections[assistantIndex].thinkingContent || '';
    const thinkTagPrefix = selectedModel.instructionTemplate.thinkTagPrefix || '<think>';
    const thinkTagSuffix = selectedModel.instructionTemplate.thinkTagSuffix || '</think>';
    const thinkState = { inThink: false, buffer: '' };
    let generatedResponse = '';
    let generatedThinking = '';

    updateStory(selectedStory.id, {
      sections: workingSections,
    });

    const generationSections = resolveSectionsForGeneration({ ...selectedStory, sections: workingSections }, stories);

    let chatMessages: { role: 'system' | 'user' | 'assistant'; content: string }[] | null = null;
    if (effectiveUseChatCompletion) {
      chatMessages = storySectionsToChatMessages(generationSections);
      if (!chatMessages.some((message) => message.role === 'user')) {
        alert('Cannot use chat format: at least one user section with content is required.');
        return;
      }
    }
    
    const abortController = startGeneration();
    let wordCount = 0;
    const startTime = Date.now();
    
    const callbacks = {
      onChunk: (data: { text: string; reasoning: string }) => {
        // Split raw text into response vs reasoning, then merge in explicit reasoning field if provided.
        const parsed = splitStreamedContent(data.text, thinkState, thinkTagPrefix, thinkTagSuffix);
        generatedResponse += parsed.responsePart;
        generatedThinking += parsed.thinkingPart;
        if (data.reasoning) {
          generatedThinking += data.reasoning;
        }

        wordCount = `${generatedResponse} ${generatedThinking}`.split(/\s+/).filter((w) => w.length > 0).length;
        
        const elapsedSeconds = (Date.now() - startTime) / 1000;
        const wps = elapsedSeconds > 0 ? wordCount / elapsedSeconds : 0;
        
        workingSections = workingSections.map((section, index) =>
          index === assistantIndex
            ? {
                ...section,
                content: `${assistantBaseContent}${generatedResponse}`,
                thinkingContent: `${assistantBaseThinking}${generatedThinking}`,
              }
            : section
        );

        updateStory(selectedStory.id, {
          sections: workingSections,
        });
        
        setResponseMetadata({ wordsPerSecond: wps });
      },
      onMetadata: (chunk: import('../../types').CompletionChunk) => {
        setResponseMetadata({
          id: chunk.id,
          provider: chunk.provider,
          model: chunk.model,
          created: chunk.created,
          finishReason: chunk.choices?.[0]?.finish_reason || null,
          nativeFinishReason: chunk.choices?.[0]?.native_finish_reason || null,
          usage: chunk.usage || null,
        });
        
        // Accumulate cost and tokens when usage info is available
        if (chunk.usage) {
          const currentCost = selectedStory.totalCost || 0;
          const currentTokens = selectedStory.totalTokens || 0;
          updateStory(selectedStory.id, {
            sections: workingSections,
            totalCost: currentCost + (chunk.usage.cost || 0),
            totalTokens: chunk.usage.total_tokens ?? currentTokens,
          });
        }
      },
      onError: (error: string) => {
        setResponseMetadata({ error });
        stopGeneration();
      },
      onComplete: () => {
        if (thinkState.buffer.length > 0) {
          if (thinkState.inThink) {
            generatedThinking += thinkState.buffer;
          } else {
            generatedResponse += thinkState.buffer;
          }
          thinkState.buffer = '';
          workingSections = workingSections.map((section, index) =>
            index === assistantIndex
              ? {
                  ...section,
                  content: `${assistantBaseContent}${generatedResponse}`,
                  thinkingContent: `${assistantBaseThinking}${generatedThinking}`,
                }
              : section
          );
          updateStory(selectedStory.id, {
            sections: workingSections,
          });
        }
        applyWritingPlanFromStoryResponse(selectedStory.id, `${assistantBaseContent}${generatedResponse}`);
        stopGeneration();
      },
    };
    
    try {
      if (effectiveUseChatCompletion && chatMessages) {
        await streamChatCompletion(
          selectedModel,
          chatMessages,
          samplingParams,
          callbacks,
          abortController.signal,
          { disableThinking }
        );
      } else {
        await streamCompletion(
          selectedModel,
          storySectionsToGenerationPrompt(generationSections, {
            disableThinkingPrefill: selectedModel.disableThinkingPrefill || '</think>',
            disableThinking,
          }),
          samplingParams,
          callbacks,
          abortController.signal
        );
      }
    } catch (error) {
      setResponseMetadata({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      stopGeneration();
    }
  }, [selectedModel, selectedStory, stories, isGenerating, samplingParams, disableThinking, effectiveUseChatCompletion, startGeneration, stopGeneration, setResponseMetadata, updateStory, applyWritingPlanFromStoryResponse]);
  
  // Ctrl+Enter hotkey for generate/stop
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation?.();
        if (isGenerating) {
          stopGeneration();
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              window.dispatchEvent(new CustomEvent('goonwriter:focus-last-section-end'));
            });
          });
        } else {
          handleGenerate();
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [handleGenerate, isGenerating, stopGeneration]);
  
  const handleStop = () => {
    stopGeneration();
  };

  const rawPromptPreview = selectedStory && selectedModel
    ? replacePlaceholdersWithModelTokens(
        storySectionsToGenerationPrompt(
          ensureAssistantTail(resolveSectionsForGeneration(selectedStory, stories)).sections,
          {
            disableThinkingPrefill: selectedModel.disableThinkingPrefill || '</think>',
            disableThinking,
          }
        ),
        selectedModel.instructionTemplate
      )
    : '';

  const handleCopyRawPrompt = async () => {
    if (!rawPromptPreview) return;
    try {
      await navigator.clipboard.writeText(rawPromptPreview);
      setCopyStatus('copied');
    } catch {
      setCopyStatus('failed');
    }

    window.setTimeout(() => setCopyStatus('idle'), 1500);
  };

  const getExportStoryText = (): string => {
    if (!selectedStory) return '';

    return (selectedStory.sections || [])
      .filter((section) => section.type === 'assistant')
      .map((section) => section.content || '')
      .filter((content) => content.trim().length > 0)
      .join('\n\n');
  };

  const handleExportStory = async () => {
    const exportText = getExportStoryText();
    if (!exportText) return;

    try {
      await navigator.clipboard.writeText(exportText);
      setExportStatus('copied');
    } catch {
      setExportStatus('failed');
    }

    window.setTimeout(() => setExportStatus('idle'), 1500);
  };

  const exportStoryText = getExportStoryText();
  const sortedModels = [...enabledModels].sort((left, right) => {
    const leftPromptPrice = openRouterPricingByModelId[left.id]?.prompt;
    const rightPromptPrice = openRouterPricingByModelId[right.id]?.prompt;
    const leftHasPrice = typeof leftPromptPrice === 'number';
    const rightHasPrice = typeof rightPromptPrice === 'number';

    if (leftHasPrice && rightHasPrice) {
      if (leftPromptPrice !== rightPromptPrice) {
        return leftPromptPrice - rightPromptPrice;
      }
      return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
    }

    if (leftHasPrice) return -1;
    if (rightHasPrice) return 1;

    return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
  });

  const getModelPricingLabel = (modelId: string): string | null => {
    const pricing = openRouterPricingByModelId[modelId];
    if (!pricing) return null;

    return `${pricing.prompt !== null ? formatPricePerMillion(pricing.prompt) : 'N/A'} in | ${pricing.completion !== null ? formatPricePerMillion(pricing.completion) : 'N/A'} out`;
  };

  const selectedModelPricingLabel = selectedModel ? getModelPricingLabel(selectedModel.id) : null;
  
  return (
    <div className="w-72 h-full bg-gray-50 border-l border-gray-200 flex flex-col">
      {/* Header */}
      <div className="p-3 border-b border-gray-200 flex items-center justify-between">
        <h2 className="font-semibold text-gray-800">LLM Controls</h2>
        <HelpIcon />
      </div>
      
      {/* Model Selection */}
      <div className="p-3 border-b border-gray-200">
        <label className="block text-sm font-medium text-gray-700 mb-1">Model</label>
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <div className="relative" ref={modelDropdownRef}>
              <button
                type="button"
                ref={modelDropdownButtonRef}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm bg-white hover:bg-gray-50 transition-colors text-left"
                onClick={() => setIsModelDropdownOpen((open) => !open)}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className={`truncate ${selectedModel ? 'text-gray-900' : 'text-gray-500'}`}>
                      {selectedModel ? selectedModel.name : 'Select a model...'}
                    </p>
                    {selectedModelPricingLabel && (
                      <p className="truncate text-[11px] text-gray-500">{selectedModelPricingLabel}</p>
                    )}
                  </div>
                  <svg
                    className={`w-4 h-4 text-gray-500 transition-transform ${isModelDropdownOpen ? 'rotate-180' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>

              {isModelDropdownOpen && (
                <div
                  className="absolute z-20 mt-1 w-full overflow-y-auto rounded-md border border-gray-200 bg-white shadow-lg"
                  style={{ maxHeight: `${modelDropdownMaxHeight}px` }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedModel(null);
                      setIsModelDropdownOpen(false);
                    }}
                    className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-50 ${!selectedModelId ? 'bg-blue-50 text-blue-800' : 'text-gray-700'}`}
                  >
                    Select a model...
                  </button>
                  {sortedModels.map((model) => {
                    const pricingLabel = getModelPricingLabel(model.id);
                    const isSelected = selectedModelId === model.id;
                    return (
                      <button
                        key={model.id}
                        type="button"
                        onClick={() => {
                          setSelectedModel(model.id);
                          setIsModelDropdownOpen(false);
                        }}
                        className={`w-full px-3 py-2 text-left hover:bg-gray-50 ${isSelected ? 'bg-blue-50 text-blue-800' : 'text-gray-700'}`}
                      >
                        <p className="truncate text-sm">{model.name}</p>
                        {pricingLabel && (
                          <p className={`truncate text-[11px] ${isSelected ? 'text-blue-700' : 'text-gray-500'}`}>
                            {pricingLabel}
                          </p>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
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
        
        {enabledModels.length === 0 && (
          <p className="mt-2 text-xs text-gray-500">
            {models.length === 0 ? 'No models configured.' : 'No enabled models.'}{' '}
            <button
              className="text-blue-600 hover:underline"
              onClick={() => setShowModelDialog(true)}
            >
              {models.length === 0 ? 'Add one' : 'Enable one'}
            </button>
          </p>
        )}

        {selectedModel && isOpenRouterModel && (
          <p className="mt-2 text-xs text-gray-500">
            {openRouterPricingState === 'loading' && 'Loading pricing...'}
            {openRouterPricingState === 'error' && 'Pricing unavailable'}
            {openRouterPricingState === 'ready' && !selectedModelPricing && 'Pricing unavailable'}
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
          title="Use /chat/completions endpoint instead of /completions. Requires at least one non-empty user section."
        >
          <input
            type="checkbox"
            checked={effectiveUseChatCompletion}
            onChange={(e) => setUseChatCompletion(e.target.checked)}
            disabled={!!selectedModel?.chatOnly}
            className="rounded border-gray-300"
          />
          <span>Use chat completions{selectedModel?.chatOnly ? ' (forced by model)' : ''}</span>
        </label>
        <label
          className="flex items-center gap-2 mb-2 text-sm text-gray-600 cursor-pointer"
          title="Disable reasoning generation. In text mode, applies no-thinking prefill only when the current assistant section is empty. In chat mode, sends reasoning.enabled=false."
        >
          <input
            type="checkbox"
            checked={disableThinking}
            onChange={(e) => setDisableThinking(e.target.checked)}
            className="rounded border-gray-300"
          />
          <span>Disable thinking</span>
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

        <div className="flex justify-end mt-2">
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleExportStory}
              disabled={!selectedStory || !exportStoryText}
              title="Copy all assistant responses concatenated"
            >
              Export Story
            </Button>
            <button
              onClick={() => setShowRawPromptModal(true)}
              disabled={!selectedStory || !selectedModel}
              title="Preview the exact raw prompt sent to /completions"
              className="text-xs text-gray-500 hover:text-gray-700 underline underline-offset-2 disabled:no-underline disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Preview raw prompt
            </button>
          </div>
        </div>

        {selectedStory && (
          <p className={`mt-2 text-xs text-right ${exportStatus === 'failed' ? 'text-red-600' : 'text-gray-500'}`}>
            {exportStatus === 'copied'
              ? 'Story copied to clipboard'
              : exportStatus === 'failed'
                ? 'Export failed'
                : exportStoryText
                  ? `${exportStoryText.length.toLocaleString()} characters`
                  : 'No assistant responses to export'}
          </p>
        )}
        
        {!selectedStory && (
          <p className="mt-2 text-xs text-gray-500 text-center">
            Select a story to generate
          </p>
        )}
        {selectedStory && !selectedModel && (
          <p className="mt-2 text-xs text-gray-500 text-center">
            Select a model to preview raw prompt
          </p>
        )}
      </div>
      
      {/* Sampling Parameters */}
      <div className="p-3 border-b border-gray-200">
        <SamplingParams />
      </div>
      
      {/* Sentence Completion */}
      <div className="p-3 border-b border-gray-200">
        <div className="flex items-center justify-between mb-1">
          <label className="text-sm font-medium text-gray-700">Sentence Completion</label>
          <button
            onClick={() => setShowCompletionDialog(true)}
            className="p-1 text-gray-500 hover:text-gray-700 rounded hover:bg-gray-100"
            title="Configure completion models"
          >
            <SettingsIcon />
          </button>
        </div>
        {completionModels.length === 0 ? (
          <p className="text-xs text-gray-500">
            No models configured.{' '}
            <button
              className="text-blue-600 hover:underline"
              onClick={() => setShowCompletionDialog(true)}
            >
              Add one
            </button>
          </p>
        ) : (
          <>
            <div className="max-h-64 overflow-y-auto space-y-0.5">
              {completionModels.map((m) => (
                <button
                  key={m.id}
                  onClick={() => updateCompletionModel(m.id, { enabled: !m.enabled })}
                  className={`w-full flex items-center gap-2 px-2 py-1 rounded text-xs transition-colors text-left ${
                    m.enabled
                      ? 'bg-blue-50 text-blue-800 hover:bg-blue-100'
                      : 'text-gray-500 hover:bg-gray-100'
                  }`}
                  title={`Click to ${m.enabled ? 'disable' : 'enable'} — ${m.modelId || 'no model ID'}`}
                >
                  <span
                    className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      m.enabled ? 'bg-green-400' : 'bg-gray-300'
                    }`}
                  />
                  <span className="truncate">{m.name}</span>
                </button>
              ))}
            </div>
            {enabledCompletionCount > 0 && (
              <p className="text-[10px] text-gray-400 mt-1">Press Tab in editor to complete</p>
            )}
          </>
        )}
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
      
      {/* Completion Model Config Dialog */}
      <CompletionModelConfigDialog
        isOpen={showCompletionDialog}
        onClose={() => setShowCompletionDialog(false)}
      />

      <Modal
        isOpen={showRawPromptModal}
        onClose={() => setShowRawPromptModal(false)}
        title="Raw Prompt Preview"
        size="xl"
      >
        {!selectedStory || !selectedModel ? (
          <p className="text-sm text-gray-500">Select a story and model to preview prompt content.</p>
        ) : (
          <div className="space-y-3">
            {effectiveUseChatCompletion && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                Chat completions mode is enabled. This preview shows the raw <code>/completions</code> prompt format.
              </p>
            )}
            <div className="border border-gray-300 rounded-md bg-gray-50">
              <textarea
                readOnly
                value={rawPromptPreview}
                className="w-full h-[55vh] px-3 py-2 text-xs text-gray-800 font-mono border-0 rounded-md bg-gray-50 focus:ring-0 resize-none"
                spellCheck={false}
              />
            </div>
            <div className="flex justify-between items-center">
              <span className={`text-xs ${copyStatus === 'failed' ? 'text-red-600' : 'text-gray-500'}`}>
                {copyStatus === 'copied' ? 'Copied to clipboard' : copyStatus === 'failed' ? 'Copy failed' : `${rawPromptPreview.length.toLocaleString()} characters`}
              </span>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setShowRawPromptModal(false)}>Close</Button>
                <Button onClick={handleCopyRawPrompt} disabled={!rawPromptPreview}>Copy</Button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
