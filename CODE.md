# Code

## Role

Pi package adding Codex-oriented controls to the coding agent:

- choose GPT service-tier behavior per user/workspace
- expose Codex-compatible `apply_patch`
- control file-editing tools per user/workspace

State below describes current codebase, not history.

## Package shape

- `package.json` publishes `@xl0/pi-lovely-codex` as ESM.
- Package metadata includes MIT license, xl0 author/publisher, GitHub homepage,
  repository, issue tracker, and Bun package manager.
- Pi loads extension entrypoints from `./extensions` via `pi.extensions`.
- Published files: `extensions/`, `README.md`, `LICENSE`.
- Runtime deps: `@xl0/pi-lovely-config` plus `typebox`.
- Peer deps: Pi agent/AI/TUI packages.
- Dev deps: TypeScript/native preview and Biome.
- Main scripts:
  - `typecheck`: `tsgo --noEmit`
  - `check`: typecheck + Biome check

## Config model

Implemented in `extensions/lovely-codex/config.ts` as `codexConfigSchema` plus
`codexConfigSpec = defineScopedConfig(...)`.
`CodexConfig` is the effective value shape derived from field schema with
`ConfigFromSchema`. Loaded scoped patches live on `codexConfigSpec.scoped` as
raw per-scope records so unknown/invalid file values can survive load/save.
Field builders drive runtime schema/defaults/UI and static config typing.

Config schema:

```json
{
  "gptMode": "default | fast | fast-codex",
  "applyPatchAddMode": "on | off | gpt-only",
  "disableWrite": "boolean",
  "disableEdit": "boolean"
}
```

All persisted fields are optional. Omitted means unset in that scope.

Defaults after scope merge, exposed as `codexConfigSpec.defaults`:

- `gptMode`: `default`
- `applyPatchAddMode`: `gpt-only`
- `disableWrite`: `false`
- `disableEdit`: `false`

Scopes:

- user: `${getAgentDir()}/xl0-pi-lovely-codex.json` (default `~/.pi/agent/...`)
- workspace: `<cwd>/${CONFIG_DIR_NAME}/xl0-pi-lovely-codex.json` (default `<cwd>/.pi/...`)

Workspace overrides user through shallow merge:

```ts
{ ...user, ...workspace }
```

Config IO is sync through stateful `@xl0/pi-lovely-config` config instances.
Missing files load as `{}` for that scope.
Invalid JSON or non-object config files throw a diagnostic error with the file
path.
Invalid known values produce warnings and are ignored while resolving.
Unknown file properties are preserved across load/save but ignored by resolved
typed behavior.
Resetting a scope deletes known keys in that scope, preserves unknown keys, and
removes the file if empty.

## Extension lifecycle

Implemented in `extensions/lovely-codex/index.ts`.

Entrypoint `lovelyCodexExtension(pi)` owns process-local state:

- `configValue`: default-filled effective config
- `editToolBaseline`: active tool set captured at session start
- `selectedModelIsGpt`: current model GPT-ness for `gpt-only` apply-patch mode

On `session_start`:

1. capture active tools as baseline
2. load and merge both config scopes for current `cwd`
3. apply tool config to active tools
4. update `lovely-codex` status indicator

If config loading fails due to an unreadable file or other IO error:

- config resets to empty scopes/defaults
- tool config applies defaults
- status clears
- UI shows error notification keyed by config filename

Registered features:

- `/lovely-codex` command
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

## Scoped config helper

Imported from `@xl0/pi-lovely-config`; during local development it is overridden
with `bun link @xl0/pi-lovely-config`.

Used exports:

- `defineScopedConfig({ fileName, schema })`: validates field schema and returns a stateful config instance with defaults, scoped IO, scoped updates, and reset
- `field.enum()`, `field.boolean()`: build this extension's supported fields
- `ConfigFromSchema<Schema>`: derives resolved config object type from schema
- `ScopedConfigEditor`: reusable scoped TUI config editor component.

Lovely Codex currently uses `enum` and `boolean` fields.
Persisted keys are flat; optional field `depth` controls UI indentation only.
Defaults originate on fields, are written into generated schema, are exposed through the config instance, and are used for resolved config, UI notes, and visibility; defaults are not persisted.
`visibleWhen` reads default-filled effective config through `get()` and can read scoped values through `getScoped()`.
Hidden fields stay persisted/effective.
Enum defaults are checked against their values at type level and runtime.
Manual invalid known values warn and are ignored while resolving until fixed.
Writes are immediate per field cycle; unset deletes only that key.
Reset deletes known keys from the active scope and preserves unknown keys.
Caller owns runtime side effects through `onChange(config)`.

## `/lovely-codex` command

Registered in `extensions/lovely-codex/index.ts`; scoped config helper only supplies config IO and editor UI.

Command takes no args and opens a TUI config editor.
Non-TUI invocation is ignored.

UI:

- tabbed scopes: `User` and `Workspace`
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

- writes only active scope immediately
- updates the stateful config instance and extension effective config through helper `onChange`
- reapplies tool activation
- updates status indicator
- reset clears known active-scope keys, preserves unknown keys, then reapplies state

Manual invalid known values show warnings and are ignored while resolving.
Invalid JSON or non-object config files show an error and the command does not
open until the file is fixed.

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
- while the tool call/result is pending, call render shows streamed `input`
  with lightweight apply-patch diff coloring
- result renders line-numbered diffs through Pi `renderDiff`
- failures keep thrown error text as LLM tool-result content, while a `tool_result`
  hook attaches captured command details for UI rendering
- failure UI renders raw combined output, then line-numbered partial-change
  diffs when available
- filename headers are prefixed only for multi-file diffs

Current impl delegates semantics to Codex CLI instead of native patch parser.
No native implementation is currently planned.

## Tests

No automated tests are currently kept in this package.

## Tooling and docs

- `tsconfig.json`: strict TypeScript for `extensions/`.
- `biome.json`: formatter/linter config aligned with adjacent Pi Lovely packages.
- lockfiles are ignored; package scripts run through Bun.
- `README.md`: user docs for install, `/lovely-codex`, scoped config, GPT modes,
  apply-patch modes, Codex CLI requirement, and related Lovely Pi projects footer.
