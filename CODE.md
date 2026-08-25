# Code

## Role

Pi extension adding Codex-oriented controls to the coding agent:

- choose GPT service-tier behavior per user/workspace
- expose a Codex-compatible `apply_patch` tool
- control which file-editing tools are active

State below describes the current codebase, not history.

## Layout

`extensions/lovely-codex/` is the whole implementation:

- `index.ts`: extension entrypoint, lifecycle, `/lovely-codex` command
- `config.ts`: scoped config spec
- `gpt-mode.ts`: service-tier request hooks and cost adjustment
- `apply-patch.ts`: the `apply_patch` tool
- `read-image.ts`: `view_image`, an image-only stand-in for `read`

Published as ESM `@xl0/pi-lovely-codex`; Pi discovers entrypoints via
`pi.extensions`. Runtime dep `@xl0/pi-lovely-config` (plus typebox); Pi packages
are peer deps. No automated tests.

## Config

`config.ts` defines `codexConfigSpec = defineScopedConfig(...)` over seven flat
optional fields:

| field | values | default |
| --- | --- | --- |
| `gptMode` | `default` / `fast` / `fast-codex` | `default` |
| `applyPatchAddMode` | `on` / `off` / `gpt-only` | `gpt-only` |
| `applyPatchFreeform` | boolean | `false` |
| `disableWrite` | boolean | `false` |
| `disableEdit` | boolean | `false` |
| `disableRead` | `on` / `off` / `gpt-only` | `gpt-only` |
| `viewImage` | boolean | `true` |

Scopes are User (`~/.pi/agent/xl0-pi-lovely-codex.json`) and Workspace
(`<cwd>/.pi/...`); Workspace shallow-overrides User. Omitted means unset in
that scope, not "false".

Non-obvious behavior, all owned by `@xl0/pi-lovely-config`:

- Defaults live on field builders and are never persisted.
- Unknown file properties survive load/save and reset; only known keys are
  written or deleted. A scope file is removed when it becomes empty.
- Invalid *known* values warn and are ignored while resolving; invalid JSON or
  a non-object file is a hard error naming the path.
- IO is synchronous and stateful — the spec instance holds raw scoped patches.

## Lifecycle

`lovelyCodexExtension(pi)` keeps the effective config, a baseline of tools
active at `session_start`, whether the selected model is GPT, and whether it
supports grammar-constrained freeform tools.

`session_start` captures the baseline and model capabilities, loads/merges both
scopes for `cwd`, refreshes the `apply_patch` registration, applies tool
activation and sets the status indicator. Any failure falls back to defaults,
clears status, and notifies. `model_select` re-runs the model-dependent parts.

Status indicator is `🏎️` (accent) for non-`default` GPT modes, hidden otherwise.

## Tool activation

`applyToolConfig()` rewrites Pi's active tool set from config + model:

- `apply_patch` present when mode is `on`, or `gpt-only` and the model id
  starts with `gpt-` or contains `/gpt-`
- `disableWrite` / `disableEdit` remove `write` / `edit`, but *only while
  `apply_patch` is active*; otherwise they are restored
- `disableRead` removes `read` when `on`, or `gpt-only` and the model is GPT
  (independent of `apply_patch`), forcing bounded shell reads to conserve
  context; while it is active, `view_image` is added unless `viewImage` is off

Restoration is gated on the session-start baseline so the extension can never
enable a tool the session did not already have. `session_shutdown` sets the
active tools back to that baseline: `/reload` rebuilds the runtime from the
current active set and a fresh instance re-captures the baseline from it, so
anything still removed at teardown would otherwise stay gone.

`read-image.ts` registers `view_image`, a path-only tool on Pi's exported
`detectSupportedImageMimeTypeFromFile`: resolve against `ctx.cwd`, sniff
(anything that is not an image is refused, whatever its extension), return the
note + raw base64 attachment. No resize/convert here — Pi normalizes every tool
result's images as they enter history, honoring the auto-resize setting.
Result rendering is Pi's fallback. It is active while `read` is disabled and
`viewImage` is on — the sole way to view images once `read` is gone, since
shell reads return bytes, not attachments.

## `/lovely-codex` command

TUI-only (ignored in other modes). Reloads config, then hands
`codexConfigSpec` to `ScopedConfigEditor` from `@xl0/pi-lovely-config`, which
supplies the tabbed User/Workspace UI, per-field writes, and reset. The
extension only supplies `onChange`, which re-applies tool registration,
activation and status. `applyPatchFreeform`/`disableWrite`/`disableEdit` rows
are `visibleWhen` `apply_patch` is effectively not `off`; `disableRead` is
always visible, and `viewImage` shows only when `disableRead` is not `off`.
Hidden fields stay persisted and effective.

## GPT mode

`gpt-mode.ts` reads the mode through a closure, so command changes take effect
on later requests.

`before_provider_request` sets `service_tier: "priority"` — for both `openai`
and `openai-codex` in `fast`, for `openai-codex` only in `fast-codex`, never in
`default`. Guarded to OpenAI GPT requests (provider `openai`/`openai-codex`,
model id starting `gpt-`) so other OpenAI-compatible providers are untouched.

`message_end` adjusts priority pricing on finalized `openai-codex` assistant
messages; the plain `openai` provider keeps Pi's native pricing.

Verified 2026-07-21: Codex subscription backend accepts `service_tier:
"priority"` but processes at default tier (response echoes `default`, no
throughput gain) unless the account has Fast mode credits — the `message_end`
multiplier then inflates displayed cost. API-key `openai` honors `priority`
(echoed on every request, measurable latency gains on most models).

## `apply_patch`

`apply-patch.ts`. Schema is `{ input: string }`. When `applyPatchFreeform` is
enabled and the model declares grammar-tool support, the tool is instead
emitted as a freeform custom tool constrained by Codex's apply-patch Lark
grammar, with Pi mapping the streamed body back to `input`. Registration is
refreshed on config and model changes so description and shape stay aligned.

The prompt deliberately does not restate the patch syntax (models know it, and
the grammar encodes it); it does push for smaller patches, since an early
hunk failure invalidates the rest of a multi-file patch.

Execution parses touched paths from the envelope, acquires Pi's file mutation
queues in sorted absolute-path order, snapshots before/after, and shells out to
`codex --codex-run-as-apply-patch <input>` in `ctx.cwd`, with
`CMUX_CODEX_HOOKS_DISABLED=1` to prevent terminal wrappers injecting session
arguments. Semantics are delegated to the Codex CLI; no native parser is
planned.

Success returns `stdout + stderr`. Failure throws the combined output plus a
partial-change diff when one exists — the thrown text is what the LLM sees,
while a `tool_result` hook attaches the captured command details for the UI.

TUI rendering mirrors `edit`: touched filenames highlighted on the call line,
streamed `input` shown with lightweight diff coloring while pending, and
line-numbered diffs via Pi `renderDiff` on completion. Filename headers appear
only for multi-file diffs.

## Tooling and docs

`tsconfig.json` (strict, over `extensions/`), `biome.json` aligned with the
adjacent Pi Lovely packages, Bun as package manager, lockfiles ignored.
`check` = `tsgo --noEmit` + Biome. `README.md` carries the user-facing docs.

Releases: `CHANGELOG.md` (Keep-a-Changelog style, `[Unreleased]` on top).
`scripts/release.ts` (`bun run release [patch|minor|major|x.y.z] [--no-push]`)
checks everything first — release files clean (other dirty files are listed
and left alone), tag absent locally and on origin, master not behind origin,
version not on npm (only an E404 passes) nor already staged, `[Unreleased]`
non-empty — runs `prepublishOnly` (= `check`) before touching the tree, then
rolls the changelog, bumps `package.json`, pauses on the diff for a y/N,
commits, tags `v*` and pushes (`--no-follow-tags`). The tag push triggers
`.github/workflows/publish.yml`, which verifies the tag, stages on npm with
OIDC provenance, and opens a GitHub Release from the changelog section; the
staged version publishes only after the script's manual 2FA approval. Mirrors
the grok-mermaid setup plus the pre-write verification and origin/stage checks.
