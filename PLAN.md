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
- `applyPatchMode` controls file-editing tool exposure: `disabled` removes `apply_patch`; `enabled` enables `apply_patch`; both non-replace modes restore `edit`/`write` only if active at session start; `replace-edit` enables `apply_patch` and removes active `edit`/`write`. Config is scoped like `gptMode`; default is `enabled`.

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
- [ ] Replace Codex-wrapper `apply_patch` with native Pi implementation.
