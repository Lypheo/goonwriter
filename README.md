# GoonWriter

Basically just a simple LLM frontend, with the main difference to other frontends being that it's built around the text completion endpoint (/completions) rather than chat completions.
This gives the user full control over every single token sent to the LLM and allows the user to edit any part of the conversation, crucially including the model's reasoning.
By editing or prefilling the model's reasoning or response, the LLM can be steered accurately and censorship is easily circumvented.

This is inspired by [mikupad](https://github.com/lmg-anon/mikupad/) and [KoboldAI lite](https://github.com/LostRuins/lite.koboldai.net), which do basically the same thing, except with a (imo) worse UI for model config and session management.

100% written by Claude, so here's how it describes this tool:

---------------------------------------------------------------------

A co-writing web application with LLM integration. Write stories with AI assistance, track authorship, and manage prompts with customizable instruction templates.

## Features

### LLM Integration
- **Multiple Model Configs**: Configure multiple LLM endpoints with custom base URLs and API tokens
- **Instruction Templates**: Define model-specific tags for system prompts, user/assistant turns, and thinking blocks
- **Streaming Responses**: Real-time streaming with words-per-second tracking
- **Usage Tracking**: View token counts and costs per generation
- **Provider Settings**: Filter by allowed/banned providers and quantizations

### Special Tokens
Use placeholder tokens in your stories that get replaced with model-specific tags:
- `<<start_sys_prompt>>` / `<<end_sys_prompt>>` - System prompt boundaries
- `<<start_user>>` / `<<end_user>>` - User turn markers
- `<<start_ai>>` / `<<end_ai>>` - Assistant turn markers
- `<think>` / `</think>` - Reasoning/thinking blocks

### Editor
- **TipTap-based**: Rich text editor with markdown support
- **Authorship Tracking**: Visual distinction between human-written and AI-generated text
- **Syntax Highlighting**: Special tokens displayed with color-coded styling
- **Think Block Styling**: Reasoning content styled distinctly (italic, muted)

### Story Organization
- **Groups & Collections**: Hierarchical organization of stories
- **File-based Persistence**: Stories saved to server-side JSON files

### Sampling Parameters
- Temperature, Top-P, Top-K, Min-P
- Repetition penalty with configurable window
- Frequency and presence penalties
- Max tokens control

## Getting Started

```bash
# Install dependencies
npm install

# Start both frontend and backend
npm run dev:all

# Or run separately:
npm run dev        # Frontend only (port 5173)
npm run server     # Backend only (port 3001)
```

## Configuration

### Adding a Model

1. Click the settings icon next to the model dropdown
2. Fill in:
   - **Display Name**: Friendly name for the model
   - **Base URL**: API endpoint (e.g., `https://openrouter.ai/api/v1`)
   - **Token**: Your API key
   - **Model ID**: The model identifier (e.g., `anthropic/claude-3-opus`)
3. Configure instruction template tags for your model's format

### Auto-close Think Tags

Enable the "Auto-close think tags" checkbox to automatically insert `</think>` when the model transitions from reasoning to regular output. Useful for models that stream reasoning content separately.

## Technology Stack

- **React 19** + **TypeScript** - Frontend
- **Vite** - Build tool with HMR
- **TipTap / ProseMirror** - Rich text editor
- **Zustand** - State management
- **Tailwind CSS 4** - Styling
- **Express** - Backend server for persistence

## Project Structure

```
src/
├── components/
│   ├── editor/
│   │   ├── StoryEditor.tsx    # Main editor with authorship tracking
│   │   └── extensions.ts      # ProseMirror decorations
│   ├── sidebar/
│   │   ├── RightSidebar.tsx   # LLM controls & generation
│   │   ├── ModelConfigDialog  # Model configuration
│   │   └── SamplingParams     # Sampling parameter controls
│   └── ui/                    # Reusable UI components
├── services/
│   └── llmService.ts          # Streaming completion & token handling
├── stores/                    # Zustand stores
└── types/                     # TypeScript definitions

server/
├── index.js                   # Express server
└── data/                      # Persisted JSON data
```

## License

MIT
