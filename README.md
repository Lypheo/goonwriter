# GoonWriter

AI-Storywriting tool / glorified chat UI.

In truth, just Yet Another LLM Frontend that doesn't really do anything new. I only made it because vibe-coding my own bespoke app is more fun than trying to figure out the optimal [SillyTavern](https://github.com/SillyTavern/SillyTavern) setup.

## Writing Plan Tags

Writing plan extraction uses strict, human-readable tags in assistant output:

```text
[SUMMARY]
High-level story overview...
[/SUMMARY]

[CHAPTERS]
[CHAPTER 1: Title]
Outline text...

[CHAPTER 2: Title]
Outline text...
[/CHAPTERS]
```

When detected in a parent story response, chapter child stories are created/updated automatically.

## Prompt Tokens

- Placeholders: `{{placeholder_name}}`
- Variables: `[[variable_name]]`

Supported variables include:

- `[[plan_summary]]`
- `[[plan_chapters]]`
- `[[plan_full]]`
- `[[plan_chapters_to_current]]`
- `[[current_chapter_outline]]`
- `[[story_so_far]]`
- `[[current_chapter_number]]`