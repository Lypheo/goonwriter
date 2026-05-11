const API_BASE = '/api';

interface OpenRouterPricing {
  prompt?: unknown;
  completion?: unknown;
}

interface OpenRouterEndpointPricing {
  prompt?: string | null;
  completion?: string | null;
}

interface OpenRouterPercentiles {
  p50: number;
  p75: number;
  p90: number;
  p99: number;
}

export interface OpenRouterProviderInfo {
  provider_name?: string;
  pricing?: { prompt?: number | null; completion?: number | null };
  quantization?: string | null;
  latency_last_30m?: OpenRouterPercentiles | null;
  throughput_last_30m?: OpenRouterPercentiles | null;
}

interface OpenRouterEndpoint {
  provider_name: string;
  pricing: OpenRouterEndpointPricing;
  quantization?: string | null;
  latency_last_30m?: OpenRouterPercentiles | null;
  throughput_last_30m?: OpenRouterPercentiles | null;
}

interface OpenRouterEndpointsResponse {
  data?: {
    endpoints?: OpenRouterEndpoint[];
  };
}

interface OpenRouterModel {
  id: string;
  canonical_slug?: string;
  pricing?: OpenRouterPricing;
  providers?: OpenRouterProviderInfo[];
}

interface OpenRouterModelsResponse {
  data?: OpenRouterModel[];
}

const OPENROUTER_MODELS_CACHE_TTL_MS = 5 * 60 * 1000;
const openRouterModelsCache = new Map<string, { expiresAt: number; data: OpenRouterModel[] }>();
const openRouterModelsInFlight = new Map<string, Promise<OpenRouterModel[]>>();

const OPENROUTER_ENDPOINTS_CACHE_TTL_MS = 5 * 60 * 1000;
const openRouterEndpointsCache = new Map<string, { expiresAt: number; data: OpenRouterEndpoint[] }>();
const openRouterEndpointsInFlight = new Map<string, Promise<OpenRouterEndpoint[]>>();

async function fetchOpenRouterModels(token: string): Promise<OpenRouterModel[]> {
  const cacheKey = token.trim();
  const now = Date.now();
  const cached = openRouterModelsCache.get(cacheKey);

  if (cached && cached.expiresAt > now) {
    return cached.data;
  }

  const existingRequest = openRouterModelsInFlight.get(cacheKey);
  if (existingRequest) {
    return existingRequest;
  }

  const request = (async () => {
    const response = await fetch('https://openrouter.ai/api/v1/models', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }

    const payload = (await response.json()) as OpenRouterModelsResponse;
    const models = payload.data || [];

    openRouterModelsCache.set(cacheKey, {
      data: models,
      expiresAt: Date.now() + OPENROUTER_MODELS_CACHE_TTL_MS,
    });

    return models;
  })();

  openRouterModelsInFlight.set(cacheKey, request);

  try {
    return await request;
  } finally {
    openRouterModelsInFlight.delete(cacheKey);
  }
}

function parseModelId(modelId: string): { author: string; slug: string } | null {
  const normalized = modelId.trim();
  const parts = normalized.split('/').filter((part) => part.length > 0);
  if (parts.length < 2) return null;
  return { author: parts[0], slug: parts.slice(1).join('/') };
}

async function fetchOpenRouterEndpoints(token: string, modelId: string): Promise<OpenRouterEndpoint[]> {
  const parsed = parseModelId(modelId);
  if (!parsed) return [];

  const cacheKey = `${token.trim()}::${parsed.author}/${parsed.slug}`;
  const now = Date.now();
  const cached = openRouterEndpointsCache.get(cacheKey);

  if (cached && cached.expiresAt > now) {
    return cached.data;
  }

  const existingRequest = openRouterEndpointsInFlight.get(cacheKey);
  if (existingRequest) {
    return existingRequest;
  }

  const request = (async () => {
    const response = await fetch(`https://openrouter.ai/api/v1/models/${parsed.author}/${parsed.slug}/endpoints`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }

    const payload = (await response.json()) as OpenRouterEndpointsResponse;
    const endpoints = payload.data?.endpoints || [];

    openRouterEndpointsCache.set(cacheKey, {
      data: endpoints,
      expiresAt: Date.now() + OPENROUTER_ENDPOINTS_CACHE_TTL_MS,
    });

    return endpoints;
  })();

  openRouterEndpointsInFlight.set(cacheKey, request);

  try {
    return await request;
  } finally {
    openRouterEndpointsInFlight.delete(cacheKey);
  }
}

export async function fetchData<T>(type: string): Promise<T | null> {
  try {
    const response = await fetch(`${API_BASE}/${type}`);
    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error(`Failed to fetch ${type}:`, error);
    return null;
  }
}

export async function saveData<T>(type: string, data: T): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/${type}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }
    return true;
  } catch (error) {
    console.error(`Failed to save ${type}:`, error);
    return false;
  }
}

export async function saveStory(
  story: { id: string; updatedAt?: number; [key: string]: unknown }
): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/stories/${story.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(story),
    });

    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }

    return true;
  } catch (error) {
    console.error('Failed to save story:', error);
    return false;
  }
}

export async function deleteStory(id: string): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/stories/${id}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }
    return true;
  } catch (error) {
    console.error('Failed to delete story:', error);
    return false;
  }
}

export async function checkServerHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/health`);
    return response.ok;
  } catch {
    return false;
  }
}

export async function fetchOpenRouterModelInfo(
  token: string,
  modelId: string
): Promise<{ pricing: OpenRouterPricing | null; providers: OpenRouterProviderInfo[] } | null> {
  if (!token || !modelId) return null;

  try {
    const models = await fetchOpenRouterModels(token);
    const targetModel = models.find(
      (model) => model.id.toLowerCase() === modelId.toLowerCase()
    );
    if (!targetModel) return null;

    const endpoints = await fetchOpenRouterEndpoints(token, modelId);
    const providers = endpoints.map((endpoint) => ({
      provider_name: endpoint.provider_name,
      quantization: endpoint.quantization ?? null,
      latency_last_30m: endpoint.latency_last_30m ?? null,
      throughput_last_30m: endpoint.throughput_last_30m ?? null,
      pricing: {
        prompt: endpoint.pricing?.prompt ? Number(endpoint.pricing.prompt) : null,
        completion: endpoint.pricing?.completion ? Number(endpoint.pricing.completion) : null,
      },
    }));

    return {
      pricing: targetModel.pricing || null,
      providers,
    };
  } catch (error) {
    console.error('Failed to fetch OpenRouter model info:', error);
    return null;
  }
}
