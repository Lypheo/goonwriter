import { useEffect } from 'react';
import { useDataStore } from '../stores';

/**
 * Displays sync conflicts and allows user to resolve them.
 * When multiple devices edit the same story, conflicts are detected and shown here.
 */
export function SyncConflictNotifier() {
  const syncConflicts = useDataStore((state) => state.syncConflicts);
  const resolveConflict = useDataStore((state) => state.resolveConflict);
  const clearResolvedConflicts = useDataStore((state) => state.clearResolvedConflicts);
  
  // Auto-cleanup old resolved conflicts
  useEffect(() => {
    const timer = setTimeout(clearResolvedConflicts, 10000);
    return () => clearTimeout(timer);
  }, [clearResolvedConflicts]);
  
  const unresolvedConflicts = syncConflicts.filter((c) => !c.resolvedAt);
  
  if (unresolvedConflicts.length === 0) {
    return null;
  }
  
  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-amber-50 border-b border-amber-200 p-3 shadow-sm">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 pt-0.5">
            <svg className="h-5 w-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-amber-900">
              {unresolvedConflicts.length} Story {unresolvedConflicts.length === 1 ? 'Conflict' : 'Conflicts'} Detected
            </h3>
            <p className="mt-1 text-sm text-amber-800">
              The following {unresolvedConflicts.length === 1 ? 'story was' : 'stories were'} edited on another device. 
              Choose to keep your local changes or use the version from the server.
            </p>
            <div className="mt-2 space-y-2">
              {unresolvedConflicts.map((conflict) => (
                <div key={conflict.storyId} className="flex items-center justify-between bg-white bg-opacity-60 rounded p-2 text-sm">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">{conflict.storyName}</p>
                    <p className="text-xs text-gray-600">
                      Local edited: {new Date(conflict.localUpdatedAt).toLocaleTimeString()} · 
                      Server edited: {new Date(conflict.serverUpdatedAt).toLocaleTimeString()}
                    </p>
                  </div>
                  <div className="flex gap-2 ml-2 flex-shrink-0">
                    <button
                      onClick={() => resolveConflict(conflict.storyId, 'keep-local')}
                      className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
                      title="Keep your local changes"
                    >
                      Keep Local
                    </button>
                    <button
                      onClick={() => resolveConflict(conflict.storyId, 'use-server')}
                      className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
                      title="Use the newer version from server"
                    >
                      Use Server
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <button
            onClick={clearResolvedConflicts}
            className="flex-shrink-0 text-amber-600 hover:text-amber-700"
            aria-label="Dismiss"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
