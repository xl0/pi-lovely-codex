import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join, resolve } from "node:path"
import { type Static, Type } from "typebox"
import Schema from "typebox/schema"

export const CONFIG_FILE_NAME = "xl0-pi-lovely-codex.json"
export const DEFAULT_GPT_MODE = "default" satisfies GptMode

export const codexConfigSchema = Type.Object({
	gptMode: Type.Optional(Type.Union([Type.Literal("default"), Type.Literal("fast"), Type.Literal("fast-codex")]))
})

const codexConfigValidator = Schema.Compile(codexConfigSchema)

export type CodexConfig = Static<typeof codexConfigSchema>
export type GptMode = NonNullable<CodexConfig["gptMode"]>

export function getGptMode(config: CodexConfig): GptMode {
	return config.gptMode ?? DEFAULT_GPT_MODE
}

export function loadConfig(cwd: string): CodexConfig {
	const global = readConfigFile(join(homedir(), ".pi", "agent", CONFIG_FILE_NAME))
	const project = readConfigFile(resolve(cwd, ".pi", CONFIG_FILE_NAME))
	return { ...global, ...project }
}

export function readConfigFile(path: string): CodexConfig {
	if (!existsSync(path)) return {}
	const raw = readFileSync(path, "utf-8")
	try {
		return codexConfigValidator.Parse(JSON.parse(raw))
	} catch (error) {
		throw new Error(`Could not parse Lovely Codex config at ${path}: ${error instanceof Error ? error.message : String(error)}`)
	}
}

export function writeConfigFile(path: string, config: CodexConfig): void {
	mkdirSync(resolve(path, ".."), { recursive: true })
	writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`, "utf-8")
}
