# Plan

## High-level decisions
- Package is `@xl0/pi-lovely-codex`.
- Keep package boilerplate aligned with `pi-lovely-dev-tools` and `pi-lovely-web`.
- GPT mode config lives in `xl0-pi-lovely-codex.json` under global `~/.pi/agent/` and project `.pi/`; project overrides global.
- GPT modes map to OpenAI service tiers: `default` -> omit service tier, `fast` -> priority for `openai` and `openai-codex`, `fast-codex` -> priority only for `openai-codex`.
- Apply service-tier payload only to OpenAI GPT models (`provider` `openai`/`openai-codex`, id starts `gpt-`) to avoid breaking other OpenAI-compatible providers.
- Adjust priority pricing on finalized `openai-codex` assistant messages; normal OpenAI provider responses keep native provider pricing behavior.

## Todo
- [x] Add package manifest and Pi extension entry.
- [x] Add TypeScript/Biome tooling config.
- [x] Add README, LICENSE, `.gitignore`.
- [x] Add CODE/PLAN docs.
- [x] Add `/codex` mode config command.
- [x] Inject GPT service-tier payload from config.
- [x] Adjust Codex cost for priority mode.
