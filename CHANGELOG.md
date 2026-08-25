# Changelog

## [Unreleased]

### Added

- `disable read` setting (`on` / `off` / `gpt-only`, default `gpt-only`): removes the built-in `read` tool so the model falls back to bounded shell reads (`sed -n` / `head`), conserving context the way Codex's toolless design does. Independent of `apply_patch`, unlike `disable write` / `disable edit`.
- `view_image` tool, active while `read` is disabled (toggle with the `add view_image` setting, default on): preserves image reading (which shell reads can't do). Images are recognized by content, not extension; anything else is refused.

## [0.2.1] - 2026-08-13

### Changed

- `apply_patch` freeform (grammar-constrained) mode is now opt-in via the `enable freeform` setting; the default emits the JSON input schema.

### Fixed

- Use the renamed model grammar-tool compatibility flag when deciding whether freeform tools are supported.

## [0.2.0] - 2026-07-28

### Added

- `apply_patch` can emit as a grammar-constrained custom tool on models that declare grammar-tool support, with Pi mapping the streamed body back to `input`.
- TUI rendering for `apply_patch`: touched filenames highlighted, streamed patch input diff-colored while pending, line-numbered diffs on completion.

### Changed

- Config moved onto the shared scoped-config engine (`@xl0/pi-lovely-config`) with User/Workspace scopes.

## [0.1.2] - 2026-07-28

### Fixed

- Use a supported typebox compiler import.

## [0.1.0] - 2026-07-28

Initial release.

### Added

- Per-scope GPT service-tier control (`fast` / `fast-codex`), a Codex-compatible `apply_patch` tool, and `disable write` / `disable edit` to drop the redundant built-in editors while `apply_patch` is active.
