import type {
  ModelConfig,
  SamplingParams,
  CompletionChunk,
  CompletionRequest,
  ProviderConfig,
  ChatMessage,
  ChatCompletionRequest,
  ChatCompletionChunk,
  CompletionModelConfig,
  UsageInfo,
} from '../types';
import { SPECIAL_TOKENS, DEFAULT_SAMPLING_PARAMS } from '../types';

// Replace placeholder tokens with model-specific tokens
export function replacePlaceholdersWithModelTokens(
  text: string,
  template: ModelConfig['instructionTemplate']
): string {
  return text
    .replaceAll(SPECIAL_TOKENS.START_SYS_PROMPT, template.systemPromptPrefix)
    .replaceAll(SPECIAL_TOKENS.END_SYS_PROMPT, template.systemPromptSuffix)
    .replaceAll(SPECIAL_TOKENS.START_USER, template.userTagPrefix)
    .replaceAll(SPECIAL_TOKENS.END_USER, template.userTagSuffix)
    .replaceAll(SPECIAL_TOKENS.START_AI, template.assistantTagPrefix)
    .replaceAll(SPECIAL_TOKENS.END_AI, template.assistantTagSuffix)
    .replaceAll(SPECIAL_TOKENS.START_THINK, template.thinkTagPrefix || '<think>')
    .replaceAll(SPECIAL_TOKENS.END_THINK, template.thinkTagSuffix || '</think>');
}

// Replace model-specific tokens with placeholder tokens
export function replaceModelTokensWithPlaceholders(
  text: string,
  template: ModelConfig['instructionTemplate']
): string {
  let result = text;
  
  // Only replace non-empty tokens
  if (template.systemPromptPrefix) {
    result = result.replaceAll(template.systemPromptPrefix, SPECIAL_TOKENS.START_SYS_PROMPT);
  }
  if (template.systemPromptSuffix) {
    result = result.replaceAll(template.systemPromptSuffix, SPECIAL_TOKENS.END_SYS_PROMPT);
  }
  if (template.userTagPrefix) {
    result = result.replaceAll(template.userTagPrefix, SPECIAL_TOKENS.START_USER);
  }
  if (template.userTagSuffix) {
    result = result.replaceAll(template.userTagSuffix, SPECIAL_TOKENS.END_USER);
  }
  if (template.assistantTagPrefix) {
    result = result.replaceAll(template.assistantTagPrefix, SPECIAL_TOKENS.START_AI);
  }
  if (template.assistantTagSuffix) {
    result = result.replaceAll(template.assistantTagSuffix, SPECIAL_TOKENS.END_AI);
  }
  if (template.thinkTagPrefix && template.thinkTagPrefix !== '<think>') {
    result = result.replaceAll(template.thinkTagPrefix, SPECIAL_TOKENS.START_THINK);
  }
  if (template.thinkTagSuffix && template.thinkTagSuffix !== '</think>') {
    result = result.replaceAll(template.thinkTagSuffix, SPECIAL_TOKENS.END_THINK);
  }
  
  return result;
}

// Build the request body for the completion API
function buildRequestBody(
  model: ModelConfig,
  prompt: string,
  samplingParams: SamplingParams
): CompletionRequest {
  const body: CompletionRequest = {
    model: model.modelId,
    prompt: replacePlaceholdersWithModelTokens(prompt, model.instructionTemplate),
    stream: true,
  };
  
  // Add sampling params only if they differ from defaults
  if (samplingParams.temperature !== undefined && samplingParams.temperature !== DEFAULT_SAMPLING_PARAMS.temperature) {
    body.temperature = samplingParams.temperature;
  }
  if (samplingParams.top_p !== undefined && samplingParams.top_p !== DEFAULT_SAMPLING_PARAMS.top_p) {
    body.top_p = samplingParams.top_p;
  }
  if (samplingParams.top_k !== undefined && samplingParams.top_k !== DEFAULT_SAMPLING_PARAMS.top_k) {
    body.top_k = samplingParams.top_k;
  }
  if (samplingParams.frequency_penalty !== undefined && samplingParams.frequency_penalty !== DEFAULT_SAMPLING_PARAMS.frequency_penalty) {
    body.frequency_penalty = samplingParams.frequency_penalty;
  }
  if (samplingParams.presence_penalty !== undefined && samplingParams.presence_penalty !== DEFAULT_SAMPLING_PARAMS.presence_penalty) {
    body.presence_penalty = samplingParams.presence_penalty;
  }
  if (samplingParams.repetition_penalty !== undefined && samplingParams.repetition_penalty !== DEFAULT_SAMPLING_PARAMS.repetition_penalty) {
    body.repetition_penalty = samplingParams.repetition_penalty;
  }
  if (samplingParams.min_p !== undefined && samplingParams.min_p !== DEFAULT_SAMPLING_PARAMS.min_p) {
    body.min_p = samplingParams.min_p;
  }
  if (samplingParams.top_a !== undefined && samplingParams.top_a !== DEFAULT_SAMPLING_PARAMS.top_a) {
    body.top_a = samplingParams.top_a;
  }
  if (samplingParams.max_tokens !== undefined) {
    body.max_tokens = samplingParams.max_tokens;
  }
  
  // Add provider config if any relevant fields are set
  const template = model.instructionTemplate;
  const provider: ProviderConfig = {};
  
  if (template.allowedProviders.length > 0) {
    provider.only = template.allowedProviders;
  }
  if (template.bannedProviders.length > 0) {
    provider.ignore = template.bannedProviders;
  }
  if (template.allowedQuantizations.length > 0) {
    provider.quantizations = template.allowedQuantizations;
  }
  if (template.sortOrder) {
    provider.sort = template.sortOrder;
  }
  
  if (Object.keys(provider).length > 0) {
    body.provider = provider;
  }
  
  return body;
}

// Build the request body for the chat completion API
function buildChatRequestBody(
  model: ModelConfig,
  messages: ChatMessage[],
  samplingParams: SamplingParams,
  disableThinking: boolean = false
): ChatCompletionRequest {
  const body: ChatCompletionRequest = {
    model: model.modelId,
    messages,
    stream: true,
  };

  if (disableThinking) {
    body.reasoning = { enabled: false };
  }
  
  // Add sampling params only if they differ from defaults
  if (samplingParams.temperature !== undefined && samplingParams.temperature !== DEFAULT_SAMPLING_PARAMS.temperature) {
    body.temperature = samplingParams.temperature;
  }
  if (samplingParams.top_p !== undefined && samplingParams.top_p !== DEFAULT_SAMPLING_PARAMS.top_p) {
    body.top_p = samplingParams.top_p;
  }
  if (samplingParams.top_k !== undefined && samplingParams.top_k !== DEFAULT_SAMPLING_PARAMS.top_k) {
    body.top_k = samplingParams.top_k;
  }
  if (samplingParams.frequency_penalty !== undefined && samplingParams.frequency_penalty !== DEFAULT_SAMPLING_PARAMS.frequency_penalty) {
    body.frequency_penalty = samplingParams.frequency_penalty;
  }
  if (samplingParams.presence_penalty !== undefined && samplingParams.presence_penalty !== DEFAULT_SAMPLING_PARAMS.presence_penalty) {
    body.presence_penalty = samplingParams.presence_penalty;
  }
  if (samplingParams.repetition_penalty !== undefined && samplingParams.repetition_penalty !== DEFAULT_SAMPLING_PARAMS.repetition_penalty) {
    body.repetition_penalty = samplingParams.repetition_penalty;
  }
  if (samplingParams.min_p !== undefined && samplingParams.min_p !== DEFAULT_SAMPLING_PARAMS.min_p) {
    body.min_p = samplingParams.min_p;
  }
  if (samplingParams.top_a !== undefined && samplingParams.top_a !== DEFAULT_SAMPLING_PARAMS.top_a) {
    body.top_a = samplingParams.top_a;
  }
  if (samplingParams.max_tokens !== undefined) {
    body.max_tokens = samplingParams.max_tokens;
  }
  
  // Add provider config if any relevant fields are set
  const template = model.instructionTemplate;
  const provider: ProviderConfig = {};
  
  if (template.allowedProviders.length > 0) {
    provider.only = template.allowedProviders;
  }
  if (template.bannedProviders.length > 0) {
    provider.ignore = template.bannedProviders;
  }
  if (template.allowedQuantizations.length > 0) {
    provider.quantizations = template.allowedQuantizations;
  }
  if (template.sortOrder) {
    provider.sort = template.sortOrder;
  }
  
  if (Object.keys(provider).length > 0) {
    body.provider = provider;
  }
  
  return body;
}

// Parse a Server-Sent Events line
function parseSSELine(line: string): CompletionChunk | null | 'done' {
  if (!line.startsWith('data: ')) {
    return null;
  }
  
  const data = line.slice(6).trim();
  
  if (data === '[DONE]') {
    return 'done';
  }
  
  try {
    return JSON.parse(data) as CompletionChunk;
  } catch {
    console.error('Failed to parse SSE data:', data);
    return null;
  }
}

export interface GenerationCallbacks {
  onChunk: (text: string, chunk: CompletionChunk) => void;
  onMetadata: (chunk: CompletionChunk) => void;
  onError: (error: string) => void;
  onComplete: () => void;
}

export interface StreamOptions {
  autoThinkTags?: boolean;
  disableThinking?: boolean;
}

export interface SentenceCompletionResult {
  text: string;
  usage?: UsageInfo;
}

export interface SentenceCompletionCallbacks {
  onChunk: (fullText: string) => void;
  onUsage: (usage: UsageInfo) => void;
  onError: (error: string) => void;
  onComplete: (finalText: string) => void;
}

const SENTENCE_MAX_TOKENS = 80;

function extractFirstSentence(text: string): string {
  const trimmed = text.trimStart();
  if (!trimmed) return '';

  const match = trimmed.match(/^(.*?[.!?…])(?:\s|$)/s);
  if (match) return match[1];

  return trimmed;
}

async function processSentenceStream(
  response: Response,
  onData: (data: any) => boolean
): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) return;

  const decoder = new TextDecoder();
  let buffer = '';
  let contentDone = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim() || !line.startsWith('data: ')) continue;

      const payload = line.slice(6).trim();
      if (payload === '[DONE]') {
        reader.cancel();
        return;
      }

      try {
        const data = JSON.parse(payload);

        if (data.usage) {
          onData(data);
          if (contentDone) {
            reader.cancel();
            return;
          }
          continue;
        }

        if (!contentDone) {
          const shouldStop = onData(data);
          if (shouldStop) {
            contentDone = true;
          }
        }
      } catch {
        continue;
      }
    }
  }
}

export async function streamSentenceCompletion(
  model: CompletionModelConfig,
  context: string,
  callbacks: SentenceCompletionCallbacks,
  abortSignal: AbortSignal
): Promise<void> {
  const baseUrl = model.baseUrl.replace(/\/$/, '');
  let accumulated = '';

  const processChunk = (text: string): boolean => {
    accumulated += text;
    const sentence = extractFirstSentence(accumulated);
    callbacks.onChunk(sentence);

    return /[.!?…]\s/.test(accumulated) || /[.!?…]$/.test(accumulated.trim());
  };

  try {
    if (model.mode === 'instruction') {
      const messages: ChatMessage[] = [];
      if (model.systemMessage.trim()) {
        messages.push({ role: 'system', content: model.systemMessage });
      }
      messages.push({ role: 'user', content: `${model.prompt || ''}${context}` });

      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${model.token}`,
        },
        body: JSON.stringify({
          model: model.modelId,
          messages,
          stream: true,
          stream_options: { include_usage: true },
          max_tokens: SENTENCE_MAX_TOKENS,
          temperature: 0.7,
        }),
        signal: abortSignal,
      });

      if (!response.ok) {
        const errText = await response.text();
        callbacks.onError(`API error ${response.status}: ${errText}`);
        return;
      }

      await processSentenceStream(response, (data) => {
        const content = data.choices?.[0]?.delta?.content || '';
        if (content) {
          return processChunk(content);
        }
        if (data.usage) {
          callbacks.onUsage(data.usage);
        }
        return false;
      });
    } else {
      const response = await fetch(`${baseUrl}/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${model.token}`,
        },
        body: JSON.stringify({
          model: model.modelId,
          prompt: context,
          stream: true,
          stream_options: { include_usage: true },
          max_tokens: SENTENCE_MAX_TOKENS,
          temperature: 0.7,
        }),
        signal: abortSignal,
      });

      if (!response.ok) {
        const errText = await response.text();
        callbacks.onError(`API error ${response.status}: ${errText}`);
        return;
      }

      await processSentenceStream(response, (data) => {
        const text = data.choices?.[0]?.text || '';
        if (text) {
          return processChunk(text);
        }
        if (data.usage) {
          callbacks.onUsage(data.usage);
        }
        return false;
      });
    }

    callbacks.onComplete(extractFirstSentence(accumulated));
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      callbacks.onComplete(extractFirstSentence(accumulated));
    } else {
      callbacks.onError(error instanceof Error ? error.message : 'Unknown error');
    }
  }
}

export async function requestSentenceCompletion(
  model: CompletionModelConfig,
  context: string,
  abortSignal?: AbortSignal
): Promise<SentenceCompletionResult> {
  if (!model.baseUrl.trim() || !model.modelId.trim()) {
    return { text: '' };
  }

  if (model.mode === 'instruction') {
    const url = `${model.baseUrl.replace(/\/$/, '')}/chat/completions`;
    const messages: ChatMessage[] = [];

    if (model.systemMessage.trim()) {
      messages.push({ role: 'system', content: model.systemMessage });
    }

    messages.push({
      role: 'user',
      content: `${model.prompt || ''}${context}`,
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${model.token}`,
      },
      body: JSON.stringify({
        model: model.modelId,
        messages,
        stream: false,
      }),
      signal: abortSignal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Completion API error ${response.status}: ${errorText}`);
    }

    const data = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: UsageInfo;
    };

    return {
      text: data.choices?.[0]?.message?.content || '',
      usage: data.usage,
    };
  }

  const url = `${model.baseUrl.replace(/\/$/, '')}/completions`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${model.token}`,
    },
    body: JSON.stringify({
      model: model.modelId,
      prompt: context,
      stream: false,
    }),
    signal: abortSignal,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Completion API error ${response.status}: ${errorText}`);
  }

  const data = await response.json() as {
    choices?: Array<{ text?: string }>;
    usage?: UsageInfo;
  };

  return {
    text: data.choices?.[0]?.text || '',
    usage: data.usage,
  };
}

// Stream completion from the API
export async function streamCompletion(
  model: ModelConfig,
  prompt: string,
  samplingParams: SamplingParams,
  callbacks: GenerationCallbacks,
  abortSignal: AbortSignal,
  options: StreamOptions = {}
): Promise<void> {
  const url = `${model.baseUrl.replace(/\/$/, '')}/completions`;
  const body = buildRequestBody(model, prompt, samplingParams);
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${model.token}`,
      },
      body: JSON.stringify(body),
      signal: abortSignal,
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      callbacks.onError(`API error ${response.status}: ${errorText}`);
      return;
    }
    
    const reader = response.body?.getReader();
    if (!reader) {
      callbacks.onError('No response body');
      return;
    }
    
    const decoder = new TextDecoder();
    let buffer = '';
    let isReasoning = false;
    let hasOpenedThink = false;
    let hasClosedThink = false;
    
    while (true) {
      const { done, value } = await reader.read();
      
      if (done) {
        break;
      }
      
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        if (!line.trim()) continue;
        
        const parsed = parseSSELine(line);
        
        if (parsed === 'done') {
          callbacks.onComplete();
          return;
        }
        
        if (parsed) {
          // Update metadata
          callbacks.onMetadata(parsed);
          
          // Extract text (can be in 'text' and/or 'reasoning' property)
          const reasoning = (parsed.choices?.[0]?.reasoning as string) || '';
          const textContent = parsed.choices?.[0]?.text || '';
          
          // Track reasoning state and auto-insert opening think tag if needed
          if (reasoning && !isReasoning) {
            isReasoning = true;
          }
          
          // Build output text
          let rawText = '';
          
          // Auto-insert opening think tag when reasoning starts
          if (reasoning && options.autoThinkTags && !hasOpenedThink) {
            rawText += SPECIAL_TOKENS.START_THINK;
            hasOpenedThink = true;
          }
          
          rawText += reasoning;
          
          // If we were reasoning and now have text content, prepend closing think tag
          if (textContent) {
            if (options.autoThinkTags && isReasoning && !hasClosedThink) {
              rawText += SPECIAL_TOKENS.END_THINK;
              hasClosedThink = true;
            }
            rawText += textContent;
          }
          
          if (rawText) {
            const text = replaceModelTokensWithPlaceholders(
              rawText,
              model.instructionTemplate
            );
            callbacks.onChunk(text, parsed);
          }
        }
      }
    }
    
    // Process any remaining buffer
    if (buffer.trim()) {
      const parsed = parseSSELine(buffer);
      if (parsed && parsed !== 'done') {
        callbacks.onMetadata(parsed);
        const reasoning = (parsed.choices?.[0]?.reasoning as string) || '';
        const textContent = parsed.choices?.[0]?.text || '';
        
        // Track reasoning state and auto-insert opening think tag if needed
        if (reasoning && !isReasoning) {
          isReasoning = true;
        }
        
        // Build output text
        let rawText = '';
        
        // Auto-insert opening think tag when reasoning starts
        if (reasoning && options.autoThinkTags && !hasOpenedThink) {
          rawText += SPECIAL_TOKENS.START_THINK;
          hasOpenedThink = true;
        }
        
        rawText += reasoning;
        
        // If we were reasoning and now have text content, prepend closing think tag
        if (textContent) {
          if (options.autoThinkTags && isReasoning && !hasClosedThink) {
            rawText += SPECIAL_TOKENS.END_THINK;
            hasClosedThink = true;
          }
          rawText += textContent;
        }
        
        if (rawText) {
          const text = replaceModelTokensWithPlaceholders(
            rawText,
            model.instructionTemplate
          );
          callbacks.onChunk(text, parsed);
        }
      }
    }
    
    callbacks.onComplete();
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        callbacks.onComplete();
      } else {
        callbacks.onError(error.message);
      }
    } else {
      callbacks.onError('Unknown error occurred');
    }
  }
}

// Parse a chat completion SSE line
function parseChatSSELine(line: string): ChatCompletionChunk | null | 'done' {
  if (!line.startsWith('data: ')) {
    return null;
  }
  
  const data = line.slice(6).trim();
  
  if (data === '[DONE]') {
    return 'done';
  }
  
  try {
    return JSON.parse(data) as ChatCompletionChunk;
  } catch {
    console.error('Failed to parse chat SSE data:', data);
    return null;
  }
}

// Convert ChatCompletionChunk to CompletionChunk for compatibility
function chatChunkToCompletionChunk(chunk: ChatCompletionChunk): CompletionChunk {
  return {
    id: chunk.id,
    provider: chunk.provider,
    model: chunk.model,
    object: chunk.object,
    created: chunk.created,
    choices: chunk.choices.map(c => ({
      index: c.index,
      finish_reason: c.finish_reason,
      native_finish_reason: c.native_finish_reason,
      logprobs: c.logprobs,
      reasoning: c.delta.reasoning,
      reasoning_details: c.delta.reasoning_details || [],
      text: c.delta.content || '',
    })),
    usage: chunk.usage,
  };
}

// Stream chat completion from the API
export async function streamChatCompletion(
  model: ModelConfig,
  messages: ChatMessage[],
  samplingParams: SamplingParams,
  callbacks: GenerationCallbacks,
  abortSignal: AbortSignal,
  options: StreamOptions = {}
): Promise<void> {
  const url = `${model.baseUrl.replace(/\/$/, '')}/chat/completions`;
  const body = buildChatRequestBody(model, messages, samplingParams, !!options.disableThinking);
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${model.token}`,
      },
      body: JSON.stringify(body),
      signal: abortSignal,
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      callbacks.onError(`API error ${response.status}: ${errorText}`);
      return;
    }
    
    const reader = response.body?.getReader();
    if (!reader) {
      callbacks.onError('No response body');
      return;
    }
    
    const decoder = new TextDecoder();
    let buffer = '';
    let isReasoning = false;
    let hasOpenedThink = false;
    let hasClosedThink = false;
    
    while (true) {
      const { done, value } = await reader.read();
      
      if (done) {
        break;
      }
      
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        if (!line.trim()) continue;
        
        const parsed = parseChatSSELine(line);
        
        if (parsed === 'done') {
          callbacks.onComplete();
          return;
        }
        
        if (parsed) {
          // Convert to CompletionChunk for compatibility with callbacks
          const compatChunk = chatChunkToCompletionChunk(parsed);
          
          // Update metadata
          callbacks.onMetadata(compatChunk);
          
          // Extract text from delta
          const reasoning = parsed.choices?.[0]?.delta?.reasoning || '';
          const textContent = parsed.choices?.[0]?.delta?.content || '';
          
          // Track reasoning state and auto-insert opening think tag if needed
          if (reasoning && !isReasoning) {
            isReasoning = true;
          }
          
          // Build output text
          let rawText = '';
          
          // Auto-insert opening think tag when reasoning starts
          if (reasoning && options.autoThinkTags && !hasOpenedThink) {
            rawText += SPECIAL_TOKENS.START_THINK;
            hasOpenedThink = true;
          }
          
          rawText += reasoning;
          
          // If we were reasoning and now have text content, prepend closing think tag
          if (textContent) {
            if (options.autoThinkTags && isReasoning && !hasClosedThink) {
              rawText += SPECIAL_TOKENS.END_THINK;
              hasClosedThink = true;
            }
            rawText += textContent;
          }
          
          if (rawText) {
            const text = replaceModelTokensWithPlaceholders(
              rawText,
              model.instructionTemplate
            );
            callbacks.onChunk(text, compatChunk);
          }
        }
      }
    }
    
    // Process any remaining buffer
    if (buffer.trim()) {
      const parsed = parseChatSSELine(buffer);
      if (parsed && parsed !== 'done') {
        const compatChunk = chatChunkToCompletionChunk(parsed);
        callbacks.onMetadata(compatChunk);
        
        const reasoning = parsed.choices?.[0]?.delta?.reasoning || '';
        const textContent = parsed.choices?.[0]?.delta?.content || '';
        
        // Track reasoning state and auto-insert opening think tag if needed
        if (reasoning && !isReasoning) {
          isReasoning = true;
        }
        
        // Build output text
        let rawText = '';
        
        // Auto-insert opening think tag when reasoning starts
        if (reasoning && options.autoThinkTags && !hasOpenedThink) {
          rawText += SPECIAL_TOKENS.START_THINK;
          hasOpenedThink = true;
        }
        
        rawText += reasoning;
        
        // If we were reasoning and now have text content, prepend closing think tag
        if (textContent) {
          if (options.autoThinkTags && isReasoning && !hasClosedThink) {
            rawText += SPECIAL_TOKENS.END_THINK;
            hasClosedThink = true;
          }
          rawText += textContent;
        }
        
        if (rawText) {
          const text = replaceModelTokensWithPlaceholders(
            rawText,
            model.instructionTemplate
          );
          callbacks.onChunk(text, compatChunk);
        }
      }
    }
    
    callbacks.onComplete();
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        callbacks.onComplete();
      } else {
        callbacks.onError(error.message);
      }
    } else {
      callbacks.onError('Unknown error occurred');
    }
  }
}
