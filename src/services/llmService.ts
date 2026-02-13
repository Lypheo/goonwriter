import type {
  ModelConfig,
  SamplingParams,
  CompletionChunk,
  CompletionRequest,
  ProviderConfig,
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
    .replaceAll(SPECIAL_TOKENS.END_AI, template.assistantTagSuffix);
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

// Stream completion from the API
export async function streamCompletion(
  model: ModelConfig,
  prompt: string,
  samplingParams: SamplingParams,
  callbacks: GenerationCallbacks,
  abortSignal: AbortSignal
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
          
          // Extract and send text
          if (parsed.choices?.[0]?.text) {
            const text = replaceModelTokensWithPlaceholders(
              parsed.choices[0].text,
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
        if (parsed.choices?.[0]?.text) {
          const text = replaceModelTokensWithPlaceholders(
            parsed.choices[0].text,
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
