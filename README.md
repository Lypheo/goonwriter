# GoonWriter - Branching Story Editor

A web-based branching story writing tool built with React, TypeScript, and TipTap. Write stories with the ability to branch the narrative at any point, creating a tree structure of story drafts.

## Features

### Story Organization
- **Story Groups**: Organize stories into named groups
- **Story Trees**: Each story is a tree structure of nodes
- **Full CRUD**: Create, rename, duplicate, move, and delete stories and groups

### Branching
- **Branch from Current**: Create a new branch continuing from the current node
- **Branch at Position**: Right-click any text position to branch from that point
- **Automatic Node Splitting**: When branching mid-node, the system automatically splits the node and reparents children
- **Frozen Nodes**: Non-leaf nodes are frozen (editing creates a new child branch)
- **Chain Merging**: Merge simple chains of nodes with no forks

### Editor
- **WYSIWYG Editor**: TipTap-based rich text editor with markdown support
- **Branch Point Indicators**: Visual markers showing where ancestor nodes end
- **Auto-branching**: Typing in a frozen node automatically creates a new branch

### Storage
- **Local Storage**: All data persisted in browser localStorage
- **JSON Format**: Stories stored as JSON for easy backup/export

## Getting Started

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

## Project Structure

```
src/
├── components/
│   ├── StoryEditor.tsx      # TipTap editor component
│   ├── StoryTreeView.tsx    # Tree visualization
│   └── GroupsSidebar.tsx    # Story groups navigation
├── stores/
│   └── storyStore.ts        # Zustand state management
├── types/
│   └── index.ts             # TypeScript type definitions
├── utils/
│   ├── storage.ts           # localStorage utilities
│   └── treeUtils.ts         # Tree manipulation utilities
└── App.tsx                  # Main application component
```

## Usage

1. **Create a Group**: Click the + button in the Stories sidebar header
2. **Create a Story**: Click the + button next to any group
3. **Write**: Start typing in the editor
4. **Branch**: 
   - Click "Branch Here" to create a new branch from current position
   - Right-click in text to branch at that position
   - Click branch point markers to navigate to ancestors
5. **Navigate**: Use the tree view on the right to navigate between nodes
6. **Manage**: Double-click names to rename, use action buttons to delete/merge

## Technology Stack

- **React 19** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool
- **TipTap** - Rich text editor
- **Zustand** - State management
- **Tailwind CSS** - Styling

## Future Plans

- LLM integration for AI-assisted writing
- Export to various formats (Markdown, HTML, PDF)
- Collaborative editing
- Cloud sync
