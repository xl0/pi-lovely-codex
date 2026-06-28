import { spawn } from "node:child_process"
import { existsSync, readFileSync, statSync } from "node:fs"
import { resolve } from "node:path"
import {
	defineTool,
	type ExtensionAPI,
	generateDiffString,
	generateUnifiedPatch,
	renderDiff,
	type Theme,
	withFileMutationQueue
} from "@earendil-works/pi-coding-agent"
import { Container, Spacer, Text } from "@earendil-works/pi-tui"
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

export interface ApplyPatchToolDetails extends ApplyPatchCommandResult {
	diff?: string
	patch?: string
	firstChangedLine?: number
}

const failureDetails = new Map<string, ApplyPatchToolDetails>()

interface FileSnapshot {
	path: string
	exists: boolean
	content?: string
}

export function buildApplyPatchOutput(stdout: string, stderr: string): string {
	return `${stdout}${stderr}`
}

function readTextContent(result: { content: Array<{ type: string; text?: string }> }): string {
	return result.content
		.map(block => (block.type === "text" ? block.text : undefined))
		.filter((text): text is string => Boolean(text))
		.join("\n")
}

function trimTrailingNewline(text: string): string {
	return text.endsWith("\n") ? text.slice(0, -1) : text
}

function renderApplyPatchInput(input: string, theme: Theme): string {
	return input
		.split("\n")
		.map(line => {
			if (line.startsWith("*** ")) return theme.fg("accent", theme.bold(line))
			if (line.startsWith("@@")) return theme.fg("mdLink", line)
			if (line.startsWith("+")) return theme.fg("toolDiffAdded", line)
			if (line.startsWith("-")) return theme.fg("toolDiffRemoved", line)
			if (line.startsWith(" ")) return theme.fg("toolDiffContext", line)
			return theme.fg("muted", line)
		})
		.join("\n")
}

function parseTouchedPaths(input: string): string[] {
	const paths = new Set<string>()
	let currentPath: string | undefined
	for (const line of input.split("\n")) {
		const fileMatch = line.match(/^\*\*\* (?:Add|Update|Delete) File: (.+)$/)
		if (fileMatch?.[1]) {
			currentPath = fileMatch[1]
			paths.add(currentPath)
			continue
		}

		const moveMatch = line.match(/^\*\*\* Move to: (.+)$/)
		if (moveMatch?.[1]) {
			if (currentPath) paths.add(currentPath)
			paths.add(moveMatch[1])
			currentPath = moveMatch[1]
		}
	}
	return Array.from(paths)
}

function readSnapshot(cwd: string, path: string): FileSnapshot {
	const absolutePath = resolve(cwd, path)
	if (!existsSync(absolutePath)) return { path, exists: false, content: "" }
	try {
		if (!statSync(absolutePath).isFile()) return { path, exists: true }
		return { path, exists: true, content: readFileSync(absolutePath, "utf-8") }
	} catch {
		return { path, exists: true }
	}
}

function buildDiff(before: FileSnapshot[], after: FileSnapshot[]): Pick<ApplyPatchToolDetails, "diff" | "patch" | "firstChangedLine"> {
	const changedDiffs: { path: string; diff: string }[] = []
	let firstChangedLine: number | undefined

	for (const oldFile of before) {
		const newFile = after.find(file => file.path === oldFile.path)
		if (!newFile || (oldFile.exists === newFile.exists && oldFile.content === newFile.content)) continue
		if (oldFile.content === undefined || newFile.content === undefined) continue

		const diff = generateDiffString(oldFile.content, newFile.content)
		if (diff.diff) {
			changedDiffs.push({ path: oldFile.path, diff: diff.diff })
			firstChangedLine ??= diff.firstChangedLine
		}
	}

	const onlyChangedFile = changedDiffs[0]
	const diffParts =
		changedDiffs.length === 1 && onlyChangedFile ? [onlyChangedFile.diff] : changedDiffs.flatMap(file => [file.path, file.diff])

	const result: Pick<ApplyPatchToolDetails, "diff" | "patch" | "firstChangedLine"> = {
		diff: diffParts.join("\n"),
		patch: changedDiffs
			.map(file => {
				const oldFile = before.find(snapshot => snapshot.path === file.path)
				const newFile = after.find(snapshot => snapshot.path === file.path)
				if (oldFile?.content === undefined || newFile?.content === undefined) return ""
				return generateUnifiedPatch(file.path, oldFile.content, newFile.content)
			})
			.filter(Boolean)
			.join("\n")
	}
	if (firstChangedLine !== undefined) result.firstChangedLine = firstChangedLine
	return result
}

async function withTouchedFileMutationQueues<T>(cwd: string, touchedPaths: string[], fn: () => Promise<T>): Promise<T> {
	const absolutePaths = Array.from(new Set(touchedPaths.map(path => resolve(cwd, path)))).sort()
	let queued = fn
	for (const path of absolutePaths) {
		const next = queued
		queued = () => withFileMutationQueue(path, next)
	}
	return queued()
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

export const applyPatchTool = defineTool({
	name: "apply_patch",
	label: "apply_patch",
	description:
		"Use the `apply_patch` tool to edit files using Codex apply_patch format. Pass a single `input` string containing the full patch envelope starting with *** Begin Patch and ending with *** End Patch.",
	promptSnippet: "Use apply_patch to edit files via Codex apply_patch format",
	promptGuidelines: [
		"Use apply_patch for text-file changes, including creates, deletes, and moves; group related multi-file edits into one patch.",
		"apply_patch can combine several file operations: Add File, Update File, Delete File, and Move to.",
		"apply_patch input must include full patch envelope with *** Begin Patch and *** End Patch.",
		"apply_patch input must include one or more file sections; each section starts with *** Add File:, *** Update File:, or *** Delete File:.",
		"apply_patch requires new lines to be prefixed with + when adding a file or adding lines in an update hunk.",
		"apply_patch file paths must be relative, never absolute."
	],
	parameters: ApplyPatchParams,
	executionMode: "sequential",
	renderCall(args, theme, context) {
		const input = typeof args?.input === "string" ? args.input : ""
		const paths = parseTouchedPaths(input).join(", ")
		const suffix = paths ? ` ${theme.fg("accent", paths)}` : ""
		const header = `${theme.fg("toolTitle", theme.bold("apply_patch"))}${suffix}`
		if (!context.isPartial || !input) return new Text(header, 0, 0)

		const component = new Container()
		component.addChild(new Text(header, 0, 0))
		component.addChild(new Spacer(1))
		component.addChild(new Text(renderApplyPatchInput(input, theme), 0, 0))
		return component
	},
	async execute(toolCallId, params, _signal, _onUpdate, ctx) {
		const touchedPaths = parseTouchedPaths(params.input)
		const { result, diffDetails } = await withTouchedFileMutationQueues(ctx.cwd, touchedPaths, async () => {
			const before = touchedPaths.map(path => readSnapshot(ctx.cwd, path))
			const result = await runCodexApplyPatch(ctx.cwd, params.input)
			const after = touchedPaths.map(path => readSnapshot(ctx.cwd, path))
			return { result, diffDetails: buildDiff(before, after) }
		})
		if (result.exitCode !== 0) {
			failureDetails.set(toolCallId, { ...result, ...diffDetails })
			const diffOutput = diffDetails.diff ? `\n\nPartial changes:\n${diffDetails.diff}` : ""
			throw new Error((result.output || `apply_patch failed with exit code ${result.exitCode}`) + diffOutput)
		}
		failureDetails.delete(toolCallId)
		return {
			content: [{ type: "text", text: result.output }],
			details: {
				exitCode: result.exitCode,
				stdout: result.stdout,
				stderr: result.stderr,
				output: result.output,
				...diffDetails
			}
		}
	},
	renderResult(result, _options, _theme, context) {
		const component = new Container()
		component.clear()
		if (context.isError) {
			const details = result.details as ApplyPatchToolDetails | undefined
			if (details?.exitCode !== undefined) {
				component.addChild(new Spacer(1))
				if (details.output) {
					component.addChild(new Text(trimTrailingNewline(details.output), 0, 0))
				}
				if (details.diff) {
					component.addChild(new Text("Partial changes:", 0, 0))
					component.addChild(new Text(renderDiff(details.diff), 0, 0))
				}
				return component
			}

			const output = readTextContent(result)
			if (!output) return component
			component.addChild(new Spacer(1))
			component.addChild(new Text(output, 1, 0))
			return component
		}

		const details = result.details as ApplyPatchToolDetails | undefined
		if (!details?.diff) return component

		component.addChild(new Spacer(1))
		component.addChild(new Text(renderDiff(details.diff), 1, 0))
		return component
	}
})

export function registerApplyPatchTool(pi: ExtensionAPI) {
	pi.registerTool(applyPatchTool)
	pi.on("tool_result", event => {
		if (event.toolName !== "apply_patch") return undefined
		const details = failureDetails.get(event.toolCallId)
		if (!details) return undefined
		failureDetails.delete(event.toolCallId)
		return { details }
	})
}
