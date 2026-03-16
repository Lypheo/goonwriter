import { useState, useEffect } from 'react';
import { useDataStore, useAppStore } from '../../stores';
import { Button, Input, Modal, ConfirmDialog } from '../ui/common';

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
  } = useAppStore();
  
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
          deleteStory(deleteConfirm.id);
          if (selectedStoryId === deleteConfirm.id) {
            setSelectedStory(null);
          }
          break;
      }
      setDeleteConfirm(null);
    }
  };
  
  const handleDuplicate = (storyId: string) => {
    const duplicated = duplicateStory(storyId);
    if (duplicated) {
      setSelectedStory(duplicated.id);
    }
  };

  return (
    <div className="w-full h-full bg-gray-50 border-r border-gray-200 flex flex-col">
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
                  <div className="hidden group-hover:flex items-center gap-0.5">
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
                      const collectionStories = stories.filter((s) => s.collectionId === collection.id);
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
                            }}
                          >
                            <ChevronIcon isOpen={isCollectionExpanded} />
                            <CollectionIcon />
                            <span className="flex-1 text-sm truncate">{collection.name}</span>
                            <div className="hidden group-hover:flex items-center gap-0.5">
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
                              {collectionStories.map((story) => (
                                <div
                                  key={story.id}
                                  className={`group flex items-center gap-1 p-1.5 rounded cursor-pointer hover:bg-gray-200 ${
                                    selectedStoryId === story.id ? 'bg-blue-100' : ''
                                  }`}
                                  onClick={() => setSelectedStory(story.id)}
                                >
                                  <DocumentIcon />
                                  <span className="flex-1 text-sm truncate">{story.name}</span>
                                  <div className="hidden group-hover:flex items-center gap-0.5">
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
                              ))}
                              {collectionStories.length === 0 && (
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
        }}
        title={`Edit ${editingItem?.type || ''}`}
        size="sm"
      >
        <Input
          label="Name"
          value={newItemName}
          onChange={(e) => setNewItemName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit()}
          autoFocus
        />
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="secondary" onClick={() => {
            setEditingItem(null);
            setNewItemName('');
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
