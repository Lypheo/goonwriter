// Core data types for GoonWriter

export interface Group {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

export interface Collection {
  id: string;
  groupId: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

export interface Story {
  id: string;
  collectionId: string;
  name: string;
  content: string; // Plain text content (for display/export)
  htmlContent: string; // HTML with authorship marks (source of truth)
  totalCost: number; // Accumulated generation cost in USD
  totalTokens: number; // Accumulated token usage
  createdAt: number;
  updatedAt: number;
}

// Legacy interface - kept for migration
export interface AuthorshipSpan {
  start: number; // Start character index (inclusive)
  end: number;   // End character index (exclusive)
  author: 'user' | 'ai';
  modelId?: string; // Only set when author is 'ai'
}

// Model configuration
export interface ModelConfig {
  id: string;
  name: string;
  baseUrl: string;
  token: string;
  modelId: string;
  instructionTemplate: InstructionTemplate;
  createdAt: number;
  updatedAt: number;
}

export interface InstructionTemplate {
  systemPromptPrefix: string;
  systemPromptSuffix: string;
  userTagPrefix: string;
  userTagSuffix: string;
  assistantTagPrefix: string;
  assistantTagSuffix: string;
  thinkTagPrefix: string;
  thinkTagSuffix: string;
  allowedProviders: string[];
  bannedProviders: string[];
  allowedQuantizations: string[];
  sortOrder: 'price' | 'throughput' | 'latency' | null;
}

// Sampling parameters
export interface SamplingParams {
  temperature?: number;      // 0.0 to 2.0, default 1.0
  top_p?: number;           // 0.0 to 1.0, default 1.0
  top_k?: number;           // 0 or above, default 0
  frequency_penalty?: number; // -2.0 to 2.0, default 0.0
  presence_penalty?: number;  // -2.0 to 2.0, default 0.0
  repetition_penalty?: number; // 0.0 to 2.0, default 1.0
  min_p?: number;           // 0.0 to 1.0, default 0.0
  top_a?: number;           // 0.0 to 1.0, default 0.0
  max_tokens?: number;      // Max tokens to generate
}

export const DEFAULT_SAMPLING_PARAMS: Required<SamplingParams> = {
  temperature: 1.0,
  top_p: 1.0,
  top_k: 0,
  frequency_penalty: 0.0,
  presence_penalty: 0.0,
  repetition_penalty: 1.0,
  min_p: 0.0,
  top_a: 0.0,
  max_tokens: 256,
};

// API request/response types
export interface CompletionRequest {
  model: string;
  prompt: string;
  stream: true;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  repetition_penalty?: number;
  min_p?: number;
  top_a?: number;
  max_tokens?: number;
  provider?: ProviderConfig;
}

export interface ProviderConfig {
  only?: string[];
  ignore?: string[];
  quantizations?: string[];
  sort?: 'price' | 'throughput' | 'latency';
}

// Chat completion types
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  stream: true;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  repetition_penalty?: number;
  min_p?: number;
  top_a?: number;
  max_tokens?: number;
  provider?: ProviderConfig;
}

export interface ChatCompletionChunk {
  id: string;
  provider: string;
  model: string;
  object: string;
  created: number;
  choices: ChatCompletionChoice[];
  usage?: UsageInfo;
}

export interface ChatCompletionChoice {
  index: number;
  delta: {
    role?: string;
    content?: string;
    reasoning?: string | null;
    reasoning_details?: unknown[];
  };
  finish_reason: string | null;
  native_finish_reason: string | null;
  logprobs: unknown;
}

export interface CompletionChunk {
  id: string;
  provider: string;
  model: string;
  object: string;
  created: number;
  choices: CompletionChoice[];
  usage?: UsageInfo;
}

export interface CompletionChoice {
  index: number;
  finish_reason: string | null;
  native_finish_reason: string | null;
  logprobs: unknown;
  reasoning: unknown;
  reasoning_details: unknown[];
  text: string;
}

export interface UsageInfo {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost: number;
  is_byok?: boolean;
  prompt_tokens_details?: {
    cached_tokens: number;
    audio_tokens: number;
  };
  cost_details?: {
    upstream_inference_cost: number;
    upstream_inference_prompt_cost: number;
    upstream_inference_completions_cost: number;
  };
  completion_tokens_details?: {
    reasoning_tokens: number;
    audio_tokens: number;
  };
}

export interface ResponseMetadata {
  id: string;
  provider: string;
  model: string;
  created: number;
  finishReason: string | null;
  nativeFinishReason: string | null;
  usage: UsageInfo | null;
  error: string | null;
  wordsPerSecond: number;
  generationStartTime: number;
  generationEndTime: number | null;
}

// Special tokens for section markers
export const SPECIAL_TOKENS = {
  START_SYS_PROMPT: '<<start_sys_prompt>>',
  END_SYS_PROMPT: '<<end_sys_prompt>>',
  START_USER: '<<start_user>>',
  END_USER: '<<end_user>>',
  START_AI: '<<start_ai>>',
  END_AI: '<<end_ai>>',
  START_THINK: '<think>',
  END_THINK: '</think>',
} as const;

export type SectionType = 'system' | 'user' | 'ai' | 'default';

// Sentence completion model configuration
export interface CompletionModelConfig {
  id: string;
  name: string;
  baseUrl: string;
  token: string;
  modelId: string;
  enabled: boolean; // Whether this model is active for sentence completion
  mode: 'instruction' | 'raw'; // instruction = chat completion, raw = text completion
  systemMessage: string; // System message for instruction mode
  prompt: string; // User prompt template (prepended to context) for instruction mode
  contextLength: number; // Number of chars of context to send (default 1000)
  totalCost: number; // Accumulated completion cost in USD
  totalTokens: number; // Accumulated token usage
  createdAt: number;
  updatedAt: number;
}

// Sentence completion settings (persisted)
export interface CompletionSettings {
  models: CompletionModelConfig[];
}
