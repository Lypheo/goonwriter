import { useEffect, useState } from 'react';
import { LeftSidebar } from './components/sidebar/LeftSidebar';
import { ContentsSidebar } from './components/sidebar/ContentsSidebar';
import { RightSidebar } from './components/sidebar/RightSidebar';
import { StoryEditor } from './components/editor/StoryEditor';
import { useDataStore, useModelStore, useAppStore, useCompletionModelStore } from './stores';

function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [leftSidebarView, setLeftSidebarView] = useState<'library' | 'contents'>('library');
  
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
  
  return (
    <div className="h-screen flex overflow-hidden bg-white relative">
      <div className="absolute left-2 top-2 z-20 inline-flex rounded-md border border-gray-200 bg-white/95 p-0.5 shadow-sm">
        <button
          onClick={() => setLeftSidebarView('library')}
          className={`px-2 py-1 text-xs rounded ${leftSidebarView === 'library' ? 'bg-gray-200 text-gray-800' : 'text-gray-600 hover:bg-gray-100'}`}
        >
          Library
        </button>
        <button
          onClick={() => setLeftSidebarView('contents')}
          className={`px-2 py-1 text-xs rounded ${leftSidebarView === 'contents' ? 'bg-gray-200 text-gray-800' : 'text-gray-600 hover:bg-gray-100'}`}
        >
          Contents
        </button>
      </div>

      {/* Left Sidebar */}
      {leftSidebarView === 'library' ? <LeftSidebar /> : <ContentsSidebar />}
      
      {/* Main Editor Area */}
      <StoryEditor />
      
      {/* Right Sidebar - LLM Controls */}
      <RightSidebar />
    </div>
  );
}

export default App;
