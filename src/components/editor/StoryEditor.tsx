import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import HardBreak from '@tiptap/extension-hard-break';
import Placeholder from '@tiptap/extension-placeholder';
import { UndoRedo } from '@tiptap/extensions';
import type { Editor } from '@tiptap/core';
import { useAppStore, useCompletionModelStore, useDataStore, useGenerationStore } from '../../stores';
import type { CompletionModelConfig, StorySection } from '../../types';
import { deriveFlatStoryContent } from '../../services/storySections';
import { streamSentenceCompletion } from '../../services/llmService';
import { createId } from '../../services/id';
import { CompletionPopup, type CompletionItem } from './CompletionPopup';
import { StoryDecorations } from './extensions';

function createSection(type: StorySection['type'], content = ''): StorySection {
  return {
    id: createId(),
    type,
    content,
    collapsed: false,
  };
}

function getFirstLine(text: string): string {
  const line = text.split(/\r?\n/, 1)[0] || '';
  return line.length > 0 ? line : ' ';
}

function isCollapsibleSection(content: string): boolean {
  return /\r?\n/.test(content);
}

function textToHtml(text: string): string {
  if (!text) return '<p></p>';
  const paragraphs = text.split(/\n\n+/);
  return paragraphs
    .map((p) => {
      const escaped = p
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      const withBreaks = escaped.replace(/\n/g, '<br>');
      return `<p>${withBreaks || '<br>'}</p>`;
    })
    .join('');
}

function SectionInlineEditor({
  sectionId,
  section,
  isGenerating,
  onChange,
  onFocus,
  onBlur,
  focusIndex,
  onEditorReady,
  onKeyDown,
  collapseThinkBlocks,
  onAltClickPosition,
}: {
  sectionId: string;
  section: StorySection;
  isGenerating: boolean;
  onChange: (content: string) => void;
  onFocus: () => void;
  onBlur?: (event: FocusEvent | null) => void;
  focusIndex?: number | null;
  onEditorReady: (sectionId: string, editor: Editor | null) => void;
  onKeyDown?: (editor: Editor, event: KeyboardEvent) => boolean;
  collapseThinkBlocks: boolean;
  onAltClickPosition?: (payload: { sectionId: string; charIndex: number; clientX: number; clientY: number }) => void;
}) {
  const editor = useEditor({
    extensions: [
      Document,
      Paragraph,
      Text,
      HardBreak,
      UndoRedo,
      Placeholder.configure({
        placeholder: section.type === 'assistant' ? 'Assistant response appears here…' : `Write ${section.type} content…`,
      }),
      StoryDecorations.configure({
        collapseThinkBlocks,
      }),
    ],
    content: textToHtml(section.content),
    editable: !isGenerating,
    onFocus,
    onBlur: ({ event }) => {
      onBlur?.(event as FocusEvent);
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getText({ blockSeparator: '\n\n' }));
    },
    editorProps: {
      handleKeyDown: (_view, event) => {
        if (editor && onKeyDown) {
          const handled = onKeyDown(editor, event as KeyboardEvent);
          if (handled) {
            event.preventDefault();
            event.stopPropagation();
            (event as KeyboardEvent).stopImmediatePropagation?.();
            return true;
          }
        }
        return false;
      },
      handleClick: (_view, _pos, event) => {
        if (!editor || !onAltClickPosition) return false;

        const mouseEvent = event as MouseEvent;
        if (!mouseEvent.altKey || mouseEvent.button !== 0) return false;

        let clickPos: number | null = null;

        if (typeof document.caretPositionFromPoint === 'function') {
          const caretPos = document.caretPositionFromPoint(mouseEvent.clientX, mouseEvent.clientY);
          if (caretPos) {
            try {
              clickPos = editor.view.posAtDOM(caretPos.offsetNode, caretPos.offset);
            } catch {
              clickPos = null;
            }
          }
        } else if (typeof (document as Document & { caretRangeFromPoint?: (x: number, y: number) => Range | null }).caretRangeFromPoint === 'function') {
          const caretRange = (document as Document & { caretRangeFromPoint: (x: number, y: number) => Range | null })
            .caretRangeFromPoint(mouseEvent.clientX, mouseEvent.clientY);
          if (caretRange) {
            try {
              clickPos = editor.view.posAtDOM(caretRange.startContainer, caretRange.startOffset);
            } catch {
              clickPos = null;
            }
          }
        }

        if (clickPos == null) {
          const coordsPos = editor.view.posAtCoords({ left: mouseEvent.clientX, top: mouseEvent.clientY });
          if (coordsPos) {
            clickPos = coordsPos.pos;
          }
        }

        if (clickPos == null) return false;

        const charIndex = editor.state.doc.textBetween(0, clickPos, '\n\n').length;
        const lineCoords = editor.view.coordsAtPos(clickPos);
        onAltClickPosition({
          sectionId,
          charIndex,
          clientX: lineCoords.left,
          clientY: lineCoords.top,
        });
        mouseEvent.preventDefault();
        mouseEvent.stopPropagation();
        return true;
      },
    },
  });

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!isGenerating);
  }, [editor, isGenerating]);

  useEffect(() => {
    if (!editor) return;
    const current = editor.getText({ blockSeparator: '\n\n' });
    if (current !== section.content) {
      editor.commands.setContent(textToHtml(section.content));
    }
  }, [editor, section.content]);

  useEffect(() => {
    if (!editor || focusIndex == null) return;
    const maxPos = editor.state.doc.content.size;
    const pos = Math.max(1, Math.min(maxPos, focusIndex + 1));
    editor.chain().focus().setTextSelection(pos).run();
  }, [editor, focusIndex]);

  useEffect(() => {
    onEditorReady(sectionId, editor ?? null);
    return () => {
      onEditorReady(sectionId, null);
    };
  }, [editor, onEditorReady, sectionId]);

  useEffect(() => {
    if (!editor || !onKeyDown) return;

    const editorDom = editor.view.dom;
    const handleCapture = (event: KeyboardEvent) => {
      const handled = onKeyDown(editor, event);
      if (!handled) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };

    editorDom.addEventListener('keydown', handleCapture, true);
    return () => {
      editorDom.removeEventListener('keydown', handleCapture, true);
    };
  }, [editor, onKeyDown]);

  return (
    <EditorContent
      editor={editor}
      className="section-inline-editor"
    />
  );
}

function SectionCollapsedPreview({ section }: { section: StorySection }) {
  const firstLine = getFirstLine(section.content);

  const editor = useEditor({
    extensions: [
      Document,
      Paragraph,
      Text,
      HardBreak,
      StoryDecorations,
    ],
    content: textToHtml(firstLine),
    editable: false,
  });

  useEffect(() => {
    if (!editor) return;
    const current = editor.getText({ blockSeparator: '\n\n' });
    if (current !== firstLine) {
      editor.commands.setContent(textToHtml(firstLine));
    }
  }, [editor, firstLine]);

  return (
    <EditorContent
      editor={editor}
      className="section-inline-editor section-collapsed-markdown"
    />
  );
}

const roleStyles: Record<StorySection['type'], string> = {
  system: 'border-amber-200 bg-amber-50',
  user: 'border-blue-200 bg-blue-50',
  assistant: 'border-emerald-200 bg-emerald-50',
};

export function StoryEditor() {
  const { stories, updateStory } = useDataStore();
  const { selectedStoryId, userCommandTemplate, setUserCommandTemplate } = useAppStore();
  const { isGenerating } = useGenerationStore();

  const selectedStory = stories.find((s) => s.id === selectedStoryId);

  const [showTemplateEditor, setShowTemplateEditor] = useState(false);
  const [templateDraft, setTemplateDraft] = useState('');
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [scrollNavSectionId, setScrollNavSectionId] = useState<string | null>(null);
  const [pendingCaret, setPendingCaret] = useState<{ sectionId: string; index: number } | null>(null);
  const [pendingRemoveSectionId, setPendingRemoveSectionId] = useState<string | null>(null);
  const [expandedThinkSectionIds, setExpandedThinkSectionIds] = useState<Set<string>>(new Set());
  const [historyTick, setHistoryTick] = useState(0);
  const [completionItems, setCompletionItems] = useState<CompletionItem[]>([]);
  const [completionVisible, setCompletionVisible] = useState(false);
  const [completionSelectedIndex, setCompletionSelectedIndex] = useState(0);
  const [completionPosition, setCompletionPosition] = useState({ top: 0, left: 0 });
  const [truncateMarker, setTruncateMarker] = useState<{
    sectionId: string;
    isThink: boolean;
    charIndex: number;
    x: number;
    y: number;
  } | null>(null);
  const truncateMarkerButtonRef = useRef<HTMLButtonElement | null>(null);
  const [scrollMetrics, setScrollMetrics] = useState({ scrollTop: 0, scrollHeight: 1, clientHeight: 1 });
  const [isScrollbarDragging, setIsScrollbarDragging] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const sectionEditorsRef = useRef<Map<string, Editor>>(new Map());
  const completionAbortControllers = useRef<Map<string, AbortController>>(new Map());
  const completionActiveRef = useRef(false);
  const completionItemsRef = useRef<CompletionItem[]>([]);
  const completionSelectedIndexRef = useRef(0);
  const completionEditorRef = useRef<Editor | null>(null);

  const getEnabledCompletionModels = useCompletionModelStore((s) => s.getEnabledModels);
  const accumulateCompletionCost = useCompletionModelStore((s) => s.accumulateCost);

  const sections = useMemo(() => selectedStory?.sections || [], [selectedStory?.sections]);

  const commitSections = (nextSections: StorySection[]) => {
    if (!selectedStory) return;
    updateStory(selectedStory.id, {
      sections: nextSections,
      content: deriveFlatStoryContent(nextSections),
      htmlContent: '',
    });
  };


  const updateSection = (sectionId: string, updates: Partial<StorySection>) => {
    if (!selectedStory) return;
    const nextSections = sections.map((section) =>
      section.id === sectionId ? { ...section, ...updates } : section
    );
    commitSections(nextSections);
  };

  const canRemoveSection = (section: StorySection) => {
    if (section.type === 'system') return false;

    if (section.type === 'user') {
      const userCount = sections.filter((s) => s.type === 'user').length;
      return userCount > 1;
    }

    if (section.type === 'assistant') {
      const assistantCount = sections.filter((s) => s.type === 'assistant').length;
      return assistantCount > 1;
    }

    return false;
  };

  const parseSectionKey = (sectionKey: string) => {
    if (sectionKey.endsWith(':think')) {
      return { sectionId: sectionKey.slice(0, -':think'.length), isThink: true };
    }
    return { sectionId: sectionKey, isThink: false };
  };

  const canDeleteFollowingSections = (sectionId: string) => {
    const index = sections.findIndex((section) => section.id === sectionId);
    return index >= 0 && index < sections.length - 1;
  };

  const removeSection = (sectionId: string) => {
    if (!selectedStory) return;

    const target = sections.find((section) => section.id === sectionId);
    if (!target || !canRemoveSection(target)) return;

    const nextSections = sections.filter((section) => section.id !== sectionId);
    commitSections(nextSections);

    if (activeSectionId === sectionId || activeSectionId === `${sectionId}:think`) {
      setActiveSectionId(null);
    }
    if (pendingCaret?.sectionId === sectionId) {
      setPendingCaret(null);
    }
    if (pendingRemoveSectionId === sectionId) {
      setPendingRemoveSectionId(null);
    }
    if (expandedThinkSectionIds.has(sectionId)) {
      setExpandedThinkSectionIds((prev) => {
        const next = new Set(prev);
        next.delete(sectionId);
        return next;
      });
    }
  };

  const deleteFollowingSections = (sectionId: string) => {
    if (!selectedStory) return;

    const index = sections.findIndex((section) => section.id === sectionId);
    if (index < 0 || index >= sections.length - 1) return;

    const nextSections = sections.slice(0, index + 1);
    const keptSectionIds = new Set(nextSections.map((section) => section.id));

    commitSections(nextSections);

    if (
      activeSectionId
      && !keptSectionIds.has(activeSectionId)
      && !keptSectionIds.has(activeSectionId.replace(':think', ''))
    ) {
      setActiveSectionId(sectionId);
    }

    if (pendingCaret && !keptSectionIds.has(pendingCaret.sectionId)) {
      setPendingCaret(null);
    }

    if (pendingRemoveSectionId && !keptSectionIds.has(pendingRemoveSectionId)) {
      setPendingRemoveSectionId(null);
    }

    setExpandedThinkSectionIds((prev) => {
      const next = new Set<string>();
      for (const id of prev) {
        if (keptSectionIds.has(id)) next.add(id);
      }
      return next;
    });
  };

  const deleteAfterTextPosition = useCallback(() => {
    if (!truncateMarker || !selectedStory) return;

    const markerBaseId = truncateMarker.sectionId;
    const sectionIndex = sections.findIndex((section) => section.id === markerBaseId);
    if (sectionIndex < 0) {
      setTruncateMarker(null);
      return;
    }

    const targetSection = sections[sectionIndex];
    const nextSections = sections.slice(0, sectionIndex + 1).map((section) => ({ ...section }));
    const targetCopy = nextSections[sectionIndex];

    if (truncateMarker.isThink) {
      const thinking = targetSection.thinkingContent || '';
      targetCopy.thinkingContent = thinking.slice(0, truncateMarker.charIndex);
      targetCopy.content = '';
    } else {
      targetCopy.content = targetSection.content.slice(0, truncateMarker.charIndex);
    }

    const keptSectionIds = new Set(nextSections.map((section) => section.id));
    commitSections(nextSections);
    setTruncateMarker(null);

    if (
      activeSectionId
      && !keptSectionIds.has(activeSectionId)
      && !keptSectionIds.has(activeSectionId.replace(':think', ''))
    ) {
      setActiveSectionId(targetSection.id);
    }

    if (pendingCaret && !keptSectionIds.has(pendingCaret.sectionId)) {
      setPendingCaret(null);
    }

    if (pendingRemoveSectionId && !keptSectionIds.has(pendingRemoveSectionId)) {
      setPendingRemoveSectionId(null);
    }

    setExpandedThinkSectionIds((prev) => {
      const next = new Set<string>();
      for (const id of prev) {
        if (keptSectionIds.has(id)) next.add(id);
      }
      return next;
    });
  }, [activeSectionId, commitSections, pendingCaret, pendingRemoveSectionId, sections, selectedStory, truncateMarker]);

  useEffect(() => {
    if (!truncateMarker) return;

    const exists = sections.some((section) => section.id === truncateMarker.sectionId);
    if (!exists) {
      setTruncateMarker(null);
    }
  }, [sections, truncateMarker]);

  useEffect(() => {
    if (!truncateMarker) return;

    const handleDocumentMouseDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (truncateMarkerButtonRef.current?.contains(target)) return;
      setTruncateMarker(null);
    };

    document.addEventListener('mousedown', handleDocumentMouseDown);
    return () => {
      document.removeEventListener('mousedown', handleDocumentMouseDown);
    };
  }, [truncateMarker]);

  const toggleThinkCollapsed = (sectionId: string) => {
    setExpandedThinkSectionIds((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  };

  const findInsertAnchorIndex = (afterSectionId?: string): number => {
    if (sections.length === 0) return -1;

    const requestedIndex = afterSectionId ? sections.findIndex((section) => section.id === afterSectionId) : -1;
    const startIndex = requestedIndex >= 0 ? requestedIndex : sections.length - 1;

    for (let index = startIndex; index >= 0; index -= 1) {
      if (sections[index].type === 'assistant') return index;
    }

    return sections.length - 1;
  };

  const insertUserTurn = useCallback((defaultText = '', afterSectionId?: string) => {
    if (!selectedStory) return;

    const anchorKey = afterSectionId || activeSectionId || undefined;
    const normalizedAnchor = anchorKey?.endsWith(':think') ? anchorKey.slice(0, -':think'.length) : anchorKey;
    const anchorIndex = findInsertAnchorIndex(normalizedAnchor);
    const userSection = createSection('user', defaultText);
    const assistantSection = createSection('assistant', '');

    const nextSections = [...sections];
    nextSections.splice(anchorIndex + 1, 0, userSection, assistantSection);
    commitSections(nextSections);

    setActiveSectionId(userSection.id);
    return { userSectionId: userSection.id, assistantSectionId: assistantSection.id };
  }, [activeSectionId, commitSections, findInsertAnchorIndex, sections, selectedStory]);

  const resolveTemplate = useCallback(() => {
    const cursorMarker = '{cursor}';
    let resolved = userCommandTemplate || cursorMarker;
    resolved = resolved.replace(/\\n/g, '\n');

    const cursorIndex = resolved.indexOf(cursorMarker);
    const text = resolved.replace(cursorMarker, '');

    return { text, cursorIndex: cursorIndex >= 0 ? cursorIndex : text.length };
  }, [userCommandTemplate]);

  const handleCreateUserTurn = useCallback(() => {
    const resolved = resolveTemplate();
    const inserted = insertUserTurn(resolved.text);
    if (!inserted) return;

    setPendingCaret({ sectionId: inserted.userSectionId, index: resolved.cursorIndex });
    requestAnimationFrame(() => {
      const sectionElement = document.querySelector(`[data-section-id="${inserted.userSectionId}"]`);
      sectionElement?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }, [insertUserTurn, resolveTemplate]);

  useEffect(() => {
    if (!pendingCaret) return;
    const sectionStillExists = sections.some((section) => section.id === pendingCaret.sectionId);
    if (!sectionStillExists) {
      setPendingCaret(null);
    }
  }, [pendingCaret, sections]);

  useEffect(() => {
    if (!pendingRemoveSectionId) return;
    const stillExists = sections.some((section) => section.id === pendingRemoveSectionId);
    if (!stillExists) {
      setPendingRemoveSectionId(null);
    }
  }, [pendingRemoveSectionId, sections]);

  const handleEditorReady = useCallback((sectionId: string, editor: Editor | null) => {
    const current = sectionEditorsRef.current.get(sectionId) ?? null;
    if (current === editor) return;

    if (editor) {
      sectionEditorsRef.current.set(sectionId, editor);
    } else {
      sectionEditorsRef.current.delete(sectionId);
    }
    setHistoryTick((t) => t + 1);
  }, []);

  const activeEditor = useMemo(() => {
    if (activeSectionId) {
      const byActive = sectionEditorsRef.current.get(activeSectionId);
      if (byActive) return byActive;
    }
    for (const section of sections) {
      const editor = sectionEditorsRef.current.get(section.id);
      if (editor) return editor;
    }
    return null;
  }, [activeSectionId, sections, historyTick]);

  const canUndo = !!activeEditor?.can().undo();
  const canRedo = !!activeEditor?.can().redo();

  const normalizedActiveSectionId = activeSectionId?.endsWith(':think')
    ? activeSectionId.slice(0, -':think'.length)
    : activeSectionId;

  const navigationAnchorSectionId = scrollNavSectionId && sections.some((section) => section.id === scrollNavSectionId)
    ? scrollNavSectionId
    : normalizedActiveSectionId;

  const navigationAnchorIndex = navigationAnchorSectionId
    ? sections.findIndex((section) => section.id === navigationAnchorSectionId)
    : -1;

  const previousSectionId = navigationAnchorIndex > 0
    ? sections[navigationAnchorIndex - 1].id
    : null;

  const nextSectionId = navigationAnchorIndex >= 0 && navigationAnchorIndex < sections.length - 1
    ? sections[navigationAnchorIndex + 1].id
    : navigationAnchorIndex < 0 && sections.length > 0
      ? sections[0].id
    : null;

  const scrollSectionToTop = useCallback((sectionId: string) => {
    const sectionElement = document.querySelector(`[data-section-id="${sectionId}"]`);
    sectionElement?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setScrollNavSectionId(sectionId);
  }, []);

  const handleFocusPreviousSection = useCallback(() => {
    if (!previousSectionId) return;
    scrollSectionToTop(previousSectionId);
  }, [previousSectionId, scrollSectionToTop]);

  const handleFocusNextSection = useCallback(() => {
    if (!nextSectionId) return;
    scrollSectionToTop(nextSectionId);
  }, [nextSectionId, scrollSectionToTop]);

  const focusLastSectionEditorAtEnd = useCallback(() => {
    for (let index = sections.length - 1; index >= 0; index -= 1) {
      const sectionId = sections[index].id;
      const editor = sectionEditorsRef.current.get(sectionId);
      if (!editor) continue;

      editor.chain().focus('end').run();
      setActiveSectionId(sectionId);
      setHistoryTick((tick) => tick + 1);

      requestAnimationFrame(() => {
        const sectionElement = document.querySelector(`[data-section-id="${sectionId}"]`);
        sectionElement?.scrollIntoView({ behavior: 'smooth', block: 'end' });
      });
      return;
    }
  }, [sections]);

  useEffect(() => {
    const handleFocusLastSection = () => {
      focusLastSectionEditorAtEnd();
    };

    window.addEventListener('goonwriter:focus-last-section-end', handleFocusLastSection);
    return () => {
      window.removeEventListener('goonwriter:focus-last-section-end', handleFocusLastSection);
    };
  }, [focusLastSectionEditorAtEnd]);

  const updateScrollMetrics = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    setScrollMetrics({
      scrollTop: container.scrollTop,
      scrollHeight: container.scrollHeight,
      clientHeight: container.clientHeight,
    });
  }, []);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const onScroll = () => updateScrollMetrics();
    onScroll();
    container.addEventListener('scroll', onScroll, { passive: true });

    const resizeObserver = new ResizeObserver(() => updateScrollMetrics());
    resizeObserver.observe(container);
    const content = container.firstElementChild;
    if (content instanceof HTMLElement) {
      resizeObserver.observe(content);
    }

    window.addEventListener('resize', onScroll);

    return () => {
      container.removeEventListener('scroll', onScroll);
      resizeObserver.disconnect();
      window.removeEventListener('resize', onScroll);
    };
  }, [sections, updateScrollMetrics]);

  const maxScrollTop = Math.max(0, scrollMetrics.scrollHeight - scrollMetrics.clientHeight);
  const thumbHeight = maxScrollTop > 0
    ? Math.max(48, (scrollMetrics.clientHeight / scrollMetrics.scrollHeight) * scrollMetrics.clientHeight)
    : scrollMetrics.clientHeight;
  const maxThumbTop = Math.max(0, scrollMetrics.clientHeight - thumbHeight);
  const thumbTop = maxScrollTop > 0
    ? (scrollMetrics.scrollTop / maxScrollTop) * maxThumbTop
    : 0;

  const handleScrollbarTrackMouseDown = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const container = scrollContainerRef.current;
    if (!container || maxScrollTop <= 0) return;

    const trackRect = event.currentTarget.getBoundingClientRect();
    const clickY = event.clientY - trackRect.top;
    const targetThumbTop = Math.max(0, Math.min(maxThumbTop, clickY - thumbHeight / 2));
    const targetScrollTop = (targetThumbTop / Math.max(1, maxThumbTop)) * maxScrollTop;
    container.scrollTop = targetScrollTop;
  }, [maxScrollTop, maxThumbTop, thumbHeight]);

  const handleScrollbarThumbMouseDown = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const container = scrollContainerRef.current;
    if (!container || maxScrollTop <= 0) return;

    event.preventDefault();
    event.stopPropagation();
    setIsScrollbarDragging(true);

    const startY = event.clientY;
    const startScrollTop = container.scrollTop;
    const thumbTravel = Math.max(1, maxThumbTop);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaY = moveEvent.clientY - startY;
      const scrollDelta = (deltaY / thumbTravel) * maxScrollTop;
      container.scrollTop = Math.max(0, Math.min(maxScrollTop, startScrollTop + scrollDelta));
    };

    const handleMouseUp = () => {
      setIsScrollbarDragging(false);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [maxScrollTop, maxThumbTop]);

  useEffect(() => {
    if (!normalizedActiveSectionId) return;
    setScrollNavSectionId(null);
  }, [normalizedActiveSectionId]);

  const cancelCompletions = useCallback((options?: { refocusEditor?: boolean }) => {
    const editorToRefocus = options?.refocusEditor ? completionEditorRef.current : null;

    completionAbortControllers.current.forEach((controller) => controller.abort());
    completionAbortControllers.current.clear();
    completionActiveRef.current = false;
    setCompletionVisible(false);
    setCompletionItems([]);
    setCompletionSelectedIndex(0);

    if (editorToRefocus) {
      requestAnimationFrame(() => {
        editorToRefocus.chain().focus().run();
      });
    }

    completionEditorRef.current = null;
  }, []);

  const acceptCompletion = useCallback((index: number) => {
    const item = completionItemsRef.current[index];
    const editor = completionEditorRef.current;
    if (!item || !item.text || !editor) return;

    cancelCompletions();
    editor.chain().focus().insertContent(item.text).run();
  }, [cancelCompletions]);

  const startCompletionRequests = useCallback((editor: Editor) => {
    if (isGenerating) return;

    const enabledModels = getEnabledCompletionModels();
    if (enabledModels.length === 0) return;

    const from = editor.state.selection.from;
    const textBeforeCursor = editor.state.doc.textBetween(0, from, '\n\n');
    const defaultContextLen = 1000;
    const contextLength = enabledModels[0]?.contextLength || defaultContextLen;
    const context = textBeforeCursor.slice(-contextLength);
    if (!context.trim()) return;

    cancelCompletions();
    completionActiveRef.current = true;
    completionEditorRef.current = editor;

    const coords = editor.view.coordsAtPos(from);
    setCompletionPosition({ top: coords.bottom + 4, left: coords.left });
    setCompletionSelectedIndex(0);

    const initialItems: CompletionItem[] = enabledModels.map((model) => ({
      modelId: model.id,
      modelName: model.name,
      text: '',
      isLoading: true,
    }));
    setCompletionItems(initialItems);
    setCompletionVisible(true);

    enabledModels.forEach((model: CompletionModelConfig) => {
      const controller = new AbortController();
      completionAbortControllers.current.set(model.id, controller);

      streamSentenceCompletion(model, context, {
        onChunk: (fullText) => {
          if (!completionActiveRef.current) return;
          setCompletionItems((prev) =>
            prev.map((item) =>
              item.modelId === model.id
                ? { ...item, text: fullText }
                : item
            )
          );
        },
        onUsage: (usage) => {
          accumulateCompletionCost(model.id, usage.cost || 0, usage.total_tokens || 0);
        },
        onError: (error) => {
          if (!completionActiveRef.current) return;
          setCompletionItems((prev) =>
            prev.map((item) =>
              item.modelId === model.id
                ? { ...item, isLoading: false, error }
                : item
            )
          );
        },
        onComplete: (finalText) => {
          if (!completionActiveRef.current) return;
          setCompletionItems((prev) =>
            prev.map((item) =>
              item.modelId === model.id
                ? { ...item, text: finalText, isLoading: false }
                : item
            )
          );
        },
      }, controller.signal)
        .finally(() => {
          completionAbortControllers.current.delete(model.id);
        });
    });
  }, [accumulateCompletionCost, cancelCompletions, getEnabledCompletionModels, isGenerating]);

  const handleCompletionKeyDown = useCallback((editor: Editor, event: KeyboardEvent): boolean => {
    if (completionActiveRef.current) {
      if (event.key === 'Escape' || event.key === 'Esc') {
        cancelCompletions({ refocusEditor: true });
        return true;
      }
      if (event.key === 'ArrowDown') {
        setCompletionSelectedIndex((prev) =>
          prev < completionItemsRef.current.length - 1 ? prev + 1 : 0
        );
        return true;
      }
      if (event.key === 'ArrowUp') {
        setCompletionSelectedIndex((prev) =>
          prev > 0 ? prev - 1 : completionItemsRef.current.length - 1
        );
        return true;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        acceptCompletion(completionSelectedIndexRef.current);
        return true;
      }
      return false;
    }

    if (event.key === 'Tab' && !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey) {
      startCompletionRequests(editor);
      return true;
    }

    return false;
  }, [acceptCompletion, cancelCompletions, startCompletionRequests]);

  useEffect(() => {
    completionItemsRef.current = completionItems;
  }, [completionItems]);

  useEffect(() => {
    completionSelectedIndexRef.current = completionSelectedIndex;
  }, [completionSelectedIndex]);

  useEffect(() => {
    const handleMouseDown = (event: MouseEvent) => {
      if (!completionActiveRef.current) return;
      const popup = document.querySelector('.completion-popup');
      if (popup && !popup.contains(event.target as Node)) {
        cancelCompletions();
      }
    };

    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [cancelCompletions]);

  useEffect(() => {
    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      if (!completionActiveRef.current) return;

      if (event.key === 'Escape' || event.key === 'Esc') {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        cancelCompletions({ refocusEditor: true });
        return;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        setCompletionSelectedIndex((prev) =>
          prev < completionItemsRef.current.length - 1 ? prev + 1 : 0
        );
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        setCompletionSelectedIndex((prev) =>
          prev > 0 ? prev - 1 : completionItemsRef.current.length - 1
        );
        return;
      }

      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        acceptCompletion(completionSelectedIndexRef.current);
      }
    };

    document.addEventListener('keydown', handleGlobalKeyDown, true);
    return () => document.removeEventListener('keydown', handleGlobalKeyDown, true);
  }, [acceptCompletion, cancelCompletions]);

  const handleEditorBlur = useCallback((event: FocusEvent | null) => {
    if (!completionActiveRef.current) return;

    const nextTarget = (event?.relatedTarget as Node | null) ?? null;
    const popup = document.querySelector('.completion-popup');
    const movedIntoPopup = !!(nextTarget && popup && popup.contains(nextTarget));
    if (movedIntoPopup) return;

    cancelCompletions({ refocusEditor: !nextTarget });
  }, [cancelCompletions]);

  useEffect(() => {
    return () => {
      cancelCompletions();
    };
  }, [cancelCompletions]);

  useEffect(() => {
    cancelCompletions();
  }, [selectedStoryId, cancelCompletions]);

  if (!selectedStory) {
    return (
      <div className="flex-1 flex items-center justify-center bg-white">
        <div className="text-center text-gray-400">
          <svg className="w-16 h-16 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <p className="text-lg">Select a story to start writing</p>
          <p className="text-sm mt-2">Or create a new one using the sidebar</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-white overflow-hidden">
      <div className="px-6 py-3 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-gray-800">{selectedStory.name}</h1>
          <div className="flex items-center gap-1 ml-2">
            <button
              onClick={() => {
                if (!activeEditor) return;
                activeEditor.chain().focus().undo().run();
                setHistoryTick((t) => t + 1);
              }}
              disabled={!canUndo || isGenerating}
              className="p-1.5 rounded text-gray-500 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Undo (Ctrl+Z)"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a5 5 0 015 5v2M3 10l4-4M3 10l4 4" />
              </svg>
            </button>
            <button
              onClick={() => {
                if (!activeEditor) return;
                activeEditor.chain().focus().redo().run();
                setHistoryTick((t) => t + 1);
              }}
              disabled={!canRedo || isGenerating}
              className="p-1.5 rounded text-gray-500 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Redo (Ctrl+Y)"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 10H11a5 5 0 00-5 5v2M21 10l-4-4M21 10l-4 4" />
              </svg>
            </button>
            <button
              type="button"
              onClick={handleCreateUserTurn}
              className="px-2 py-1 text-xs rounded border border-gray-300 text-gray-600 hover:bg-gray-100"
              title="Create new user section + following assistant section from template"
            >
              New User Turn
            </button>
            <button
              onClick={() => {
                setTemplateDraft(userCommandTemplate);
                setShowTemplateEditor(true);
              }}
              className="p-1.5 rounded text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
              title="Configure user command template"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </div>
        </div>
        {isGenerating && (
          <span className="text-sm text-blue-600 flex items-center gap-2">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Generating...
          </span>
        )}
      </div>

      <div className="flex-1 min-h-0 relative">
        <div ref={scrollContainerRef} className="h-full min-h-0 overflow-y-auto story-scroll-container">
          <CompletionPopup
            items={completionItems}
            position={completionPosition}
            selectedIndex={completionSelectedIndex}
            onSelect={acceptCompletion}
            visible={completionVisible}
          />

          <div className="max-w-4xl mx-auto px-6 py-4 pr-20 space-y-3">
            {sections.map((section) => (
              <div
                key={section.id}
                id={section.type === 'assistant' ? `assistant-section-${section.id}` : undefined}
                data-section-id={section.id}
                className={`rounded-lg border ${roleStyles[section.type]}`}
              >
              {(() => {
                const collapsible = isCollapsibleSection(section.content);
                const effectiveCollapsed = collapsible && section.collapsed;
                const hasThinkSubsection = section.type === 'assistant';
                const thinkCollapsed = hasThinkSubsection && !expandedThinkSectionIds.has(section.id);
                const thinkingText = (section.thinkingContent || '').trim();
                const hasThinkingContent = thinkingText.length > 0;

                return (
                  <>
              <div className="px-3 py-2 flex items-center justify-between border-b border-black/10">
                <span className="text-xs font-semibold uppercase tracking-wide text-gray-700">{section.type}</span>
                <div className="flex items-center gap-2">
                  {collapsible && (
                    <button
                      onClick={() => updateSection(section.id, { collapsed: !section.collapsed })}
                      className="inline-flex items-center gap-1.5 rounded-md border border-black/10 bg-white/70 px-2 py-1 text-xs text-gray-700 hover:bg-white"
                      title={effectiveCollapsed ? 'Expand section' : 'Collapse section'}
                    >
                      <svg className={`h-3.5 w-3.5 transition-transform ${effectiveCollapsed ? '' : 'rotate-180'}`} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                        <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.94a.75.75 0 011.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                      </svg>
                      {effectiveCollapsed ? 'Expand' : 'Collapse'}
                    </button>
                  )}

                  {collapsible && <div className="mx-1 h-4 w-px bg-black/10" />}

                  {pendingRemoveSectionId === section.id ? (
                    <>
                      <button
                        onClick={() => removeSection(section.id)}
                        className="inline-flex items-center gap-1.5 rounded-md border border-red-300 bg-red-50 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
                        disabled={!canRemoveSection(section) || isGenerating}
                        title="Confirm remove section"
                      >
                        <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                          <path fillRule="evenodd" d="M16.704 5.29a1 1 0 010 1.42l-7.996 8a1 1 0 01-1.415 0L3.296 10.71a1 1 0 011.415-1.42L8 12.586l7.289-7.296a1 1 0 011.415 0z" clipRule="evenodd" />
                        </svg>
                        Confirm
                      </button>
                      <button
                        onClick={() => setPendingRemoveSectionId(null)}
                        className="inline-flex items-center rounded-md border border-black/10 bg-white/70 px-2 py-1 text-xs text-gray-600 hover:bg-white"
                        title="Cancel remove"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => {
                          if (!canDeleteFollowingSections(section.id)) return;
                          if (confirm('Delete all sections after this one?')) {
                            deleteFollowingSections(section.id);
                          }
                        }}
                        className="inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-white/70 px-2 py-1 text-xs text-amber-800 hover:bg-amber-50 disabled:border-gray-200 disabled:text-gray-300 disabled:hover:bg-white/70"
                        disabled={!canDeleteFollowingSections(section.id) || isGenerating}
                        title={canDeleteFollowingSections(section.id) ? 'Delete all sections after this one' : 'No following sections'}
                      >
                        <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                          <path d="M3.5 4.75A.75.75 0 014.25 4h11.5a.75.75 0 010 1.5H4.25a.75.75 0 01-.75-.75zm2.75 3a.75.75 0 01.75.75v6a.75.75 0 01-1.5 0v-6a.75.75 0 01.75-.75zm4.5 0a.75.75 0 01.75.75v6a.75.75 0 01-1.5 0v-6a.75.75 0 01.75-.75zm4.5 0a.75.75 0 01.75.75v6a.75.75 0 01-1.5 0v-6a.75.75 0 01.75-.75z" />
                          <path d="M2.5 16a.75.75 0 01.75-.75h13.5a.75.75 0 010 1.5H3.25A.75.75 0 012.5 16z" />
                        </svg>
                        Delete Following
                      </button>
                      <button
                        onClick={() => setPendingRemoveSectionId(section.id)}
                        className="inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-white/70 px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:border-gray-200 disabled:text-gray-300 disabled:hover:bg-white/70"
                        disabled={!canRemoveSection(section) || isGenerating}
                        title={canRemoveSection(section) ? 'Remove section' : 'Cannot remove the last section of this type'}
                      >
                        <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                          <path fillRule="evenodd" d="M8.257 3.099c.366-.446.92-.707 1.5-.707h.486c.58 0 1.134.261 1.5.707l.633.773h2.624a.75.75 0 010 1.5h-.73l-.565 9.03a2 2 0 01-1.997 1.875H8.292a2 2 0 01-1.997-1.875l-.565-9.03H5a.75.75 0 010-1.5h2.624l.633-.773zM9 8.25a.75.75 0 011.5 0v5a.75.75 0 01-1.5 0v-5zm3 0a.75.75 0 011.5 0v5a.75.75 0 01-1.5 0v-5z" clipRule="evenodd" />
                        </svg>
                        Remove
                      </button>
                    </>
                  )}
                </div>
              </div>

              {effectiveCollapsed ? (
                <div
                  className="px-3 py-2 cursor-pointer"
                  onClick={() => updateSection(section.id, { collapsed: false })}
                  title="Click to expand section"
                >
                  <SectionCollapsedPreview section={section} />
                </div>
              ) : (
                <div className="px-3 py-2">
                  {section.type === 'assistant' && (
                    <div className="mb-3 rounded-md border border-violet-200 bg-violet-50/50">
                      <div
                        className={`px-3 py-2 flex items-center justify-between ${thinkCollapsed ? 'cursor-pointer hover:bg-violet-100/40' : ''} ${thinkCollapsed ? '' : 'border-b border-violet-200/70'}`}
                        onClick={thinkCollapsed ? () => toggleThinkCollapsed(section.id) : undefined}
                        title={thinkCollapsed ? 'Click to expand thinking subsection' : undefined}
                      >
                        <div className="inline-flex items-center gap-2">
                          <span className="text-[11px] font-semibold uppercase tracking-wide text-violet-700">Thinking</span>
                          {thinkCollapsed && (
                            !hasThinkingContent  && <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium tracking-normal normal-case bg-gray-100 text-gray-600 border border-gray-200">
                                Empty
                            </span>
                          )}
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleThinkCollapsed(section.id);
                          }}
                          className="inline-flex items-center gap-1 rounded-md border border-violet-200 bg-white/80 px-2 py-0.5 text-[11px] text-violet-700 hover:bg-white"
                          title={thinkCollapsed ? 'Expand thinking subsection' : 'Collapse thinking subsection'}
                        >
                          {thinkCollapsed ? 'Expand' : 'Collapse'}
                        </button>
                      </div>

                      {thinkCollapsed ? (
                        <div className="h-0" aria-hidden="true" />
                      ) : (
                        <div className="px-3 py-2">
                          <SectionInlineEditor
                            sectionId={`${section.id}:think`}
                            section={{
                              ...section,
                              content: section.thinkingContent || '',
                            }}
                            isGenerating={isGenerating}
                            onFocus={() => {
                              setActiveSectionId(`${section.id}:think`);
                              setHistoryTick((t) => t + 1);
                            }}
                            onBlur={handleEditorBlur}
                            onChange={(content) => updateSection(section.id, { thinkingContent: content })}
                            onEditorReady={handleEditorReady}
                            onKeyDown={handleCompletionKeyDown}
                            collapseThinkBlocks={false}
                            onAltClickPosition={({ sectionId, charIndex, clientX, clientY }) => {
                              const parsed = parseSectionKey(sectionId);
                              setTruncateMarker({
                                sectionId: parsed.sectionId,
                                isThink: parsed.isThink,
                                charIndex,
                                x: clientX,
                                y: clientY,
                              });
                            }}
                          />
                        </div>
                      )}
                    </div>
                  )}

                  <SectionInlineEditor
                    sectionId={section.id}
                    section={section}
                    isGenerating={isGenerating}
                    onFocus={() => {
                      setActiveSectionId(section.id);
                      setHistoryTick((t) => t + 1);
                      if (pendingCaret?.sectionId === section.id) {
                        setPendingCaret(null);
                      }
                    }}
                    onBlur={handleEditorBlur}
                    onChange={(content) => updateSection(section.id, { content })}
                    focusIndex={pendingCaret?.sectionId === section.id ? pendingCaret.index : null}
                    onEditorReady={handleEditorReady}
                    onKeyDown={handleCompletionKeyDown}
                    collapseThinkBlocks={false}
                    onAltClickPosition={({ sectionId, charIndex, clientX, clientY }) => {
                      const parsed = parseSectionKey(sectionId);
                      setTruncateMarker({
                        sectionId: parsed.sectionId,
                        isThink: parsed.isThink,
                        charIndex,
                        x: clientX,
                        y: clientY,
                      });
                    }}
                  />
                </div>
              )}
                  </>
                );
              })()}
              </div>
            ))}
          </div>
        </div>

        {truncateMarker && (
          <button
            ref={truncateMarkerButtonRef}
            type="button"
            onClick={deleteAfterTextPosition}
            className="fixed z-30 w-5 h-5 rounded-full bg-red-600 text-white text-[10px] leading-none flex items-center justify-center shadow-md hover:bg-red-700 cursor-pointer"
            style={{ left: truncateMarker.x + 8, top: truncateMarker.y - 24 }}
            title="Delete all text after this position"
            aria-label="Delete all text after this position"
          >
            ✂
          </button>
        )}

        <div
          className="absolute top-2 bottom-2 right-1 z-20 w-8 flex items-center justify-center"
          onMouseDown={handleScrollbarTrackMouseDown}
        >
          <div className="story-custom-scrollbar-track">
            <div
              className={`story-custom-scrollbar-thumb ${isScrollbarDragging ? 'is-dragging' : ''}`}
              style={{ height: `${Math.max(24, thumbHeight)}px`, transform: `translateY(${thumbTop}px)` }}
              onMouseDown={handleScrollbarThumbMouseDown}
            />
          </div>
        </div>

        <div className="absolute right-12 top-1/2 -translate-y-1/2 z-20 flex flex-col gap-2">
          <button
            type="button"
            onClick={handleFocusPreviousSection}
            disabled={!previousSectionId}
            className="w-8 h-8 inline-flex items-center justify-center rounded-full border border-gray-300 bg-white text-gray-700 shadow-sm hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
            title="Focus previous section"
            aria-label="Focus previous section"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
            </svg>
          </button>
          <button
            type="button"
            onClick={handleFocusNextSection}
            disabled={!nextSectionId}
            className="w-8 h-8 inline-flex items-center justify-center rounded-full border border-gray-300 bg-white text-gray-700 shadow-sm hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
            title="Focus next section"
            aria-label="Focus next section"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </div>

      <div className="px-6 py-2 border-t border-gray-200 bg-gray-50 text-xs text-gray-600 flex items-center justify-between">
        <div>
          <span className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-gray-400"></span>
            Structured story sections enabled
          </span>
        </div>
        <div className="flex items-center gap-3">
          {(selectedStory.totalCost > 0 || selectedStory.totalTokens > 0) && (
            <div className="text-gray-400 font-mono" title="Accumulated generation cost and tokens for this story">
              {selectedStory.totalTokens.toLocaleString()} tokens |
              {selectedStory.totalCost > 0 && (
                <span className="ml-2">{selectedStory.totalCost < 0.1 ? `${(selectedStory.totalCost * 100).toFixed(3)}¢` : `$${selectedStory.totalCost.toFixed(3)}`}</span>
              )}
            </div>
          )}
        </div>
      </div>

      {showTemplateEditor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setShowTemplateEditor(false)}>
          <div className="bg-white rounded-lg shadow-xl w-[480px] p-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">User Command Template</h3>
            <p className="text-xs text-gray-500 mb-3">
              Use <code className="bg-gray-100 px-1 rounded">{'{cursor}'}</code> to mark where cursor should land. Use <code className="bg-gray-100 px-1 rounded">\n</code> for newlines.
            </p>
            <p className="text-xs text-gray-500 mb-3">
              Raw prompt placeholders are resolved at generation time: <code className="bg-gray-100 px-1 rounded">{'{summaries}'}</code> inserts all chapter summaries, <code className="bg-gray-100 px-1 rounded">{'{cs}'}</code> inserts the current chapter summary and advances, and <code className="bg-gray-100 px-1 rounded">{'{cn}'}</code> inserts the current chapter number.
            </p>
            <textarea
              value={templateDraft}
              onChange={(e) => setTemplateDraft(e.target.value)}
              className="w-full h-32 px-3 py-2 text-sm font-mono border border-gray-300 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500 resize-none"
              spellCheck={false}
            />
            <div className="flex justify-between items-center mt-3">
              <button onClick={() => setTemplateDraft('{cursor}')} className="text-xs text-gray-500 hover:text-gray-700 underline">
                Reset to default
              </button>
              <div className="flex gap-2">
                <button onClick={() => setShowTemplateEditor(false)} className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-md">
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setUserCommandTemplate(templateDraft);
                    setShowTemplateEditor(false);
                  }}
                  className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
