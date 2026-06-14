import { spawn } from "node:child_process"
import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent"
import { Type } from "typebox"

const ApplyPatchParams = Type.Object({
	input: Type.String({ description: "Patch text wrapped in *** Begin Patch / *** End Patch" })
})

export interface ApplyPatchCommandResult {
	exitCode: number
	stdout: string
	stderr: string
	output: string
}

export function buildApplyPatchOutput(stdout: string, stderr: string): string {
	return `${stdout}${stderr}`
}

export async function runCodexApplyPatch(cwd: string, input: string): Promise<ApplyPatchCommandResult> {
	return new Promise((resolve, reject) => {
		const child = spawn("codex", ["--codex-run-as-apply-patch", input], {
			cwd,
			stdio: ["ignore", "pipe", "pipe"]
		})
		let stdout = ""
		let stderr = ""
		child.stdout.on("data", chunk => {
			stdout += chunk.toString()
		})
		child.stderr.on("data", chunk => {
			stderr += chunk.toString()
		})
		child.on("error", reject)
		child.on("close", code => {
			resolve({
				exitCode: code ?? 1,
				stdout,
				stderr,
				output: buildApplyPatchOutput(stdout, stderr)
			})
		})
	})
}

const applyPatchTool = defineTool({
	name: "apply_patch",
	label: "apply_patch",
	description:
		"Apply file edits using Codex apply_patch format. Pass single `input` string containing full patch envelope starting with *** Begin Patch and ending with *** End Patch.",
	promptSnippet: "Apply file edits via Codex apply_patch patch string in input arg",
	promptGuidelines: [
		"Use apply_patch for multi-file or multi-hunk edits when precise patch format is convenient.",
		"Pass patch text in single input arg. Do not wrap patch in JSON string inside string.",
		"Always include full patch envelope with *** Begin Patch and *** End Patch."
	],
	parameters: ApplyPatchParams,
	executionMode: "sequential",
	async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
		const result = await runCodexApplyPatch(ctx.cwd, params.input)
		if (result.exitCode !== 0) {
			throw new Error(result.output || `apply_patch failed with exit code ${result.exitCode}`)
		}
		return {
			content: [{ type: "text", text: result.output }],
			details: {
				exitCode: result.exitCode,
				stdout: result.stdout,
				stderr: result.stderr
			}
		}
	}
})

export function registerApplyPatchTool(pi: ExtensionAPI) {
	pi.registerTool(applyPatchTool)
}
