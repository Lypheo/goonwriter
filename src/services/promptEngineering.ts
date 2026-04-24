import type { Story, StorySection, WritingPlan, WritingPlanChapter } from '../types';

export const PLAN_SUMMARY_START = '[SUMMARY]';
export const PLAN_SUMMARY_END = '[/SUMMARY]';
export const PLAN_CHAPTERS_START = '[CHAPTERS]';
export const PLAN_CHAPTERS_END = '[/CHAPTERS]';

const chapterTagRegex = /^\s*\[CHAPTER\s+(\d+)(?:\s*:\s*([^\]]+))?\]\s*$/i;
const standaloneVariableRegex = /^\s*\[\[\s*([a-zA-Z0-9_\-.]+)\s*\]\]\s*$/;

export type VariableMode = 'expanded-mutable' | 'expanded-immutable' | 'unexpanded';

export interface CanonicalWritingPlanSource {
  plan: WritingPlan;
  sectionIndex: number;
}

export function parseWritingPlanFromText(content: string): WritingPlan | null {
  const summaryStart = content.indexOf(PLAN_SUMMARY_START);
  const summaryEnd = content.indexOf(PLAN_SUMMARY_END);
  const chaptersStart = content.indexOf(PLAN_CHAPTERS_START);
  const chaptersEnd = content.indexOf(PLAN_CHAPTERS_END);

  if (summaryStart === -1 || summaryEnd === -1 || chaptersStart === -1 || chaptersEnd === -1) {
    return null;
  }

  if (summaryEnd <= summaryStart || chaptersEnd <= chaptersStart) {
    return null;
  }

  const rawSummaryBlock = content.slice(summaryStart + PLAN_SUMMARY_START.length, summaryEnd).trim();
  const rawChaptersBlock = content.slice(chaptersStart + PLAN_CHAPTERS_START.length, chaptersEnd).trim();

  if (!rawSummaryBlock || !rawChaptersBlock) {
    return null;
  }

  const chapters = parseChapterBlock(rawChaptersBlock);
  if (chapters.length === 0) {
    return null;
  }

  return {
    summary: rawSummaryBlock,
    chapters,
    rawSummaryBlock,
    rawChaptersBlock,
  };
}

export function parseWritingPlanBlocks(summary: string, chaptersBlock: string): WritingPlan | null {
  const cleanSummary = summary.trim();
  const cleanChaptersBlock = chaptersBlock.trim();
  if (!cleanSummary || !cleanChaptersBlock) return null;

  const chapters = parseChapterBlock(cleanChaptersBlock);
  if (chapters.length === 0) return null;

  return {
    summary: cleanSummary,
    chapters,
    rawSummaryBlock: cleanSummary,
    rawChaptersBlock: cleanChaptersBlock,
  };
}

export function serializeChapterBlock(chapters: WritingPlanChapter[]): string {
  return chapters
    .map((chapter) => {
      const titlePart = chapter.title ? `: ${chapter.title}` : '';
      return `[CHAPTER ${chapter.chapterNumber}${titlePart}]\n${chapter.outline}`.trimEnd();
    })
    .join('\n\n');
}

export function serializeWritingPlan(plan: WritingPlan): string {
  return [
    PLAN_SUMMARY_START,
    plan.rawSummaryBlock,
    PLAN_SUMMARY_END,
    '',
    PLAN_CHAPTERS_START,
    plan.rawChaptersBlock,
    PLAN_CHAPTERS_END,
  ].join('\n');
}

export function getLatestValidWritingPlanInStory(story: Story): CanonicalWritingPlanSource | null {
  const sections = story.sections || [];

  for (let index = sections.length - 1; index >= 0; index -= 1) {
    const section = sections[index];
    if (section.type !== 'assistant') continue;

    const parsed = parseWritingPlanFromText(section.content || '');
    if (parsed) {
      return {
        plan: parsed,
        sectionIndex: index,
      };
    }
  }

  return null;
}

export function replaceWritingPlanInText(content: string, nextPlan: WritingPlan): string {
  const summaryStart = content.indexOf(PLAN_SUMMARY_START);
  const summaryEnd = content.indexOf(PLAN_SUMMARY_END);
  const chaptersStart = content.indexOf(PLAN_CHAPTERS_START);
  const chaptersEnd = content.indexOf(PLAN_CHAPTERS_END);

  if (summaryStart === -1 || summaryEnd === -1 || chaptersStart === -1 || chaptersEnd === -1) {
    return content;
  }

  if (summaryEnd <= summaryStart || chaptersEnd <= chaptersStart) {
    return content;
  }

  const summaryPrefix = content.slice(0, summaryStart + PLAN_SUMMARY_START.length);
  const betweenSummaryAndChapters = content.slice(summaryEnd, chaptersStart + PLAN_CHAPTERS_START.length);
  const suffix = content.slice(chaptersEnd);

  return `${summaryPrefix}\n${nextPlan.rawSummaryBlock}\n${betweenSummaryAndChapters}\n${nextPlan.rawChaptersBlock}\n${suffix}`;
}

export function getVariableMode(variableKey: string): VariableMode {
  if (variableKey === 'story_so_far') return 'unexpanded';
  if (variableKey === 'current_chapter_number') return 'expanded-immutable';

  if (
    variableKey === 'plan_summary'
    || variableKey === 'plan_chapters'
    || variableKey === 'plan_full'
    || variableKey === 'plan_chapters_to_current'
    || variableKey === 'current_chapter_outline'
  ) {
    return 'expanded-mutable';
  }

  return 'expanded-mutable';
}

export function getStandaloneVariableToken(content: string): string | null {
  const match = content.match(standaloneVariableRegex);
  return match ? match[1] : null;
}

function parseChapterBlock(rawBlock: string): WritingPlanChapter[] {
  const lines = rawBlock.split(/\r?\n/);
  const chapters: WritingPlanChapter[] = [];

  let currentChapter: WritingPlanChapter | null = null;
  let currentOutlineLines: string[] = [];

  const flushCurrent = () => {
    if (!currentChapter) return;

    currentChapter.outline = currentOutlineLines.join('\n').trim();
    if (currentChapter.outline.length > 0) {
      chapters.push(currentChapter);
    }

    currentChapter = null;
    currentOutlineLines = [];
  };

  for (const line of lines) {
    const match = line.match(chapterTagRegex);
    if (match) {
      flushCurrent();
      currentChapter = {
        chapterNumber: Number(match[1]),
        title: (match[2] || '').trim(),
        outline: '',
      };
      continue;
    }

    if (!currentChapter) {
      continue;
    }

    currentOutlineLines.push(line);
  }

  flushCurrent();

  return chapters.sort((a, b) => a.chapterNumber - b.chapterNumber);
}

export function getParentStory(story: Story, stories: Story[]): Story {
  if (!story.parentStoryId) return story;
  return stories.find((item) => item.id === story.parentStoryId) || story;
}

function getCanonicalPlan(parentStory: Story): WritingPlan | null {
  return getLatestValidWritingPlanInStory(parentStory)?.plan || null;
}

function getChapterOutlineForStory(story: Story, parentStory: Story): string {
  const chapterNumber = story.chapterNumber;
  const plan = getCanonicalPlan(parentStory);
  if (!chapterNumber || !plan) return '';

  const chapter = plan.chapters.find((item) => item.chapterNumber === chapterNumber);
  return chapter?.outline || '';
}

function getChaptersUntilCurrent(story: Story, parentStory: Story): string {
  const plan = getCanonicalPlan(parentStory);
  if (!plan) return '';
  const currentNumber = story.chapterNumber || Number.MAX_SAFE_INTEGER;

  return plan.chapters
    .filter((chapter) => chapter.chapterNumber <= currentNumber)
    .map((chapter) => {
      const titlePart = chapter.title ? `: ${chapter.title}` : '';
      return `[CHAPTER ${chapter.chapterNumber}${titlePart}]\n${chapter.outline}`;
    })
    .join('\n\n');
}

function getStorySoFar(story: Story, stories: Story[]): string {
  const parentStory = getParentStory(story, stories);
  const currentNumber = story.chapterNumber || Number.MAX_SAFE_INTEGER;

  const previousChildren = stories
    .filter((candidate) => candidate.parentStoryId === parentStory.id)
    .filter((candidate) => (candidate.chapterNumber || Number.MAX_SAFE_INTEGER) < currentNumber)
    .sort((left, right) => (left.chapterNumber || 0) - (right.chapterNumber || 0));

  return previousChildren
    .map((child) => child.sections.find((section) => section.type === 'assistant')?.content || '')
    .filter((value) => value.trim().length > 0)
    .join('\n\n');
}

function replacePlaceholders(template: string, parentStory: Story): string {
  const placeholders = parentStory.promptPlaceholders || [];
  return template.replace(/\{\{\s*([a-zA-Z0-9_\-.]+)\s*\}\}/g, (_, name: string) => {
    const hit = placeholders.find((placeholder) => placeholder.name === name);
    return hit ? hit.value : `{{${name}}}`;
  });
}

function replaceVariables(template: string, story: Story, parentStory: Story, stories: Story[]): string {
  const canonicalPlan = getCanonicalPlan(parentStory);
  const summary = canonicalPlan?.summary || '';
  const chaptersBlock = canonicalPlan?.rawChaptersBlock || '';
  const fullPlan = canonicalPlan
    ? serializeWritingPlan(canonicalPlan)
    : '';

  const chaptersToCurrent = getChaptersUntilCurrent(story, parentStory);
  const currentOutline = getChapterOutlineForStory(story, parentStory);
  const storySoFar = getStorySoFar(story, stories);
  const chapterNumber = story.chapterNumber != null ? String(story.chapterNumber) : '';

  const varMap: Record<string, string> = {
    plan_summary: summary,
    plan_chapters: chaptersBlock,
    plan_full: fullPlan,
    plan_chapters_to_current: chaptersToCurrent,
    current_chapter_outline: currentOutline,
    story_so_far: storySoFar,
    current_chapter_number: chapterNumber,
  };

  return template.replace(/\[\[\s*([a-zA-Z0-9_\-.]+)\s*\]\]/g, (token, key: string) => {
    if (!(key in varMap)) return token;
    return varMap[key];
  });
}

export function resolveVariableValue(variableKey: string, story: Story, stories: Story[]): string {
  const parentStory = getParentStory(story, stories);
  const canonicalPlan = getCanonicalPlan(parentStory);
  const summary = canonicalPlan?.summary || '';
  const chaptersBlock = canonicalPlan?.rawChaptersBlock || '';
  const fullPlan = canonicalPlan
    ? serializeWritingPlan(canonicalPlan)
    : '';

  if (variableKey === 'plan_summary') return summary;
  if (variableKey === 'plan_chapters') return chaptersBlock;
  if (variableKey === 'plan_full') return fullPlan;
  if (variableKey === 'plan_chapters_to_current') return getChaptersUntilCurrent(story, parentStory);
  if (variableKey === 'current_chapter_outline') return getChapterOutlineForStory(story, parentStory);
  if (variableKey === 'story_so_far') return getStorySoFar(story, stories);
  if (variableKey === 'current_chapter_number') return story.chapterNumber != null ? String(story.chapterNumber) : '';
  return '';
}

export function applyMutableVariableEdit(
  plan: WritingPlan,
  variableKey: string,
  editedValue: string,
  currentChapterNumber: number | null | undefined
): WritingPlan | null {
  if (variableKey === 'plan_summary') {
    return {
      ...plan,
      summary: editedValue,
      rawSummaryBlock: editedValue,
    };
  }

  if (variableKey === 'plan_chapters') {
    return parseWritingPlanBlocks(plan.summary, editedValue);
  }

  if (variableKey === 'plan_full') {
    return parseWritingPlanFromText(editedValue);
  }

  if (variableKey === 'current_chapter_outline') {
    if (!currentChapterNumber) return null;

    const nextChapters = plan.chapters.map((chapter) => (
      chapter.chapterNumber === currentChapterNumber
        ? { ...chapter, outline: editedValue }
        : chapter
    ));

    return {
      ...plan,
      chapters: nextChapters,
      rawChaptersBlock: serializeChapterBlock(nextChapters),
    };
  }

  if (variableKey === 'plan_chapters_to_current') {
    const parsed = parseWritingPlanBlocks(plan.summary, editedValue);
    if (!parsed) return null;

    const parsedByNumber = new Map(parsed.chapters.map((chapter) => [chapter.chapterNumber, chapter]));
    const nextChapters = plan.chapters.map((chapter) => {
      const replacement = parsedByNumber.get(chapter.chapterNumber);
      return replacement ? { ...chapter, title: replacement.title, outline: replacement.outline } : chapter;
    });

    return {
      ...plan,
      chapters: nextChapters,
      rawChaptersBlock: serializeChapterBlock(nextChapters),
    };
  }

  return plan;
}

export function resolveTemplateText(template: string, story: Story, stories: Story[]): string {
  const parentStory = getParentStory(story, stories);
  const withPlaceholders = replacePlaceholders(template, parentStory);
  return replaceVariables(withPlaceholders, story, parentStory, stories);
}

export function resolveSectionsForGeneration(story: Story, stories: Story[]): StorySection[] {
  return (story.sections || []).map((section) => ({
    ...section,
    content: resolveTemplateText(section.content || '', story, stories),
    thinkingContent: section.thinkingContent ? resolveTemplateText(section.thinkingContent, story, stories) : section.thinkingContent,
  }));
}
