import { spawn } from "node:child_process"
import { runCodexApplyPatch } from "../../extensions/lovely-codex/apply-patch"

export type RunResult = {
	exitCode: number
	stdout: string
	stderr: string
}

export type Runner = {
	name: string
	run(cwd: string, patch: string): Promise<RunResult>
}

function runCommand(command: string, args: string[], cwd: string): Promise<RunResult> {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			cwd,
			stdio: ["ignore", "pipe", "pipe"]
		})
		let stdout = ""
		let stderr = ""
		child.stdout.on("data", (chunk: Buffer | string) => {
			stdout += chunk.toString()
		})
		child.stderr.on("data", (chunk: Buffer | string) => {
			stderr += chunk.toString()
		})
		child.on("error", reject)
		child.on("close", code => {
			resolve({
				exitCode: code ?? 1,
				stdout,
				stderr
			})
		})
	})
}

export const codexRunner: Runner = {
	name: "codex",
	async run(cwd, patch) {
		return runCommand("codex", ["--codex-run-as-apply-patch", patch], cwd)
	}
}

export const piCodexWrapperRunner: Runner = {
	name: "pi-codex-wrapper",
	async run(cwd, patch) {
		const result = await runCodexApplyPatch(cwd, patch)
		return {
			exitCode: result.exitCode,
			stdout: result.stdout,
			stderr: result.stderr
		}
	}
}

export const runners = [codexRunner, piCodexWrapperRunner]
