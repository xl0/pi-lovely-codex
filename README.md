# @xl0/pi-lovely-codex

GPT "Fast mode" control and Codex-style `apply_patch` tool.

## Install

```bash
pi install npm:@xl0/pi-lovely-codex
```

Or use without installing:

```bash
pi -e npm:@xl0/pi-lovely-codex
```

## `/lovely-codex`

![Lovely codex settings](https://raw.githubusercontent.com/xl0/pi-lovely-codex/master/assets/lovely-codex-settings.png)

### GPT fast mode 🏎️

Sends `service_tier: "priority"` to request priority serving:

- `default` — don't send `service_tier`
- `fast` — priority on both `openai` and `openai-codex`
- `fast-codex` — priority on `openai-codex` only

GPT models on those two providers only. Fast mode shows 🏎️ in the status line.

> On the Codex subscription, `priority` is silently ignored unless your account
> has Fast mode credits. On the OpenAI API it needs priority processing enabled
> for your org.

### `apply_patch`

GPT models are trained on Codex's `apply_patch`; with Pi's `edit` tool, muscle
memory shows — silly mistakes creep in. This extension gives them the tool they
were trained on.

On Pi versions with freeform-tool support, `apply_patch` is an OpenAI custom
tool constrained by Codex's Lark grammar; elsewhere it's a plain JSON tool
`{ input: string }`.

> Patches are applied by shelling out to `codex --codex-run-as-apply-patch`.
> **The Codex CLI must be installed and on PATH.**

Settings:

- `add apply_patch` — `on`, `off`, or `gpt-only` (default: only for model ids
  starting with `gpt-` or containing `/gpt-`).
- `disable write` / `disable edit` — drop the now-redundant built-in tools
  while `apply_patch` is active (off by default); restored after, but never
  beyond what the session started with.

## Config files

- User: `~/.pi/agent/xl0-pi-lovely-codex.json`
- Workspace: `<cwd>/.pi/xl0-pi-lovely-codex.json`

Workspace overrides User. All keys optional.

## Related projects

|  |  |
| --- | --- |
| [Pi Lovely Web](https://github.com/xl0/pi-lovely-web) | `web_search`, `web_fetch`, `web_image` tools |
| [Pi Lovely Dev Tools](https://github.com/xl0/pi-lovely-dev-tools) | interactive debugging helpers `/tool`, `/show-sysprompt`, `/show-context`, `/llm-stats` |
| [Pi Lovely IDE](https://github.com/xl0/pi-lovely-ide) | IDE integration |
| [Pi Lovely Config](https://github.com/xl0/pi-lovely-config) | scoped config helpers for Pi extensions |
| [Pi Lovely Comment](https://github.com/xl0/agent-files/tree/master/pi/packages/pi-lovely-comment) | open the last assistant message in your editor and sync edits back into the prompt |
| [Pi Lovely Rename](https://github.com/xl0/agent-files/tree/master/pi/packages/pi-lovely-rename) | automatic and manual session naming |

---

Like this work? [Hire me](https://alexey.work/cv?ref=pi-lovely-codex)
