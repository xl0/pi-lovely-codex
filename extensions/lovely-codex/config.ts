import {
	type ConfigScope,
	createScopedConfigIO,
	createScopedConfigSchema,
	type ScopedConfig,
	type ScopedConfigField
} from "./scoped-config-command.js"

export const CONFIG_FILE_NAME = "xl0-pi-lovely-codex.json"

export type GptMode = "default" | "fast" | "fast-codex"
export type ApplyPatchAddMode = "off" | "on" | "gpt-only"
export type CodexConfig = {
	gptMode?: GptMode
	applyPatchAddMode?: ApplyPatchAddMode
	disableWrite?: boolean
	disableEdit?: boolean
}

export const DEFAULT_GPT_MODE = "default" satisfies GptMode
export const DEFAULT_APPLY_PATCH_ADD_MODE = "gpt-only" satisfies ApplyPatchAddMode
export const DEFAULT_DISABLE_WRITE = false
export const DEFAULT_DISABLE_EDIT = false

export const codexConfigFields = [
	{
		key: "gptMode",
		label: "GPT mode",
		kind: "enum",
		values: ["default", "fast", "fast-codex"],
		default: "default"
	},
	{
		key: "applyPatchAddMode",
		label: "add apply_patch",
		kind: "enum",
		values: ["on", "off", "gpt-only"],
		default: "gpt-only",
		children: [
			{
				key: "disableWrite",
				label: "disable write",
				kind: "boolean",
				default: false,
				visibleWhen: ({ get }) => get("applyPatchAddMode") !== "off"
			},
			{
				key: "disableEdit",
				label: "disable edit",
				kind: "boolean",
				default: false,
				visibleWhen: ({ get }) => get("applyPatchAddMode") !== "off"
			}
		]
	}
] as const satisfies readonly ScopedConfigField[]

export const codexConfigSchema = createScopedConfigSchema(codexConfigFields)

export type { ConfigScope }
export type ScopedCodexConfig = ScopedConfig<CodexConfig>

const codexConfigIO = createScopedConfigIO<CodexConfig>({
	fileName: CONFIG_FILE_NAME,
	title: "Lovely Codex",
	schema: codexConfigSchema
})

export function getGptMode(config: CodexConfig): GptMode {
	return config.gptMode ?? DEFAULT_GPT_MODE
}

export function getApplyPatchAddMode(config: CodexConfig): ApplyPatchAddMode {
	return config.applyPatchAddMode ?? DEFAULT_APPLY_PATCH_ADD_MODE
}

export function getDisableWrite(config: CodexConfig): boolean {
	return config.disableWrite ?? DEFAULT_DISABLE_WRITE
}

export function getDisableEdit(config: CodexConfig): boolean {
	return config.disableEdit ?? DEFAULT_DISABLE_EDIT
}

export const getConfigPath = codexConfigIO.getPath
export const mergeConfig = codexConfigIO.merge
export const loadScopedConfig = codexConfigIO.loadScoped
export const loadConfig = codexConfigIO.load
export const readConfigFile = codexConfigIO.readFile
export const writeConfigFile = codexConfigIO.writeFile
export const deleteConfigFile = codexConfigIO.deleteFile
