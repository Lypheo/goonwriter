const API_BASE = 'http://localhost:3001/api';

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

export async function fetchStory(id: string) {
  try {
    const response = await fetch(`${API_BASE}/stories/${id}`);
    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Failed to fetch story:', error);
    return null;
  }
}

export async function saveStory(story: { id: string; [key: string]: unknown }): Promise<boolean> {
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

export async function checkServerHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/health`);
    return response.ok;
  } catch {
    return false;
  }
}
