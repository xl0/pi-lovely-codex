import { spawn } from "node:child_process"

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

export const runners = [codexRunner]
