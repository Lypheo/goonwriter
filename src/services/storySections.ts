import { v4 as uuidv4 } from 'uuid';
import type { Story, StorySection, ChatMessage } from '../types';
import { SPECIAL_TOKENS } from '../types';

export const DEFAULT_CHILD_PROMPT_TEMPLATE = [
  'Write Chapter [[current_chapter_number]] of the story.',
  '',
  'Use this chapter outline:',
  '[[current_chapter_outline]]',
  '',
  'Story so far:',
  '[[story_so_far]]',
].join('\n');

export const DEFAULT_CHILD_RESPONSE_TEMPLATE = '';

interface GenerationPromptOptions {
  disableThinkingPrefill?: string;
  disableThinking?: boolean;
}

function createSection(type: StorySection['type'], content = '', thinkingContent = ''): StorySection {
  return {
    id: uuidv4(),
    type,
    content,
    thinkingContent,
    collapsed: false,
  };
}

function composeAssistantPromptContent(
  section: StorySection,
  includeThinking: boolean,
  disableThinkingPrefill = '',
  disableThinking = false
): string {
  const responseContent = section.content || '';
  const thought = (section.thinkingContent || '').trim();

  if (includeThinking && thought) {
    return `${SPECIAL_TOKENS.START_THINK}${thought}${SPECIAL_TOKENS.END_THINK}${responseContent}`;
  }

  if (includeThinking && !thought) {
    const trimmedResponse = responseContent.trim();

    if (trimmedResponse.length > 0 && disableThinkingPrefill) {
      return `${disableThinkingPrefill}${responseContent}`;
    }

    if (disableThinking && trimmedResponse.length === 0 && disableThinkingPrefill) {
      return disableThinkingPrefill;
    }
  }

  return responseContent;
}

export function createInitialSections(): StorySection[] {
  return [
    createSection('system', ''),
    createSection('user', ''),
    createSection('assistant', ''),
  ];
}

function ensureSectionsShape(sections: StorySection[]): StorySection[] {
  const normalized: StorySection[] = sections
    .filter((section) => section && (section.type === 'system' || section.type === 'user' || section.type === 'assistant'))
    .map((section) => ({
      id: section.id || uuidv4(),
      type: section.type,
      content: section.content || '',
      thinkingContent: section.type === 'assistant' ? section.thinkingContent || '' : '',
      collapsed: section.collapsed ?? false,
    }));

  if (normalized.length === 0) {
    return createInitialSections();
  }

  if (normalized[0].type !== 'system') {
    normalized.unshift(createSection('system', ''));
  }

  if (!normalized.some((section) => section.type === 'user')) {
    normalized.splice(1, 0, createSection('user', ''));
  }

  if (normalized[normalized.length - 1]?.type !== 'assistant') {
    normalized.push(createSection('assistant', ''));
  }

  return normalized;
}

export function storySectionsToChatMessages(sections: StorySection[]): ChatMessage[] {
  const messages: ChatMessage[] = [];
  const includeThinkingAssistantIndex = sections.length > 0 && sections[sections.length - 1].type === 'assistant'
    ? sections.length - 1
    : -1;

  for (const [index, section] of sections.entries()) {
    const msg = section.type === 'assistant'
      ? composeAssistantPromptContent(section, index === includeThinkingAssistantIndex)
      : section.content;
    if (!msg) continue;

    if (section.type === 'system') {
      if (!messages.some((m) => m.role === 'system')) {
        messages.push({ role: 'system', content: msg });
      }
      continue;
    }

    messages.push({
      role: section.type === 'assistant' ? 'assistant' : 'user',
      content: msg,
    });
  }

  return messages;
}

export function storySectionsToGenerationPrompt(sections: StorySection[], options: GenerationPromptOptions = {}): string {
  const lastAssistantIndex = [...sections].map((section) => section.type).lastIndexOf('assistant');
  const disableThinkingPrefill = options.disableThinkingPrefill || '';
  const disableThinking = options.disableThinking || false;

  const prompt = sections
    .map((section, index) => {
      if (section.type === 'system') {
        return `${SPECIAL_TOKENS.START_SYS_PROMPT}${section.content}${SPECIAL_TOKENS.END_SYS_PROMPT}`;
      }
      if (section.type === 'user') {
        return `${SPECIAL_TOKENS.START_USER}${section.content}${SPECIAL_TOKENS.END_USER}`;
      }
      if (index === lastAssistantIndex) {
        return `${SPECIAL_TOKENS.START_AI}${composeAssistantPromptContent(section, true, disableThinkingPrefill, disableThinking)}`;
      }
      return `${SPECIAL_TOKENS.START_AI}${composeAssistantPromptContent(section, false, disableThinkingPrefill, disableThinking)}${SPECIAL_TOKENS.END_AI}`;
    })
    .join('');

  return prompt;
}

export function deriveFlatStoryContent(sections: StorySection[]): string {
  return sections
    .map((section) => section.content)
    .filter((value) => value.length > 0)
    .join('\n\n');
}

export function normalizeStory(story: Story): Story {
  const { content: _legacyContent, ...rest } = story as Story & { content?: string };
  const sections = story.sections?.length ? ensureSectionsShape(story.sections) : createInitialSections();

  return {
    ...rest,
    sections,
    parentStoryId: story.parentStoryId ?? null,
    chapterNumber: story.chapterNumber ?? null,
    chapterTitle: story.chapterTitle || '',
    writingPlan: story.writingPlan ?? null,
    promptPlaceholders: (story.promptPlaceholders || []).map((placeholder) => ({
      ...placeholder,
      collapsed: placeholder.collapsed ?? false,
      editorHeight: placeholder.editorHeight ?? 96,
    })),
    childPromptTemplate: story.childPromptTemplate ?? DEFAULT_CHILD_PROMPT_TEMPLATE,
    childResponseTemplate: story.childResponseTemplate ?? DEFAULT_CHILD_RESPONSE_TEMPLATE,
  };
}
