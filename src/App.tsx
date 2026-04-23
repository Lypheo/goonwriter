import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { LeftSidebar } from './components/sidebar/LeftSidebar';
import { ContentsSidebar } from './components/sidebar/ContentsSidebar';
import { RightSidebar } from './components/sidebar/RightSidebar';
import { StoryEditor } from './components/editor/StoryEditor';
import { useDataStore, useModelStore, useAppStore, useCompletionModelStore } from './stores';

const LibraryIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
  </svg>
);

const ContentsIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
  </svg>
);

type LeftSidebarView = 'library' | 'contents';

function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [leftSidebarView, setLeftSidebarView] = useState<LeftSidebarView>('library');
  const [leftPanelWidths, setLeftPanelWidths] = useState<Record<LeftSidebarView, number>>({
    library: 256,
    contents: 256,
  });
  const isResizingRef = useRef(false);
  
  // The initialized states are tracked internally by the stores
  
  useEffect(() => {
    const initializeStores = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        // Initialize data and model stores first
        await Promise.all([
          useDataStore.getState().initialize(),
          useModelStore.getState().initialize(),
          useCompletionModelStore.getState().initialize(),
        ]);
        
        // Then initialize app state (needs stories to be loaded first)
        await useAppStore.getState().initializeAppState();
        
        setIsLoading(false);
      } catch (err) {
        console.error('Failed to initialize stores:', err);
        setError(err instanceof Error ? err.message : 'Failed to connect to server');
        setIsLoading(false);
      }
    };
    
    initializeStores();
  }, []);
  
  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="h-screen flex items-center justify-center bg-white">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-gray-800 mb-2">Connection Error</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <p className="text-sm text-gray-500 mb-4">Make sure the backend server is running on port 3001.</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const startLeftPanelResize = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    isResizingRef.current = true;
    const resizingView = leftSidebarView;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isResizingRef.current) return;

      const nextWidth = moveEvent.clientX - 48;
      setLeftPanelWidths((prev) => ({
        ...prev,
        [resizingView]: Math.max(0, nextWidth),
      }));
    };

    const handleMouseUp = () => {
      isResizingRef.current = false;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };
  
  return (
    <div className="h-screen flex overflow-hidden bg-white">
      <div className="w-12 h-full bg-gray-50 border-r border-gray-200 flex flex-col items-center py-2 gap-1">
        <button
          onClick={() => setLeftSidebarView('library')}
          className={`w-9 h-9 rounded-md flex items-center justify-center transition-colors ${
            leftSidebarView === 'library'
              ? 'bg-gray-200 text-gray-800'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
          }`}
          title="Library"
          aria-label="Open library sidebar"
        >
          <LibraryIcon />
        </button>
        <button
          onClick={() => setLeftSidebarView('contents')}
          className={`w-9 h-9 rounded-md flex items-center justify-center transition-colors ${
            leftSidebarView === 'contents'
              ? 'bg-gray-200 text-gray-800'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
          }`}
          title="Contents"
          aria-label="Open contents sidebar"
        >
          <ContentsIcon />
        </button>
      </div>

      {/* Left Sidebar Panel */}
      <div style={{ width: `${leftPanelWidths[leftSidebarView]}px` }} className="h-full shrink-0">
        {leftSidebarView === 'library' && <LeftSidebar />}
        {leftSidebarView === 'contents' && <ContentsSidebar />}
      </div>

      <div
        className="w-1.5 h-full cursor-col-resize bg-transparent hover:bg-gray-200 active:bg-gray-300 transition-colors"
        onMouseDown={startLeftPanelResize}
        title="Resize sidebar"
      />
      
      {/* Main Editor Area */}
      <StoryEditor />
      
      {/* Right Sidebar - LLM Controls */}
      <RightSidebar />
    </div>
  );
}

export default App;
