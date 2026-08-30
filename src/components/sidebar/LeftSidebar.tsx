import { useState, useEffect } from 'react';
import { useDataStore, useAppStore, useCompletionModelStore } from '../../stores';
import { Button, Input, Modal, ConfirmDialog } from '../ui/common';
import { suggestTitle } from '../../services/llmService';

// Icons
const FolderIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
  </svg>
);

const CollectionIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
  </svg>
);

const DocumentIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
);

const PlusIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
  </svg>
);

const EditIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
  </svg>
);

const TrashIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
);

const DuplicateIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
  </svg>
);

const ChevronIcon = ({ isOpen }: { isOpen: boolean }) => (
  <svg
    className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-90' : ''}`}
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
  >
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
  </svg>
);

const SparklesIcon = ({ spinning }: { spinning?: boolean } = {}) => (
  <svg
    className={`w-4 h-4 ${spinning ? 'animate-spin text-blue-500' : 'text-purple-500'}`}
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
  >
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
  </svg>
);

function formatRelativeDate(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m`;
  if (hours < 24) return `${hours}h`;
  if (days < 7) return `${days}d`;
  if (days < 30) return `${Math.floor(days / 7)}w`;
  const date = new Date(timestamp);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function LeftSidebar() {
  const {
    groups,
    collections,
    stories,
    createGroup,
    updateGroup,
    deleteGroup,
    createCollection,
    updateCollection,
    deleteCollection,
    createStory,
    updateStory,
    deleteStory,
    duplicateStory,
  } = useDataStore();
  
  const {
    selectedGroupId,
    selectedCollectionId,
    selectedStoryId,
    setSelectedGroup,
    setSelectedCollection,
    setSelectedStory,
    titleSuggestionPrompt,
    setTitleSuggestionPrompt,
  } = useAppStore();
  
  const { models: completionModels } = useCompletionModelStore();
  
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [expandedCollections, setExpandedCollections] = useState<Set<string>>(new Set());
  
  // Expand tree to show selected story on mount
  useEffect(() => {
    if (selectedStoryId) {
      const story = stories.find(s => s.id === selectedStoryId);
      if (story) {
        const collection = collections.find(c => c.id === story.collectionId);
        if (collection) {
          setExpandedCollections(prev => new Set([...prev, collection.id]));
          setExpandedGroups(prev => new Set([...prev, collection.groupId]));
        }
      }
    }
  }, []); // Run once on mount
  
  // Modal states
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [showCollectionModal, setShowCollectionModal] = useState(false);
  const [showStoryModal, setShowStoryModal] = useState(false);
  const [editingItem, setEditingItem] = useState<{ type: 'group' | 'collection' | 'story'; id: string; name: string } | null>(null);
  const [newItemName, setNewItemName] = useState('');
  const [parentId, setParentId] = useState<string | null>(null);
  
  // Delete confirm states
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'group' | 'collection' | 'story'; id: string; name: string } | null>(null);
  
  // AI title suggestion state
  const [isSuggestingTitle, setIsSuggestingTitle] = useState(false);
  const [titleSuggestionError, setTitleSuggestionError] = useState<string | null>(null);
  const [showPromptEditor, setShowPromptEditor] = useState(false);
  const [promptDraft, setPromptDraft] = useState(titleSuggestionPrompt);
  
  const toggleGroup = (id: string) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedGroups(newExpanded);
  };
  
  const toggleCollection = (id: string) => {
    const newExpanded = new Set(expandedCollections);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedCollections(newExpanded);
  };
  
  const handleCreateGroup = () => {
    if (newItemName.trim()) {
      const group = createGroup(newItemName.trim());
      setExpandedGroups(new Set([...expandedGroups, group.id]));
      setNewItemName('');
      setShowGroupModal(false);
    }
  };
  
  const handleCreateCollection = () => {
    if (newItemName.trim() && parentId) {
      const collection = createCollection(parentId, newItemName.trim());
      setExpandedCollections(new Set([...expandedCollections, collection.id]));
      setNewItemName('');
      setShowCollectionModal(false);
      setParentId(null);
    }
  };
  
  const handleCreateStory = () => {
    if (newItemName.trim() && parentId) {
      const story = createStory(parentId, newItemName.trim());
      setSelectedStory(story.id);
      setNewItemName('');
      setShowStoryModal(false);
      setParentId(null);
    }
  };
  
  const handleSaveEdit = () => {
    if (editingItem && newItemName.trim()) {
      switch (editingItem.type) {
        case 'group':
          updateGroup(editingItem.id, newItemName.trim());
          break;
        case 'collection':
          updateCollection(editingItem.id, newItemName.trim());
          break;
        case 'story':
          updateStory(editingItem.id, { name: newItemName.trim() });
          break;
      }
      setEditingItem(null);
      setNewItemName('');
    }
  };
  
  const handleDelete = () => {
    if (deleteConfirm) {
      switch (deleteConfirm.type) {
        case 'group':
          deleteGroup(deleteConfirm.id);
          if (selectedGroupId === deleteConfirm.id) {
            setSelectedGroup(null);
            setSelectedCollection(null);
            setSelectedStory(null);
          }
          break;
        case 'collection':
          deleteCollection(deleteConfirm.id);
          if (selectedCollectionId === deleteConfirm.id) {
            setSelectedCollection(null);
            setSelectedStory(null);
          }
          break;
        case 'story':
          {
            const selectedStory = stories.find((story) => story.id === selectedStoryId);
            const selectedStoryRemoved = selectedStory
              ? selectedStory.id === deleteConfirm.id || selectedStory.parentStoryId === deleteConfirm.id
              : false;
          deleteStory(deleteConfirm.id);
          if (selectedStoryRemoved) {
            setSelectedStory(null);
          }
          break;
          }
      }
      setDeleteConfirm(null);
    }
  };

  const selectedStory = stories.find((story) => story.id === selectedStoryId) || null;
  
  const handleDuplicate = (storyId: string) => {
    const duplicated = duplicateStory(storyId);
    if (duplicated) {
      setSelectedStory(duplicated.id);
    }
  };

  const handleSuggestTitle = async () => {
    if (!editingItem || editingItem.type !== 'story') return;
    const utilityModel = completionModels.find((m) => m.isUtilityModel);
    if (!utilityModel) {
      setTitleSuggestionError('No utility model configured. Enable one in Completion Models settings.');
      return;
    }
    const story = stories.find((s) => s.id === editingItem.id);
    if (!story) return;

    // Build story content (same as export: assistant sections joined)
    const storyContent = (story.sections || [])
      .filter((section) => section.type === 'assistant')
      .map((section) => section.content || '')
      .filter((content) => content.trim().length > 0)
      .join('\n\n');

    // Build adjacent titles (all stories in same collection except this one)
    const adjacentTitles = stories
      .filter((s) => s.collectionId === story.collectionId && s.id !== story.id)
      .map((s) => s.name);

    setIsSuggestingTitle(true);
    setTitleSuggestionError(null);
    try {
      const suggested = await suggestTitle(
        utilityModel,
        titleSuggestionPrompt,
        storyContent || '(no content yet)',
        adjacentTitles,
      );
      if (suggested) {
        setNewItemName(suggested);
      }
    } catch (err) {
      setTitleSuggestionError(err instanceof Error ? err.message : 'Failed to suggest title');
    } finally {
      setIsSuggestingTitle(false);
    }
  };

  return (
    <div className="w-full h-full bg-gray-50 flex flex-col min-w-0">
      {/* Header */}
      <div className="p-3 border-b border-gray-200 flex items-center justify-between">
        <h2 className="font-semibold text-gray-800">Library</h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setNewItemName('');
            setShowGroupModal(true);
          }}
          title="New Group"
        >
          <PlusIcon />
        </Button>
      </div>
      
      {/* Tree View */}
      <div className="flex-1 overflow-y-auto p-2">
        {groups.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-4">
            No groups yet. Create one to get started!
          </p>
        ) : (
          groups.map((group) => {
            const groupCollections = collections.filter((c) => c.groupId === group.id);
            const isGroupExpanded = expandedGroups.has(group.id);
            
            return (
              <div key={group.id} className="mb-1">
                {/* Group */}
                <div
                  className={`group flex items-center gap-1 p-1.5 rounded cursor-pointer hover:bg-gray-200 ${
                    selectedGroupId === group.id ? 'bg-gray-200' : ''
                  }`}
                  onClick={() => {
                    setSelectedGroup(group.id);
                    toggleGroup(group.id);
                  }}
                >
                  <ChevronIcon isOpen={isGroupExpanded} />
                  <FolderIcon />
                  <span className="flex-1 text-sm truncate">{group.name}</span>
                  <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
                    <button
                      className="p-1 hover:bg-gray-300 rounded"
                      onClick={(e) => {
                        e.stopPropagation();
                        setParentId(group.id);
                        setNewItemName('');
                        setShowCollectionModal(true);
                      }}
                      title="Add Collection"
                    >
                      <PlusIcon />
                    </button>
                    <button
                      className="p-1 hover:bg-gray-300 rounded"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingItem({ type: 'group', id: group.id, name: group.name });
                        setNewItemName(group.name);
                      }}
                      title="Edit"
                    >
                      <EditIcon />
                    </button>
                    <button
                      className="p-1 hover:bg-red-100 text-red-600 rounded"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteConfirm({ type: 'group', id: group.id, name: group.name });
                      }}
                      title="Delete"
                    >
                      <TrashIcon />
                    </button>
                  </div>
                </div>
                
                {/* Collections */}
                {isGroupExpanded && (
                  <div className="ml-4">
                    {groupCollections.map((collection) => {
                      const rootStories = stories
                        .filter((s) => s.collectionId === collection.id && !s.parentStoryId)
                        .sort((left, right) => left.createdAt - right.createdAt);
                      const isCollectionExpanded = expandedCollections.has(collection.id);
                      
                      return (
                        <div key={collection.id} className="mb-0.5">
                          <div
                            className={`group flex items-center gap-1 p-1.5 rounded cursor-pointer hover:bg-gray-200 ${
                              selectedCollectionId === collection.id ? 'bg-gray-200' : ''
                            }`}
                            onClick={() => {
                              setSelectedCollection(collection.id);
                              toggleCollection(collection.id);
                            }}                              onDragOver={(e) => {
                                e.preventDefault();
                                e.dataTransfer.dropEffect = 'move';
                              }}
                              onDrop={(e) => {
                                e.preventDefault();
                                const storyId = e.dataTransfer.getData('text/plain');
                                if (storyId) {
                                  updateStory(storyId, { collectionId: collection.id });
                                }
                              }}                          >
                            <ChevronIcon isOpen={isCollectionExpanded} />
                            <CollectionIcon />
                            <span className="flex-1 text-sm truncate">{collection.name}</span>
                            <span className="text-[10px] text-gray-400 tabular-nums shrink-0">{formatRelativeDate(collection.updatedAt)}</span>
                            <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
                              <button
                                className="p-1 hover:bg-gray-300 rounded"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setParentId(collection.id);
                                  setNewItemName('');
                                  setShowStoryModal(true);
                                }}
                                title="Add Story"
                              >
                                <PlusIcon />
                              </button>
                              <button
                                className="p-1 hover:bg-gray-300 rounded"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingItem({ type: 'collection', id: collection.id, name: collection.name });
                                  setNewItemName(collection.name);
                                }}
                                title="Edit"
                              >
                                <EditIcon />
                              </button>
                              <button
                                className="p-1 hover:bg-red-100 text-red-600 rounded"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeleteConfirm({ type: 'collection', id: collection.id, name: collection.name });
                                }}
                                title="Delete"
                              >
                                <TrashIcon />
                              </button>
                            </div>
                          </div>
                          
                          {/* Stories */}
                          {isCollectionExpanded && (
                            <div className="ml-4">
                              {rootStories.map((story) => {
                                const childStories = stories
                                  .filter((candidate) => candidate.parentStoryId === story.id)
                                  .sort((left, right) => (left.chapterNumber || 0) - (right.chapterNumber || 0));
                                const shouldShowChildren = selectedStoryId === story.id || selectedStory?.parentStoryId === story.id;

                                return (
                                  <div key={story.id}>
                                    <div
                                      className={`group flex items-center gap-1 p-1.5 rounded cursor-pointer hover:bg-gray-200 ${
                                        selectedStoryId === story.id ? 'bg-blue-100' : ''
                                      }`}
                                      onClick={() => setSelectedStory(story.id)}                                draggable={true}
                                      onDragStart={(e) => {
                                        e.dataTransfer.setData('text/plain', story.id);
                                        e.dataTransfer.effectAllowed = 'move';
                                      }}                                >
                                      <DocumentIcon />
                                      <span className="flex-1 text-sm truncate">{story.name}</span>
                                      <span className="text-[10px] text-gray-400 tabular-nums shrink-0">{formatRelativeDate(story.updatedAt)}</span>
                                      {childStories.length > 0 && (
                                        <span className="text-[10px] text-gray-500 px-1.5 py-0.5 rounded bg-gray-100 border border-gray-200">
                                          {childStories.length} ch
                                        </span>
                                      )}
                                      <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
                                        <button
                                          className="p-1 hover:bg-blue-200 text-blue-600 rounded"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleDuplicate(story.id);
                                          }}
                                          title="Duplicate"
                                        >
                                          <DuplicateIcon />
                                        </button>
                                        <button
                                          className="p-1 hover:bg-gray-300 rounded"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setEditingItem({ type: 'story', id: story.id, name: story.name });
                                            setNewItemName(story.name);
                                          }}
                                          title="Edit"
                                        >
                                          <EditIcon />
                                        </button>
                                        <button
                                          className="p-1 hover:bg-red-100 text-red-600 rounded"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setDeleteConfirm({ type: 'story', id: story.id, name: story.name });
                                          }}
                                          title="Delete"
                                        >
                                          <TrashIcon />
                                        </button>
                                      </div>
                                    </div>

                                    {shouldShowChildren && childStories.length > 0 && (
                                      <div className="ml-5 space-y-0.5 mb-1">
                                        {childStories.map((child) => (
                                          <button
                                            key={child.id}
                                            type="button"
                                            className={`w-full text-left flex items-center gap-1.5 p-1.5 rounded hover:bg-gray-200 ${selectedStoryId === child.id ? 'bg-blue-100' : ''}`}
                                            onClick={() => setSelectedStory(child.id)}
                                          >
                                            <span className="text-[10px] text-gray-500">#{child.chapterNumber || '?'}</span>
                                            <DocumentIcon />
                                            <span className="flex-1 text-sm truncate">{child.chapterTitle || child.name}</span>
                                            <span className="text-[10px] text-gray-400 tabular-nums shrink-0">{formatRelativeDate(child.updatedAt)}</span>
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                              {rootStories.length === 0 && (
                                <p className="text-xs text-gray-400 py-1 pl-5">No stories</p>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {groupCollections.length === 0 && (
                      <p className="text-xs text-gray-400 py-1 pl-5">No collections</p>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
      
      {/* Create Group Modal */}
      <Modal
        isOpen={showGroupModal}
        onClose={() => setShowGroupModal(false)}
        title="Create Group"
        size="sm"
      >
        <Input
          label="Group Name"
          value={newItemName}
          onChange={(e) => setNewItemName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCreateGroup()}
          autoFocus
        />
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="secondary" onClick={() => setShowGroupModal(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreateGroup}>Create</Button>
        </div>
      </Modal>
      
      {/* Create Collection Modal */}
      <Modal
        isOpen={showCollectionModal}
        onClose={() => setShowCollectionModal(false)}
        title="Create Collection"
        size="sm"
      >
        <Input
          label="Collection Name"
          value={newItemName}
          onChange={(e) => setNewItemName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCreateCollection()}
          autoFocus
        />
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="secondary" onClick={() => setShowCollectionModal(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreateCollection}>Create</Button>
        </div>
      </Modal>
      
      {/* Create Story Modal */}
      <Modal
        isOpen={showStoryModal}
        onClose={() => setShowStoryModal(false)}
        title="Create Story"
        size="sm"
      >
        <Input
          label="Story Name"
          value={newItemName}
          onChange={(e) => setNewItemName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCreateStory()}
          autoFocus
        />
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="secondary" onClick={() => setShowStoryModal(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreateStory}>Create</Button>
        </div>
      </Modal>
      
      {/* Edit Modal */}
      <Modal
        isOpen={editingItem !== null}
        onClose={() => {
          setEditingItem(null);
          setNewItemName('');
          setTitleSuggestionError(null);
          setShowPromptEditor(false);
        }}
        title={`Edit ${editingItem?.type || ''}`}
        size="sm"
      >
        <div className="relative">
          <Input
            label="Name"
            value={newItemName}
            onChange={(e) => setNewItemName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit()}
            autoFocus
            className={editingItem?.type === 'story' ? 'pr-20' : ''}
          />
          {editingItem?.type === 'story' && (
            <div className="absolute right-1 top-[30px] flex items-center">
              <button
                type="button"
                onClick={handleSuggestTitle}
                disabled={isSuggestingTitle}
                className="p-1 rounded hover:bg-purple-100 transition-colors disabled:opacity-50"
                title="Suggest title with AI"
              >
                <SparklesIcon spinning={isSuggestingTitle} />
              </button>
              <button
                type="button"
                onClick={() => {
                  setPromptDraft(titleSuggestionPrompt);
                  setShowPromptEditor(!showPromptEditor);
                }}
                className="p-1 rounded hover:bg-gray-200 transition-colors text-gray-400 hover:text-gray-600"
                title="Edit title suggestion prompt"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
            </div>
          )}
        </div>
        {titleSuggestionError && (
          <p className="mt-1 text-xs text-amber-600">{titleSuggestionError}</p>
        )}
        
        {/* Prompt Editor (expandable) */}
        {showPromptEditor && editingItem?.type === 'story' && (
          <div className="mt-3 border border-gray-200 rounded-lg p-3 bg-gray-50">
            <h4 className="text-xs font-semibold text-gray-600 mb-2">Title Suggestion Prompt</h4>
            <p className="text-[11px] text-gray-400 mb-2">
              Placeholders: <code className="bg-gray-200 px-1 rounded">{'{story}'}</code> = story content, <code className="bg-gray-200 px-1 rounded">{'{adjacent_titles}'}</code> = other titles in collection
            </p>
            <textarea
              value={promptDraft}
              onChange={(e) => setPromptDraft(e.target.value)}
              className="w-full h-28 px-2 py-1.5 text-xs font-mono border border-gray-300 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500 resize-none bg-white"
              spellCheck={false}
            />
            <div className="flex justify-between items-center mt-2">
              <button
                onClick={() => setPromptDraft('Suggest a short, compelling title for this story. Reply with ONLY the title, no quotes, no extra text.\n\nStory content:\n{story}\n\nOther stories in this collection:\n{adjacent_titles}')}
                className="text-[11px] text-gray-500 hover:text-gray-700 underline"
              >
                Reset to default
              </button>
              <div className="flex gap-1.5">
                <button
                  onClick={() => setShowPromptEditor(false)}
                  className="px-2 py-1 text-xs text-gray-600 hover:bg-gray-200 rounded-md"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setTitleSuggestionPrompt(promptDraft);
                    setShowPromptEditor(false);
                  }}
                  className="px-2 py-1 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  Save Prompt
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 mt-4">
          <Button variant="secondary" onClick={() => {
            setEditingItem(null);
            setNewItemName('');
            setTitleSuggestionError(null);
            setShowPromptEditor(false);
          }}>
            Cancel
          </Button>
          <Button onClick={handleSaveEdit}>Save</Button>
        </div>
      </Modal>
      
      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={deleteConfirm !== null}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={handleDelete}
        title={`Delete ${deleteConfirm?.type || ''}`}
        message={`Are you sure you want to delete "${deleteConfirm?.name}"? ${
          deleteConfirm?.type === 'group'
            ? 'This will delete all collections and stories in this group.'
            : deleteConfirm?.type === 'collection'
            ? 'This will delete all stories in this collection.'
            : 'This action cannot be undone.'
        }`}
        confirmLabel="Delete"
      />

    </div>
  );
}
