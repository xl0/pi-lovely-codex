# Code

## Role

Pi package adding Codex-oriented controls to the coding agent:

- choose GPT service-tier behavior per user/workspace
- expose Codex-compatible `apply_patch`
- control file-editing tools per user/workspace

State below describes current codebase, not history.

## Package shape

- `package.json` publishes `@xl0/pi-lovely-codex` as ESM.
- Pi loads extension entrypoints from `./extensions` via `pi.extensions`.
- Published files: `extensions/`, `README.md`, `LICENSE`.
- Runtime deps: none.
- Peer deps: Pi agent/AI/TUI packages plus `typebox`.
- Dev deps: Bun types, TypeScript/native preview, Biome.
- Main scripts:
  - `typecheck`: `tsgo --noEmit`
  - `test`: `bun test`
  - `test:apply-patch`: `bun test tests/apply-patch`
  - `check`: typecheck + Biome check

## Config model

Implemented in `extensions/lovely-codex/config.ts`.

Config schema:

```json
{
  "gptMode": "default | fast | fast-codex",
  "applyPatchAddMode": "on | off | gpt-only",
  "disableWrite": "boolean",
  "disableEdit": "boolean"
}
```

All fields are optional. Omitted means unset in that scope.

Defaults after scope merge:

- `gptMode`: `default`
- `applyPatchAddMode`: `on`
- `disableWrite`: `false`
- `disableEdit`: `false`

Scopes:

- global: `~/.pi/agent/xl0-pi-lovely-codex.json`
- project: `<cwd>/.pi/xl0-pi-lovely-codex.json`

Project overrides global through shallow merge:

```ts
{ ...global, ...project }
```

Config IO is sync and TypeBox-validated. Missing files load as `{}`.
Invalid JSON/schema throws a config error with file path.
Resetting a scope deletes its config file; missing file is OK.

## Extension lifecycle

Implemented in `extensions/lovely-codex/index.ts`.

Entrypoint `lovelyCodexExtension(pi)` owns process-local state:

- `config`: effective merged config
- `editToolBaseline`: active tool set captured at session start
- `selectedModelIsGpt`: current model GPT-ness for `gpt-only` apply-patch mode

On `session_start`:

1. capture active tools as baseline
2. load and merge both config scopes for current `cwd`
3. apply tool config to active tools
4. update `lovely-codex` status indicator

If config loading fails:

- config resets to empty scopes
- tool config applies defaults
- status clears
- UI shows error notification

Registered features:

- `/codex` command
- GPT mode request/message hooks
- `apply_patch` tool

Status indicator:

- hidden for `gptMode=default`
- `🏎️` in accent color for `fast` or `fast-codex`

## Tool activation semantics

`applyToolConfig()` mutates Pi active tools from maintained effective config and selected model state.

- `applyPatchAddMode=on`: add `apply_patch`
- `applyPatchAddMode=off`: remove `apply_patch`
- `applyPatchAddMode=gpt-only`: add `apply_patch` only when current model id
  starts with `gpt-` or contains `/gpt-`; model changes reapply tool config
- `disableWrite=true`: remove `write` while `apply_patch` is active;
  otherwise restore it only if present in session-start baseline
- `disableEdit=true`: remove `edit` while `apply_patch` is active;
  otherwise restore it only if present in session-start baseline

Baseline prevents extension from enabling tools that were not active before it ran.

## `/codex` command

Implemented in `extensions/lovely-codex/command.ts`.

Command takes no args and opens a TUI config editor.

UI:

- tabbed scopes: `User` = global, `Workspace` = project
- rows:
  - `GPT mode`: `unset`, `default`, `fast`, `fast-codex`
  - `add apply_patch`: `unset`, `on`, `off`, `gpt-only`
  - indented sub-options when `apply_patch` is effectively not `off`:
    - `disable write`: `unset`, `on`, `off`
    - `disable edit`: `unset`, `on`, `off`
  - `Reset to default`: separated destructive action; deletes active scope config file
- notes explain effective value:
  - workspace override
  - user inheritance
  - default fallback

Save behavior:

- writes only active scope
- updates command-local scoped config and extension effective config
- reapplies tool activation
- updates status indicator
- reset clears active scope in memory, deletes its file, then reapplies state

If one scoped config is invalid, command warns and opens that scope empty;
other scope still loads.

## GPT mode hooks

Implemented in `extensions/lovely-codex/gpt-mode.ts`.

Applies only to OpenAI GPT requests:

- provider: `openai` or `openai-codex`
- model id starts with `gpt-`

`before_provider_request` behavior:

- `default`: do not send `service_tier`
- `fast`: set `service_tier: "priority"` for both providers
- `fast-codex`: set priority only for `openai-codex`

`message_end` behavior:

- checks current mode at message end
- adjusts priority cost for `openai-codex` assistant messages

Mode is read through closure, so command changes affect later requests.

## `apply_patch` tool

Implemented in `extensions/lovely-codex/apply-patch.ts`.

Tool schema:

```ts
{ input: string }
```

Prompt describes Codex apply-patch format:

- full `*** Begin Patch` / `*** End Patch` envelope required
- supports add/update/delete/move operations
- supports multi-file/multi-hunk patches
- new lines in hunks must use `+`
- file paths must be relative

Execution:

1. parse touched paths from patch envelope
2. acquire Pi file mutation queues for touched files in sorted absolute-path order
3. snapshot touched files before run when possible
4. spawn `codex --codex-run-as-apply-patch <input>` in `ctx.cwd`
5. snapshot touched files after run when possible
6. build edit-like result metadata and rendered diff

Success returns combined `stdout + stderr` as tool text.

Failure throws combined output plus partial-change diff when available.

Raw result metadata kept:

- `exitCode`
- `stdout`
- `stderr`
- `output`

Edit-style details kept for Pi UI:

- `diff`
- unified `patch`
- `firstChangedLine`

TUI behavior:

- call line highlights touched filenames like `edit`
- result renders line-numbered diffs through Pi `renderDiff`
- failures keep thrown error text as LLM tool-result content, while a `tool_result`
  hook attaches captured command details for UI rendering
- failure UI renders raw combined output, then line-numbered partial-change
  diffs when available
- filename headers are prefixed only for multi-file diffs

Current impl delegates semantics to Codex CLI instead of native patch parser.

## Tests

Apply-patch tests live under `tests/apply-patch/`.

- `runners.ts`: shared black-box runner interface.
  - direct Codex CLI runner
  - Pi wrapper runner using extension `runCodexApplyPatch()`
- `fs.ts`: temp dir, fixture copy, recursive snapshot helpers.
- `scenario.test.ts`: runs copied upstream Codex scenarios against each runner;
  compares final filesystem state.
- `cli.test.ts`: explicit stdout/stderr/exit-code behavior cases.
- `tool.test.ts`: custom tool render/error propagation checks.
- `fixtures/scenarios/`: copied Codex fixture corpus with
  `input/`, `expected/`, `patch.txt` layout.

## Tooling and docs

- `tsconfig.json`: strict TypeScript for `extensions/` and `tests/`.
- `biome.json`: formatter/linter config aligned with adjacent Pi Lovely packages.
- `bun.lock`: dependency lock from `bun install`.
- `README.md`: user docs for install, `/codex`, scoped config, GPT modes,
  apply-patch modes, and Codex CLI requirement.
- `docs/APPLY_PATCH_REPORT.md`: source-level notes from Pi `apply_patch`
  review in `pi-codex-conversion`; reference for possible native impl.
