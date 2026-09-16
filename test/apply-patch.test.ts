import { describe, expect, test } from "bun:test"
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { runCodexApplyPatch } from "../extensions/lovely-codex/apply-patch"

// Regression test for gh #15: a CRLF target file must not be rewritten as LF,
// so the apply_patch subprocess has to carry
// CODEX_APPLY_PATCH_PRESERVE_LINE_ENDINGS=1. A fake `codex` on PATH observes
// the real spawn env end to end, with no module mocking.
describe("runCodexApplyPatch subprocess env (gh #15)", () => {
	test("preserves existing line endings in the target file", async () => {
		const dir = mkdtempSync(join(tmpdir(), "apply-patch-env-"))
		writeFileSync(
			join(dir, "codex"),
			'#!/bin/sh\necho "HOOKS_DISABLED=$CMUX_CODEX_HOOKS_DISABLED"\necho "PRESERVE_LE=$CODEX_APPLY_PATCH_PRESERVE_LINE_ENDINGS"\n'
		)
		chmodSync(join(dir, "codex"), 0o755)

		const { PATH: savedPath } = process.env
		Object.assign(process.env, { PATH: `${dir}:${savedPath}` })
		let result: Awaited<ReturnType<typeof runCodexApplyPatch>>
		try {
			result = await runCodexApplyPatch(dir, "*** Begin Patch\n*** End Patch\n")
		} finally {
			Object.assign(process.env, { PATH: savedPath })
		}
		expect(result.exitCode).toBe(0)
		expect(result.stdout).toContain("HOOKS_DISABLED=1")
		expect(result.stdout).toContain("PRESERVE_LE=1")
	}, 10000)
})
