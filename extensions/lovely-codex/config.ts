import { type ConfigScope, defineScopedConfig, type ScopedConfig, type ScopedConfigField } from "./scoped-config.js"

export const CONFIG_FILE_NAME = "xl0-pi-lovely-codex.json"

export type CodexConfig = {
	gptMode?: "default" | "fast" | "fast-codex"
	applyPatchAddMode?: "on" | "off" | "gpt-only"
	disableWrite?: boolean
	disableEdit?: boolean
}

export const codexConfig = defineScopedConfig<CodexConfig>({
	fileName: CONFIG_FILE_NAME,
	fields: [
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
})

export type { ConfigScope }
export type ScopedCodexConfig = ScopedConfig<CodexConfig>
