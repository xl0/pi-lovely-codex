import { beforeAll, describe, expect, test } from "bun:test"
import { join } from "node:path"
import { initTheme } from "@earendil-works/pi-coding-agent"
import { applyPatchTool, registerApplyPatchTool } from "../../extensions/lovely-codex/apply-patch"
import { withTempDir } from "./fs"

describe("apply_patch tool", () => {
	beforeAll(() => {
		initTheme()
	})

	test("renders error tool-result text", () => {
		const component = applyPatchTool.renderResult?.(
			{
				content: [{ type: "text", text: "Failed to apply patch" }],
				details: {}
			},
			{ expanded: false, isPartial: false },
			{} as never,
			{ isError: true } as never
		)

		expect(component?.render(80).join("\n")).toContain("Failed to apply patch")
	})

	test("renders structured failure details", () => {
		const component = applyPatchTool.renderResult?.(
			{
				content: [{ type: "text", text: "Failed to apply patch" }],
				details: {
					exitCode: 1,
					stdout: "",
					stderr: "Failed to apply patch\n",
					output: "Failed to apply patch\n",
					diff: "+1 partial change"
				}
			},
			{ expanded: false, isPartial: false },
			{} as never,
			{ isError: true } as never
		)

		const output = component?.render(80).join("\n")
		expect(output).toContain("apply_patch failed (exit 1)")
		expect(output).toContain("stderr:")
		expect(output).toContain("Failed to apply patch")
		expect(output).toContain("Partial changes:")
		expect(output).toContain("partial change")
	})

	test("throws failure text for agent tool result", async () => {
		await withTempDir(async cwd => {
			await expect(
				applyPatchTool.execute(
					"apply-patch-test",
					{
						input: `*** Begin Patch
*** Update File: missing.txt
@@
-old
+new
*** End Patch`
					},
					undefined,
					undefined,
					{ cwd } as never
				)
			).rejects.toThrow(`Failed to read file to update ${join(cwd, "missing.txt")}: No such file or directory (os error 2)`)
		})
	})

	test("stores failure details for tool_result hook without changing content", async () => {
		await withTempDir(async cwd => {
			let tool = applyPatchTool
			let handler: ((event: Record<string, unknown>) => unknown) | undefined
			registerApplyPatchTool({
				registerTool(registeredTool: typeof applyPatchTool) {
					tool = registeredTool
				},
				on(event: string, registeredHandler: (event: Record<string, unknown>) => unknown) {
					if (event === "tool_result") handler = registeredHandler as typeof handler
				}
			} as never)

			const toolCallId = "apply-patch-test"
			let message = ""
			try {
				await tool.execute(
					toolCallId,
					{
						input: `*** Begin Patch
*** Update File: missing.txt
@@
-old
+new
*** End Patch`
					},
					undefined,
					undefined,
					{ cwd } as never
				)
			} catch (error) {
				message = error instanceof Error ? error.message : String(error)
			}

			const hookResult = handler?.({
				type: "tool_result",
				toolName: "apply_patch",
				toolCallId,
				input: {},
				content: [{ type: "text", text: message }],
				details: {},
				isError: true
			}) as { details?: { stderr?: string }; content?: unknown } | undefined

			expect(hookResult?.content).toBeUndefined()
			expect(hookResult?.details?.stderr).toContain(`Failed to read file to update ${join(cwd, "missing.txt")}`)
		})
	})
})
