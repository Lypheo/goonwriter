import express from 'express';
import cors from 'cors';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3001;

// Data directory
const DATA_DIR = path.join(__dirname, 'data');

// Serialize writes per file to avoid concurrent truncation/corruption.
const writeLocks = new Map();

// Ensure data directory exists
async function ensureDataDir() {
  try {
    await fs.access(DATA_DIR);
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }
}

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// File paths
const getFilePath = (type) => path.join(DATA_DIR, `${type}.json`);

const ALLOWED_TYPES = new Set([
  'groups',
  'collections',
  'stories',
  'models',
  'completionModels',
  'settings',
  'appState',
]);

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validatePayload(type, payload) {
  switch (type) {
    case 'groups':
    case 'collections':
    case 'stories':
      return Array.isArray(payload);
    case 'completionModels':
      return isPlainObject(payload) && Array.isArray(payload.models);
    case 'settings':
      return isPlainObject(payload) && isPlainObject(payload.samplingParams);
    case 'appState':
      return isPlainObject(payload);
    case 'models':
      return Array.isArray(payload);
    default:
      return false;
  }
}

// Generic read function
async function readData(type) {
  try {
    const filePath = getFilePath(type);
    const data = await fs.readFile(filePath, 'utf-8');
    try {
      return JSON.parse(data);
    } catch (parseError) {
      console.error(`Invalid JSON in ${filePath}:`, parseError);
      return null;
    }
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

// Generic write function
async function writeData(type, data) {
  await ensureDataDir();
  const filePath = getFilePath(type);
  const json = JSON.stringify(data, null, 2);

  try {
    await fs.access(filePath);
    const backupPath = `${filePath}.bak-${Date.now()}`;
    await fs.copyFile(filePath, backupPath);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error(`Failed to backup ${filePath}:`, error);
    }
  }

  const lastWrite = writeLocks.get(filePath) || Promise.resolve();
  const nextWrite = lastWrite.then(async () => {
    const tempPath = `${filePath}.tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await fs.writeFile(tempPath, json, 'utf-8');
    try {
      await fs.rename(tempPath, filePath);
    } catch (error) {
      if (error.code === 'EEXIST' || error.code === 'EPERM') {
        await fs.unlink(filePath).catch(() => undefined);
        await fs.rename(tempPath, filePath);
      } else {
        await fs.unlink(tempPath).catch(() => undefined);
        throw error;
      }
    }
  });

  writeLocks.set(filePath, nextWrite);
  try {
    await nextWrite;
  } finally {
    if (writeLocks.get(filePath) === nextWrite) {
      writeLocks.delete(filePath);
    }
  }
}

// Routes


// Save all data of a type
app.put('/api/:type', async (req, res) => {
  try {
    const { type } = req.params;
    if (!ALLOWED_TYPES.has(type)) {
      return res.status(400).json({ error: 'Unsupported data type' });
    }
    if (type === 'stories') {
      return res.status(405).json({ error: 'Bulk story writes are disabled. Use /api/stories/:id.' });
    }
    if (!validatePayload(type, req.body)) {
      return res.status(400).json({ error: 'Invalid payload shape' });
    }
    await writeData(type, req.body);
    res.json({ success: true });
  } catch (error) {
    console.error(`Error writing ${req.params.type}:`, error);
    res.status(500).json({ error: error.message });
  }
});

// Get a specific story by ID (for large story content)
app.get('/api/stories/:id', async (req, res) => {
  try {
    const stories = await readData('stories');
    if (!stories) {
      return res.status(404).json({ error: 'No stories found' });
    }
    const story = stories.find(s => s.id === req.params.id);
    if (!story) {
      return res.status(404).json({ error: 'Story not found' });
    }
    res.json(story);
  } catch (error) {
    console.error('Error reading story:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update a specific story
app.put('/api/stories/:id', async (req, res) => {
  try {
    let stories = await readData('stories');
    if (!stories) {
      stories = [];
    }
    const index = stories.findIndex(s => s.id === req.params.id);

    if (index === -1) {
      stories.push(req.body);
    } else {
      stories[index] = req.body;
    }
    await writeData('stories', stories);
    res.json({ success: true, story: req.body });
  } catch (error) {
    console.error('Error updating story:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete a specific story
app.delete('/api/stories/:id', async (req, res) => {
  try {
    let stories = await readData('stories');
    if (!stories) {
      return res.status(404).json({ error: 'No stories found' });
    }

    const nextStories = stories.filter((story) => story.id !== req.params.id);
    if (nextStories.length === stories.length) {
      return res.status(404).json({ error: 'Story not found' });
    }

    await writeData('stories', nextStories);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting story:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all data of a type (groups, collections, stories, models, settings)
app.get('/api/:type', async (req, res) => {
  try {
    const { type } = req.params;
    if (!ALLOWED_TYPES.has(type)) {
      return res.status(400).json({ error: 'Unsupported data type' });
    }
    const data = await readData(type);
    res.json(data || getDefaultData(type));
  } catch (error) {
    console.error(`Error reading ${req.params.type}:`, error);
    res.status(500).json({ error: error.message });
  }
});

// Default data for each type
function getDefaultData(type) {
  switch (type) {
    case 'groups':
      return [];
    case 'collections':
      return [];
    case 'stories':
      return [];
    case 'models':
      return [];
    case 'completionModels':
      return { models: [] };
    case 'settings':
      return {
        selectedModelId: null,
        samplingParams: {
          temperature: 1.0,
          top_p: 1.0,
          top_k: 0,
          frequency_penalty: 0.0,
          presence_penalty: 0.0,
          repetition_penalty: 1.0,
          min_p: 0.0,
          top_a: 0.0,
          max_tokens: 256,
        },
      };
    default:
      return null;
  }
}

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Start server
app.listen(PORT, () => {
  console.log(`GoonWriter server running on http://localhost:${PORT}`);
  ensureDataDir();
});
