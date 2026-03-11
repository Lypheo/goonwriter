import type { CompletionModelConfig, UsageInfo } from '../types';

// Conservative max tokens for sentence completion
const SENTENCE_MAX_TOKENS = 80;

// Extract first sentence from text, discard rest
function extractFirstSentence(text: string): string {
  const trimmed = text.trimStart();
  if (!trimmed) return '';

  // Match up to and including the first sentence-ending punctuation followed by a space or end
  const match = trimmed.match(/^(.*?[.!?…])(?:\s|$)/s);
  if (match) {
    return match[1];
  }
  // No sentence end found — return all text (still streaming)
  return trimmed;
}

export interface SentenceCompletionCallbacks {
  onChunk: (fullText: string) => void; // Called with accumulated first-sentence text so far
  onUsage: (usage: UsageInfo) => void;
  onError: (error: string) => void;
  onComplete: (finalText: string) => void;
}

// Stream a sentence completion from one model
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

    // Check if we've reached a sentence boundary
    if (/[.!?…]\s/.test(accumulated) || /[.!?…]$/.test(accumulated.trim())) {
      const trimmed = accumulated.trim();
      const match = trimmed.match(/^(.*?[.!?…])(?:\s|$)/s);
      if (match) {
        return true; // Signal to stop
      }
    }
    return false;
  };

  try {
    if (model.mode === 'instruction') {
      await streamChatSentenceCompletion(model, context, baseUrl, processChunk, callbacks, abortSignal);
    } else {
      await streamRawSentenceCompletion(model, context, baseUrl, processChunk, callbacks, abortSignal);
    }

    const final = extractFirstSentence(accumulated);
    callbacks.onComplete(final);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      const final = extractFirstSentence(accumulated);
      callbacks.onComplete(final);
    } else {
      callbacks.onError(error instanceof Error ? error.message : 'Unknown error');
    }
  }
}

// Instruction mode: /chat/completions
async function streamChatSentenceCompletion(
  model: CompletionModelConfig,
  context: string,
  baseUrl: string,
  processChunk: (text: string) => boolean,
  callbacks: SentenceCompletionCallbacks,
  abortSignal: AbortSignal
): Promise<void> {
  const messages: { role: string; content: string }[] = [];

  if (model.systemMessage.trim()) {
    messages.push({ role: 'system', content: model.systemMessage });
  }
  messages.push({ role: 'user', content: model.prompt + context });

  const body = {
    model: model.modelId,
    messages,
    stream: true,
    stream_options: { include_usage: true },
    max_tokens: SENTENCE_MAX_TOKENS,
    temperature: 0.7,
  };

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${model.token}`,
    },
    body: JSON.stringify(body),
    signal: abortSignal,
  });

  if (!response.ok) {
    const errText = await response.text();
    callbacks.onError(`API error ${response.status}: ${errText}`);
    return;
  }

  await processStream(response, (data) => {
    const content = data.choices?.[0]?.delta?.content || '';
    if (content) {
      return processChunk(content);
    }
    if (data.usage) {
      callbacks.onUsage(data.usage);
    }
    return false;
  });
}

// Raw mode: /completions
async function streamRawSentenceCompletion(
  model: CompletionModelConfig,
  context: string,
  baseUrl: string,
  processChunk: (text: string) => boolean,
  callbacks: SentenceCompletionCallbacks,
  abortSignal: AbortSignal
): Promise<void> {
  const body = {
    model: model.modelId,
    prompt: context,
    stream: true,
    stream_options: { include_usage: true },
    max_tokens: SENTENCE_MAX_TOKENS,
    temperature: 0.7,
  };

  const response = await fetch(`${baseUrl}/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${model.token}`,
    },
    body: JSON.stringify(body),
    signal: abortSignal,
  });

  if (!response.ok) {
    const errText = await response.text();
    callbacks.onError(`API error ${response.status}: ${errText}`);
    return;
  }

  await processStream(response, (data) => {
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

// Generic SSE stream processor
async function processStream(
  response: Response,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onData: (data: any) => boolean // returns true to stop accepting content
): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) return;

  const decoder = new TextDecoder();
  let buffer = '';
  let contentDone = false; // true once we have enough content (sentence found)

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;
      if (!line.startsWith('data: ')) continue;
      const payload = line.slice(6).trim();
      if (payload === '[DONE]') {
        reader.cancel();
        return;
      }

      try {
        const data = JSON.parse(payload);
        // Always check for usage data even after content is done
        if (data.usage) {
          onData(data);
          // Got usage after content was done — we can stop now
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
            // Don't cancel yet — keep reading to capture usage data
          }
        }
      } catch {
        // skip unparsable lines
      }
    }
  }

  // Process remaining buffer
  if (buffer.trim() && buffer.startsWith('data: ')) {
    const payload = buffer.slice(6).trim();
    if (payload !== '[DONE]') {
      try {
        onData(JSON.parse(payload));
      } catch {
        // skip
      }
    }
  }
}
