# @xl0/pi-lovely-codex

Pi extension for GPT service-tier controls and Codex-style `apply_patch` inside Pi.

## What it adds

- `/codex` interactive TUI config
- GPT service-tier modes for OpenAI GPT models
- Codex priority cost adjustment for `openai-codex`
- `apply_patch` tool control: keep legacy tools, or make `apply_patch` replace `edit` + `write`

## Install

```bash
pi install npm:@xl0/pi-lovely-codex
```

Use without install:

```bash
pi -e npm:@xl0/pi-lovely-codex
```

## `/codex`

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

### `apply_patch` mode

- `disabled` -> remove `apply_patch`; restore `edit` + `write` only if active at session start
- `enabled` -> enable `apply_patch`; restore `edit` + `write` only if active at session start
- `replace-edit` -> enable `apply_patch`; remove active `edit` + `write`

Default effective value: `enabled`.

## Config file

Example:

```json
{
  "gptMode": "fast-codex",
  "applyPatchMode": "replace-edit"
}
```

Both keys optional.

## Notes

- Bad config on session load -> extension falls back to defaults and shows error.
- Bad config in one `/codex` scope -> that scope ignored, warning shown.
- Current `apply_patch` implementation shells out to `codex --codex-run-as-apply-patch`.
