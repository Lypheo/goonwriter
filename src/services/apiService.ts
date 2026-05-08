const API_BASE = '/api';

interface OpenRouterPricing {
  prompt?: unknown;
  completion?: unknown;
}

interface OpenRouterModel {
  id: string;
  canonical_slug?: string;
  pricing?: OpenRouterPricing;
}

interface OpenRouterModelsResponse {
  data?: OpenRouterModel[];
}

const OPENROUTER_MODELS_CACHE_TTL_MS = 5 * 60 * 1000;
const openRouterModelsCache = new Map<string, { expiresAt: number; data: OpenRouterModel[] }>();
const openRouterModelsInFlight = new Map<string, Promise<OpenRouterModel[]>>();

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

export async function fetchOpenRouterModelPricing(
  token: string,
  modelId: string
): Promise<OpenRouterPricing | null> {
  if (!token || !modelId) return null;

  try {
    const models = await fetchOpenRouterModels(token);
    const targetModel = models.find(
      (model) => model.id.toLowerCase() === modelId.toLowerCase()
    );

    return targetModel?.pricing || null;
  } catch (error) {
    console.error('Failed to fetch OpenRouter model pricing:', error);
    return null;
  }
}
