# Plan

## High-level decisions
- Package is `@xl0/pi-lovely-codex`.
- Keep package boilerplate aligned with `pi-lovely-dev-tools` and `pi-lovely-web`.
- GPT mode config lives in `xl0-pi-lovely-codex.json` under User `~/.pi/agent/` and Workspace `.pi/`; Workspace overrides User. Omitted `gptMode` is unset; effective mode falls through to User or default. Runtime keeps configs by scope in memory; command writes only touched scope. Invalid session reload fails closed to default; command warns and ignores only bad scope.
- Non-default GPT mode shows `🏎️` in the status line; `default` clears the indicator.
- GPT modes map to OpenAI service tiers: `default` -> omit service tier, `fast` -> priority for `openai` and `openai-codex`, `fast-codex` -> priority only for `openai-codex`.
- Apply service-tier payload only to OpenAI GPT models (`provider` `openai`/`openai-codex`, id starts `gpt-`) to avoid breaking other OpenAI-compatible providers.
- Adjust priority pricing on finalized `openai-codex` assistant messages; normal OpenAI provider responses keep native provider pricing behavior.
- `docs/APPLY_PATCH_REPORT.md` captures source review of existing Pi-native `apply_patch`; use as reference when replacing current wrapper.
- File-editing tool exposure is split: `applyPatchAddMode` (`on`/`off`/`gpt-only`, default `gpt-only`) controls adding `apply_patch`; `disableWrite`/`disableEdit` booleans (default `false`) remove baseline `write`/`edit` only while `apply_patch` is active. Config is scoped like `gptMode`.

## Todo
- [x] Add package manifest and Pi extension entry.
- [x] Add TypeScript/Biome tooling config.
- [x] Add README, LICENSE, `.gitignore`.
- [x] Add CODE/PLAN docs.
- [x] Add no-arg `/codex` tabbed User/Workspace mode config command with unset support.
- [x] Inject GPT service-tier payload from config.
- [x] Adjust Codex cost for priority mode.
- [x] Add Codex-backed `apply_patch` black-box test harness.
- [x] Copy upstream scenario fixtures into repo.
- [x] Add Pi `apply_patch` runner to same harness.
- [x] Extract internal schema-driven scoped config helper and port `/codex`.
- [ ] Add string/number field UX before extracting helper to shared package.
- [ ] Replace Codex-wrapper `apply_patch` with native Pi implementation.

## Scoped config helper extraction

Implemented internally in `extensions/lovely-codex/scoped-config-command.ts`.

Current scope:

- fixed User/Workspace scopes
- shallow merge, Workspace overrides User
- flat persisted keys; field `children` are UI-only
- field defaults drive notes and visibility, not persisted output
- supported field kinds: `enum`, `boolean`
- field descriptors derive TypeBox schema
- helper owns config IO and TUI command UI
- caller owns runtime side effects via `onChange(effective, scoped, ctx)`
- immediate writes on field change; unset removes key
- reset deletes active scope file
- hidden fields remain persisted/effective

Before extracting to a shared helper/package, decide and implement string/number editing UX.
