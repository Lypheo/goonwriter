import { v4 as uuidv4 } from 'uuid';
import type { Story, StorySection, ChatMessage } from '../types';
import { SPECIAL_TOKENS } from '../types';

function createSection(type: StorySection['type'], content = '', thinkingContent = ''): StorySection {
  return {
    id: uuidv4(),
    type,
    content,
    thinkingContent,
    collapsed: false,
  };
}

function splitThinkContent(text: string): { content: string; thinkingContent: string } {
  const thinkRegex = /<think>([\s\S]*?)<\/think>/g;
  const thoughtParts: string[] = [];
  const contentWithoutThink = text.replace(thinkRegex, (_, thought: string) => {
    thoughtParts.push((thought || '').trim());
    return '';
  });

  return {
    content: contentWithoutThink.trim(),
    thinkingContent: thoughtParts.filter(Boolean).join('\n\n').trim(),
  };
}

function composeAssistantPromptContent(section: StorySection, includeThinking: boolean): string {
  const responseContent = section.content || '';
  const thought = (section.thinkingContent || '').trim();

  if (includeThinking && thought) {
    return `${SPECIAL_TOKENS.START_THINK}${thought}${SPECIAL_TOKENS.END_THINK}${responseContent}`;
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
      thinkingContent: section.type === 'assistant'
        ? section.thinkingContent || splitThinkContent(section.content || '').thinkingContent
        : '',
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

function parseLegacyTokenizedContent(content: string): StorySection[] {
  if (!content.trim()) {
    return createInitialSections();
  }

  const sections: StorySection[] = [];
  let rest = content;

  const sysStart = SPECIAL_TOKENS.START_SYS_PROMPT;
  const sysEnd = SPECIAL_TOKENS.END_SYS_PROMPT;
  if (rest.includes(sysStart)) {
    const startIdx = rest.indexOf(sysStart);
    const endIdx = rest.indexOf(sysEnd, startIdx + sysStart.length);
    if (startIdx !== -1 && endIdx !== -1) {
      const sysContent = rest.slice(startIdx + sysStart.length, endIdx).trim();
      sections.push(createSection('system', sysContent));
      rest = rest.slice(endIdx + sysEnd.length);
    }
  }

  if (sections.length === 0) {
    sections.push(createSection('system', ''));
  }

  const blockRegex = /<<start_(user|ai)>>([\s\S]*?)(?=(<<start_(user|ai)>>)|$)/g;
  let match: RegExpExecArray | null;
  while ((match = blockRegex.exec(rest)) !== null) {
    const role = match[1];
    let raw = match[2] ?? '';
    if (role === 'user') {
      raw = raw.replace(new RegExp(`${SPECIAL_TOKENS.END_USER}$`), '');
      sections.push(createSection('user', raw.trim()));
    } else {
      raw = raw.replace(new RegExp(`${SPECIAL_TOKENS.END_AI}$`), '');
      const split = splitThinkContent(raw.trim());
      sections.push(createSection('assistant', split.content, split.thinkingContent));
    }
  }

  if (sections.filter((section) => section.type !== 'system').length === 0) {
    const fallback = content.trim();
    if (fallback.length > 0) {
      sections.push(createSection('user', fallback));
      sections.push(createSection('assistant', ''));
    }
  }

  return ensureSectionsShape(sections);
}

export function storySectionsToChatMessages(sections: StorySection[]): ChatMessage[] {
  const messages: ChatMessage[] = [];
  const includeThinkingAssistantIndex = sections.length > 0 && sections[sections.length - 1].type === 'assistant'
    ? sections.length - 1
    : -1;

  for (const [index, section] of sections.entries()) {
    const assistantComposed = section.type === 'assistant'
      ? composeAssistantPromptContent(section, index === includeThinkingAssistantIndex)
      : section.content;
    const trimmed = assistantComposed.trim();
    if (!trimmed) continue;

    if (section.type === 'system') {
      if (!messages.some((m) => m.role === 'system')) {
        messages.push({ role: 'system', content: trimmed });
      }
      continue;
    }

    messages.push({
      role: section.type === 'assistant' ? 'assistant' : 'user',
      content: trimmed,
    });
  }

  return messages;
}

export function storySectionsToGenerationPrompt(sections: StorySection[]): string {
  const lastAssistantIndex = [...sections].map((section) => section.type).lastIndexOf('assistant');

  return sections
    .map((section, index) => {
      if (section.type === 'system') {
        return `${SPECIAL_TOKENS.START_SYS_PROMPT}${section.content}${SPECIAL_TOKENS.END_SYS_PROMPT}`;
      }
      if (section.type === 'user') {
        return `${SPECIAL_TOKENS.START_USER}${section.content}${SPECIAL_TOKENS.END_USER}`;
      }
      if (index === lastAssistantIndex) {
        return `${SPECIAL_TOKENS.START_AI}${composeAssistantPromptContent(section, true)}`;
      }
      return `${SPECIAL_TOKENS.START_AI}${composeAssistantPromptContent(section, false)}${SPECIAL_TOKENS.END_AI}`;
    })
    .join('');
}

export function deriveFlatStoryContent(sections: StorySection[]): string {
  return sections
    .map((section) => section.content)
    .filter((value) => value.length > 0)
    .join('\n\n');
}

export function normalizeStory(story: Story): Story {
  const sections = story.sections?.length ? ensureSectionsShape(story.sections) : parseLegacyTokenizedContent(story.content || '');

  return {
    ...story,
    sections,
    content: deriveFlatStoryContent(sections),
    htmlContent: story.htmlContent || '',
  };
}
