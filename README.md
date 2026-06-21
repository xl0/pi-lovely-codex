# @xl0/pi-lovely-codex

GPT "Fast mode" control and Codex-style `apply_patch` tool.

## Install

```bash
pi install npm:@xl0/pi-lovely-codex
```

Use without install:

```bash
pi -e npm:@xl0/pi-lovely-codex
```

## `/lovely-codex`

### GPT fast mode 🏎️

- `default` -> omit `service_tier` - default mode
- `fast` -> send `service_tier: "priority"` for `openai` and `openai-codex` - request fast mode on OpenAI API and Codex sub.
- `fast-codex` -> send priority only for `openai-codex` - request fast mode on Codex sub only.

Applies only to provider `openai` or `openai-codex`, model id starting with `gpt-`. Fast mode shows `🏎️` in status line.

### apply_patch tool

> Note: Current `apply_patch` implementation shells out to `codex --codex-run-as-apply-patch`. **You need to have codex installed and available on PATH.**

`add apply_patch` controls whether Lovely Codex enables the `apply_patch` tool:

- `on` -> always add the `apply_patch` tool.
- `off` -> don't add the `apply_patch` tool.
- `gpt-only` -> enable `apply_patch` only when current model id starts with `gpt-` or contains `/gpt-`.

Optionally, you can disable the now redundant built-in tools while `apply_patch` is active:
- `disable write`
- `disable edit`

When `apply_patch` becomes inactive, `write`/`edit` are restored only if they were active at session start.

Default effective values: `add apply_patch = gpt-only`, `disable write = off`, `disable edit = off`.

Config scopes:

- User: `~/.pi/agent/xl0-pi-lovely-codex.json`
- Workspace: `<cwd>/.pi/xl0-pi-lovely-codex.json`

Workspace overrides User. All keys are optional.
