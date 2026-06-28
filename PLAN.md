# Plan

## High-level decisions
- Package is `@xl0/pi-lovely-codex`.
- Keep package boilerplate aligned with `pi-lovely-dev-tools` and `pi-lovely-web`.
- GPT mode config lives in `xl0-pi-lovely-codex.json` under User `~/.pi/agent/` and Workspace `.pi/`; Workspace overrides User. Omitted `gptMode` is unset; effective mode falls through to User or default. Runtime keeps resolved config plus raw scoped patches in memory; command writes only touched keys. Invalid known values warn and are ignored while resolving. Invalid JSON/non-object files are hard config errors.
- Non-default GPT mode shows `🏎️` in the status line; `default` clears the indicator.
- GPT modes map to OpenAI service tiers: `default` -> omit service tier, `fast` -> priority for `openai` and `openai-codex`, `fast-codex` -> priority only for `openai-codex`.
- Apply service-tier payload only to OpenAI GPT models (`provider` `openai`/`openai-codex`, id starts `gpt-`) to avoid breaking other OpenAI-compatible providers.
- Adjust priority pricing on finalized `openai-codex` assistant messages; normal OpenAI provider responses keep native provider pricing behavior.
- `docs/APPLY_PATCH_REPORT.md` captures source review of existing Pi-native `apply_patch`; use as reference when replacing current wrapper.
- File-editing tool exposure is split: `applyPatchAddMode` (`on`/`off`/`gpt-only`, default `gpt-only`) controls adding `apply_patch`; `disableWrite`/`disableEdit` booleans (default `false`) remove baseline `write`/`edit` only while `apply_patch` is active. Config is scoped like `gptMode`.
- Scoped config helper comes from `@xl0/pi-lovely-config`; local development overrides it with `bun link @xl0/pi-lovely-config`.

## Todo
- [x] Add package manifest and Pi extension entry.
- [x] Add TypeScript/Biome tooling config.
- [x] Add README, LICENSE, `.gitignore`.
- [x] Add CODE/PLAN docs.
- [x] Add no-arg `/lovely-codex` tabbed User/Workspace mode config command with unset support.
- [x] Inject GPT service-tier payload from config.
- [x] Adjust Codex cost for priority mode.
- [x] Add Codex-backed `apply_patch` black-box test harness.
- [x] Copy upstream scenario fixtures into repo.
- [x] Add Pi `apply_patch` runner to same harness.
- [x] Extract internal schema-driven scoped config helper and port `/lovely-codex`.
- [x] Show a warning when scoped config JSON/type is invalid and ignored.
- [x] Link local `@xl0/pi-lovely-config` package with `bun link` and import scoped config helpers from it.
- [ ] Replace Codex-wrapper `apply_patch` with native Pi implementation.

## Scoped config helper extraction

Moved to `../pi-lovely-config/`; this package consumes it through local npm file link.

Current scope:

- fixed User/Workspace scopes
- shallow merge, Workspace overrides User
- flat persisted known keys; unknown file properties are preserved across save
- field `depth` is UI-only
- field defaults drive resolved config, notes, and visibility, not persisted output
- this package uses supported field kinds: `enum`, `boolean`
- field builders derive JSON schema and stateful config objects
- helper owns config IO, key updates/reset, and reusable TUI editor UI; command registration stays in extension code
- caller owns runtime side effects via `onChange(config)`
- immediate writes on field change; unset removes key
- reset deletes known keys in active scope and preserves unknown keys
- hidden fields remain persisted/effective

String field UX exists in the shared package; number fields are not used here.
