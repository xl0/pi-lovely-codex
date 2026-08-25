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
   semantics. Use the conventional JSON shape by default; let users opt into
   grammar-constrained freeform where supported. Result rendering should
   feel like Pi's own `edit`.
3. **Don't fight the model.** When `apply_patch` is live, let the user hide
   `write`/`edit` so the model stops reaching for them — but never enable a
   tool the session didn't already have.
4. **Conserve context like Codex does.** Optionally take `read` away so the
   model uses bounded shell reads, keeping only an image-reading stand-in.

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
- [x] `apply_patch` tool, JSON by default with Lark-grammar freeform opt-in.
- [x] Tool activation from config, gated on session-start baseline, restored
      on `session_shutdown` so `/reload` can't ratchet tools away.
- [x] `disable read` + `view_image` (on Pi's exported sniff/process helpers);
      changelog, release script, publish CI.
- [ ] Skills section survives a missing `read` — pending pi PR.

No native patch implementation is planned; no automated tests are kept in
this package.
