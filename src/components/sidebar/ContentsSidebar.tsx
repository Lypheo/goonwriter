import { useDataStore, useAppStore } from '../../stores';

function stripMarkdown(line: string): string {
  return line
    .replace(/^#{1,6}\s+/, '')
    .replace(/\*\*|__|\*|_|`|~~/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^>\s+/, '')
    .trim();
}

function getAssistantTitle(content: string, index: number): string {
  const firstLine = (content || '').split(/\r?\n/, 1)[0] || '';
  const cleaned = stripMarkdown(firstLine);
  return cleaned || `Assistant ${index + 1}`;
}

export function ContentsSidebar() {
  const { stories } = useDataStore();
  const { selectedStoryId } = useAppStore();

  const selectedStory = stories.find((story) => story.id === selectedStoryId);
  const assistantSections = (selectedStory?.sections || []).filter((section) => section.type === 'assistant');

  const jumpToAssistant = (sectionId: string) => {
    const element = document.getElementById(`assistant-section-${sectionId}`);
    if (!element) return;
    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="w-full h-full bg-gray-50 border-r border-gray-200 flex flex-col">
      <div className="p-3 border-b border-gray-200">
        <h2 className="font-semibold text-gray-800">Contents</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {!selectedStory ? (
          <p className="text-sm text-gray-500 text-center py-4">Select a story to view contents</p>
        ) : assistantSections.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-4">No assistant sections yet</p>
        ) : (
          <div className="space-y-1">
            {assistantSections.map((section, index) => (
              <button
                key={section.id}
                onClick={() => jumpToAssistant(section.id)}
                className="w-full text-left px-2 py-1.5 rounded text-sm text-gray-700 hover:bg-gray-200 transition-colors"
                title={getAssistantTitle(section.content, index)}
              >
                <span className="text-gray-400 mr-1">{index + 1}.</span>
                <span className="truncate align-middle">{getAssistantTitle(section.content, index)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
