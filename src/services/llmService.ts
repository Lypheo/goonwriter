import type {
  ModelConfig,
  SamplingParams,
  CompletionChunk,
  CompletionRequest,
  ProviderConfig,
  ChatMessage,
  ChatCompletionRequest,
  ChatCompletionChunk,
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

// Parse text into chat messages format
// Returns { messages, error } where error is set if format is invalid
export function parseTextToChatMessages(text: string): { messages: ChatMessage[] | null; error: string | null } {
  const messages: ChatMessage[] = [];
  let remaining = text;
  
  // Check for system prompt at the start (optional)
  const sysStartIdx = remaining.indexOf(SPECIAL_TOKENS.START_SYS_PROMPT);
  const sysEndIdx = remaining.indexOf(SPECIAL_TOKENS.END_SYS_PROMPT);
  
  if (sysStartIdx !== -1) {
    // System prompt must be at the very start (allowing leading whitespace)
    const beforeSys = remaining.substring(0, sysStartIdx).trim();
    if (beforeSys.length > 0) {
      return { messages: null, error: 'System prompt must be at the beginning of the text' };
    }
    
    if (sysEndIdx === -1) {
      return { messages: null, error: 'System prompt is not closed (missing <<end_sys_prompt>>)' };
    }
    
    if (sysEndIdx < sysStartIdx) {
      return { messages: null, error: 'Invalid system prompt format' };
    }
    
    const sysContent = remaining.substring(
      sysStartIdx + SPECIAL_TOKENS.START_SYS_PROMPT.length,
      sysEndIdx
    ).trim();
    
    if (sysContent.length > 0) {
      messages.push({ role: 'system', content: sysContent });
    }
    
    remaining = remaining.substring(sysEndIdx + SPECIAL_TOKENS.END_SYS_PROMPT.length);
  }
  
  // Check for any additional system prompts (not allowed)
  if (remaining.indexOf(SPECIAL_TOKENS.START_SYS_PROMPT) !== -1) {
    return { messages: null, error: 'Only one system prompt is allowed and it must be at the beginning' };
  }
  
  // Now parse alternating user/assistant blocks
  let expectingUser = true; // Start expecting user block
  
  while (remaining.length > 0) {
    const userStartIdx = remaining.indexOf(SPECIAL_TOKENS.START_USER);
    const aiStartIdx = remaining.indexOf(SPECIAL_TOKENS.START_AI);
    
    // Check if there's content before any block
    const firstBlockIdx = Math.min(
      userStartIdx === -1 ? Infinity : userStartIdx,
      aiStartIdx === -1 ? Infinity : aiStartIdx
    );
    
    if (firstBlockIdx === Infinity) {
      // No more blocks, check if remaining content is meaningful
      const trimmed = remaining.trim();
      if (trimmed.length > 0) {
        return { messages: null, error: 'Text outside of user/assistant blocks is not allowed' };
      }
      break;
    }
    
    const beforeBlock = remaining.substring(0, firstBlockIdx).trim();
    if (beforeBlock.length > 0) {
      return { messages: null, error: 'Text outside of user/assistant blocks is not allowed' };
    }
    
    if (expectingUser) {
      // Expecting user block
      if (userStartIdx === -1 || (aiStartIdx !== -1 && aiStartIdx < userStartIdx)) {
        return { messages: null, error: 'Expected user block but found assistant block. Messages must alternate user/assistant.' };
      }
      
      const userEndIdx = remaining.indexOf(SPECIAL_TOKENS.END_USER);
      if (userEndIdx === -1 || userEndIdx < userStartIdx) {
        return { messages: null, error: 'User block is not closed (missing <<end_user>>)' };
      }
      
      const userContent = remaining.substring(
        userStartIdx + SPECIAL_TOKENS.START_USER.length,
        userEndIdx
      ).trim();
      
      messages.push({ role: 'user', content: userContent });
      remaining = remaining.substring(userEndIdx + SPECIAL_TOKENS.END_USER.length);
      expectingUser = false;
      
    } else {
      // Expecting assistant block
      if (aiStartIdx === -1 || (userStartIdx !== -1 && userStartIdx < aiStartIdx)) {
        return { messages: null, error: 'Expected assistant block but found user block. Messages must alternate user/assistant.' };
      }
      
      const aiEndIdx = remaining.indexOf(SPECIAL_TOKENS.END_AI);
      
      // Assistant block doesn't need to be closed if it's the last block
      const nextUserIdx = remaining.indexOf(SPECIAL_TOKENS.START_USER, aiStartIdx + 1);
      
      if (aiEndIdx === -1 || aiEndIdx < aiStartIdx) {
        // No closing tag - this is only valid if it's the last block
        if (nextUserIdx !== -1) {
          return { messages: null, error: 'Assistant block is not closed (missing <<end_ai>>)' };
        }
        
        // Last block, content goes to the end
        const aiContent = remaining.substring(
          aiStartIdx + SPECIAL_TOKENS.START_AI.length
        ).trim();
        
        messages.push({ role: 'assistant', content: aiContent });
        break;
      } else {
        // Has closing tag
        const aiContent = remaining.substring(
          aiStartIdx + SPECIAL_TOKENS.START_AI.length,
          aiEndIdx
        ).trim();
        
        messages.push({ role: 'assistant', content: aiContent });
        remaining = remaining.substring(aiEndIdx + SPECIAL_TOKENS.END_AI.length);
        expectingUser = true;
      }
    }
  }
  
  // Validate we have at least one user message
  if (messages.filter(m => m.role === 'user').length === 0) {
    return { messages: null, error: 'At least one user message is required' };
  }
  
  return { messages, error: null };
}

// Build the request body for the chat completion API
function buildChatRequestBody(
  model: ModelConfig,
  messages: ChatMessage[],
  samplingParams: SamplingParams
): ChatCompletionRequest {
  const body: ChatCompletionRequest = {
    model: model.modelId,
    messages,
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

export interface StreamOptions {
  autoThinkTags?: boolean;
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
  const body = buildChatRequestBody(model, messages, samplingParams);
  
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
