import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { LeftSidebar } from './components/sidebar/LeftSidebar';
import { ContentsSidebar } from './components/sidebar/ContentsSidebar';
import { PromptEngineeringSidebar } from './components/sidebar/PromptEngineeringSidebar';
import { RightSidebar } from './components/sidebar/RightSidebar';
import { StoryEditor } from './components/editor/StoryEditor';
import { useDataStore, useModelStore, useAppStore, useCompletionModelStore } from './stores';

const LEFT_PANEL_WIDTH_STORAGE_KEY = 'goonwriter:leftPanelWidth';
const LIBRARY_PANEL_HEIGHT_STORAGE_KEY = 'goonwriter:libraryPanelHeight';
const LEFT_PANEL_MODE_STORAGE_KEY = 'goonwriter:leftPanelMode';

type LeftPanelMode = 'workspace' | 'prompt';

function readStoredNumber(key: string, fallback: number): number {
  if (typeof window === 'undefined') return fallback;

  const raw = window.localStorage.getItem(key);
  if (!raw) return fallback;

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readStoredMode(): LeftPanelMode {
  if (typeof window === 'undefined') return 'workspace';

  const raw = window.localStorage.getItem(LEFT_PANEL_MODE_STORAGE_KEY);
  return raw === 'prompt' ? 'prompt' : 'workspace';
}

function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isDataInitialized = useDataStore((state) => state.isInitialized);
  const [leftPanelWidth, setLeftPanelWidth] = useState(() => readStoredNumber(LEFT_PANEL_WIDTH_STORAGE_KEY, 540));
  const [libraryPanelHeight, setLibraryPanelHeight] = useState(() => readStoredNumber(LIBRARY_PANEL_HEIGHT_STORAGE_KEY, 420));
  const [leftPanelMode, setLeftPanelMode] = useState<LeftPanelMode>(() => readStoredMode());
  const isResizingOuterRef = useRef(false);
  const isResizingInnerRef = useRef(false);
  
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

  // Sync every 5s when visible and idle for 30s; sync immediately on tab focus.
  useEffect(() => {
    if (!isDataInitialized) return;

    const IDLE_THRESHOLD_MS = 30000;
    const SYNC_INTERVAL_MS = 5000;
    let lastActivityAt = Date.now();

    const markActivity = () => {
      lastActivityAt = Date.now();
    };

    const tryIdleSync = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastActivityAt < IDLE_THRESHOLD_MS) return;
      const store = useDataStore.getState();
      if (store.hasPendingStorySaves()) return;
      void store.syncWithServer();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      const store = useDataStore.getState();
      const syncAfterFlush = async () => {
        if (store.hasPendingStorySaves()) {
          await store.flushPendingStorySaves();
        }
        await store.syncWithServer();
      };
      void syncAfterFlush();
    };

    const activityEvents: Array<keyof WindowEventMap> = [
      'mousedown',
      'mousemove',
      'keydown',
      'scroll',
      'touchstart',
    ];
    activityEvents.forEach((eventName) => window.addEventListener(eventName, markActivity, true));
    document.addEventListener('visibilitychange', handleVisibilityChange);
    const syncInterval = setInterval(tryIdleSync, SYNC_INTERVAL_MS);

    return () => {
      activityEvents.forEach((eventName) => window.removeEventListener(eventName, markActivity, true));
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearInterval(syncInterval);
    };
  }, [isDataInitialized]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(LEFT_PANEL_WIDTH_STORAGE_KEY, String(leftPanelWidth));
  }, [leftPanelWidth]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(LIBRARY_PANEL_HEIGHT_STORAGE_KEY, String(libraryPanelHeight));
  }, [libraryPanelHeight]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(LEFT_PANEL_MODE_STORAGE_KEY, leftPanelMode);
  }, [leftPanelMode]);
  
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
    isResizingOuterRef.current = true;

    const minPanelWidth = 360;
    const maxPanelWidth = Math.max(minPanelWidth, window.innerWidth - 420);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isResizingOuterRef.current) return;

      const nextWidth = Math.max(minPanelWidth, Math.min(maxPanelWidth, moveEvent.clientX));
      setLeftPanelWidth(nextWidth);
    };

    const handleMouseUp = () => {
      isResizingOuterRef.current = false;
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

  const startInnerPanelResize = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    isResizingInnerRef.current = true;

    const dragStartY = event.clientY;
    const initialLibraryHeight = libraryPanelHeight;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isResizingInnerRef.current) return;

      const deltaY = moveEvent.clientY - dragStartY;
      const maxLibraryHeight = Math.max(180, window.innerHeight - 240);
      const nextHeight = Math.max(180, Math.min(maxLibraryHeight, initialLibraryHeight + deltaY));
      setLibraryPanelHeight(nextHeight);
    };

    const handleMouseUp = () => {
      isResizingInnerRef.current = false;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };
  
  return (
    <div className="h-screen flex overflow-hidden bg-white">
      {/* Left Sidebar Panel */}
      <div style={{ width: `${leftPanelWidth}px` }} className="h-full shrink-0 flex flex-col min-w-0">
        <div className="shrink-0 border-b border-gray-200 bg-gray-50 px-2 py-1.5">
          <div className="inline-flex rounded-md border border-gray-300 bg-white overflow-hidden">
            <button
              type="button"
              className={`px-3 py-1.5 text-xs ${leftPanelMode === 'workspace' ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'}`}
              onClick={() => setLeftPanelMode('workspace')}
            >
              Library + Contents
            </button>
            <button
              type="button"
              className={`px-3 py-1.5 text-xs border-l border-gray-300 ${leftPanelMode === 'prompt' ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'}`}
              onClick={() => setLeftPanelMode('prompt')}
            >
              Story Blueprint
            </button>
          </div>
        </div>

        {leftPanelMode === 'workspace' ? (
          <>
            <div style={{ height: `${libraryPanelHeight}px` }} className="shrink-0 min-h-0">
              <LeftSidebar />
            </div>

            <div
              className="h-3 w-full cursor-row-resize relative group"
              onMouseDown={startInnerPanelResize}
              title="Resize library/contents split"
            >
              <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-px bg-gray-200 group-hover:bg-gray-300 transition-colors" />
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-1.5 w-10 rounded-full bg-white border border-gray-300 shadow-sm group-hover:border-gray-400 group-hover:bg-gray-50 transition-colors pointer-events-none" />
            </div>

            <div className="min-h-0 flex-1">
              <ContentsSidebar />
            </div>
          </>
        ) : (
          <div className="min-h-0 flex-1">
            <PromptEngineeringSidebar />
          </div>
        )}
      </div>

      <div
        className="w-3 h-full cursor-col-resize relative group"
        onMouseDown={startLeftPanelResize}
        title="Resize sidebar"
      >
        <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-gray-200 group-hover:bg-gray-300 transition-colors" />
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-10 w-1.5 rounded-full bg-white border border-gray-300 shadow-sm group-hover:border-gray-400 group-hover:bg-gray-50 transition-colors pointer-events-none" />
      </div>
      
      {/* Main Editor Area */}
      <StoryEditor />
      
      {/* Right Sidebar - LLM Controls */}
      <RightSidebar />
    </div>
  );
}

export default App;
