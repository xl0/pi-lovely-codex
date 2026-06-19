# @xl0/pi-lovely-codex

Pi extension for GPT service-tier controls and Codex-style `apply_patch` inside Pi.

## What it adds

- `/lovely-codex` interactive TUI config
- GPT service-tier modes for OpenAI GPT models
- Codex priority cost adjustment for `openai-codex`
- file-editing tool control: add `apply_patch`, optionally disable `edit` + `write`

## Install

```bash
pi install npm:@xl0/pi-lovely-codex
```

Use without install:

```bash
pi -e npm:@xl0/pi-lovely-codex
```

## `/lovely-codex`

Opens tabbed `User` and `Workspace` config.

- `User` -> `~/.pi/agent/xl0-pi-lovely-codex.json`
- `Workspace` -> `.pi/xl0-pi-lovely-codex.json`

Workspace overrides User. `unset` removes setting from current scope and falls through to lower scope or default.
`Reset to default` deletes current scope config file and refreshes local state.

### GPT mode

- `default` -> omit `service_tier`
- `fast` -> send `service_tier: "priority"` for `openai` and `openai-codex`
- `fast-codex` -> send priority only for `openai-codex`

Applies only to OpenAI GPT models: provider `openai` or `openai-codex`, model id starting with `gpt-`.

Non-default effective mode shows `🏎️` in status line.

### Tool modes

`add apply_patch` controls whether Lovely Codex enables the `apply_patch` tool:

- `on` -> enable `apply_patch`
- `off` -> remove `apply_patch`
- `gpt-only` -> enable `apply_patch` only when current model id has a `gpt-` segment

When `apply_patch` is enabled, indented sub-options can disable built-in file-writing tools:

- `disable write` -> remove active `write`
- `disable edit` -> remove active `edit`

Default effective values: `add apply_patch = gpt-only`, `disable write = off`, `disable edit = off`.

## Config file

Example:

```json
{
  "gptMode": "fast-codex",
  "applyPatchAddMode": "gpt-only",
  "disableWrite": true,
  "disableEdit": true
}
```

All keys optional.

## Notes

- Bad config on session load -> extension falls back to defaults and shows error.
- Bad config in one `/lovely-codex` scope -> that scope ignored, warning shown.
- Current `apply_patch` implementation shells out to `codex --codex-run-as-apply-patch`.
