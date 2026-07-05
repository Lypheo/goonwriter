# GoonWriter

AI-Storywriting tool / glorified chat UI.

Yet Another LLM Frontend that doesn't really do anything new. I only made it because vibe-coding my own bespoke app is way more fun than trying to figure out the optimal [SillyTavern](https://github.com/SillyTavern/SillyTavern) setup.

<img width="2247" height="1280" alt="image" src="https://github.com/user-attachments/assets/0add3414-4034-4f61-afd8-d6d65bb0d705" />

<img width="2248" height="1281" alt="image" src="https://github.com/user-attachments/assets/a31339d3-4648-4f3c-ac3c-11207392fb15" />

<img width="1197" height="1136" alt="image" src="https://github.com/user-attachments/assets/7dfda878-04e3-465e-97c6-e913335f3af9" />




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

The newest valid plan in the parent story is treated as canonical. Each chapter becomes (or updates) a child story named like `Parent Title - Chapter N`, and the chapter title/number metadata stays in sync with the plan. Child stories inherit:

- The parent story's system prompt content.
- The parent story's child prompt/response templates (as their initial user/assistant sections).

Updating the plan in a parent story re-syncs all chapter children.

## Story Blueprint

The Story Blueprint sidebar is where you set the parent story's template and placeholder defaults that feed chapter children:

- **Child prompt template**: The user section used for every generated chapter story.
- **Child response template**: The assistant section scaffold for each chapter story.
- **Placeholders**: Custom `{{placeholder_name}}` values that can be reused in prompts.

Open it from the left sidebar using the "Story Blueprint" toggle.

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