# Plan

## Intent

`@xl0/pi-lovely-codex` makes Pi behave well against OpenAI Codex models.
Three things matter, in this order:

1. **Speed on demand.** Let the user pay for OpenAI's priority tier per
   user/workspace, and either everywhere or only for `openai-codex`. Never
   touch requests that aren't OpenAI GPT — other OpenAI-compatible providers
   must be unaffected. Show the user when they're paying for it.
2. **A real `apply_patch`.** Codex models expect it, so give them the genuine
   article by delegating to the Codex CLI rather than reimplementing patch
   semantics. Prefer the grammar-constrained freeform tool where the model
   supports it. Result rendering should feel like Pi's own `edit`.
3. **Don't fight the model.** When `apply_patch` is live, let the user hide
   `write`/`edit` so the model stops reaching for them — but never enable a
   tool the session didn't already have.

Configuration is scoped (User, Workspace-overrides-User), edited from a single
no-arg `/lovely-codex` TUI command, and tolerant of files it didn't write:
unknown keys survive, bad known values warn and fall back, malformed JSON is a
hard error. The generic half of that lives in `@xl0/pi-lovely-config`, shared
with the other Lovely packages; this package only owns its field list and the
runtime side effects.

Keep boilerplate aligned with `pi-lovely-dev-tools` and `pi-lovely-web`.

## Todo

Everything above is implemented and documented in `CODE.md`.

- [x] Package, tooling, docs, license.
- [x] Scoped config + `/lovely-codex` editor, extracted into
      `@xl0/pi-lovely-config` and consumed via `bun link` during development.
- [x] GPT service-tier injection and priority cost adjustment.
- [x] Benchmark Codex-subscription and API-key service tiers across GPT-5.4,
      5.5, and 5.6 variants; retain raw results, analysis, and chart.
- [x] `apply_patch` tool, with Lark-grammar freeform variant and JSON fallback.
- [x] Tool activation from config, gated on session-start baseline.

Nothing open. No native patch implementation is planned; no automated tests
are kept in this package.
