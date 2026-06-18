import type { Static } from "typebox"
import { type ConfigScope, defineScopedConfig, type ScopedConfig, type ScopedConfigField } from "./scoped-config-command.js"

export const CONFIG_FILE_NAME = "xl0-pi-lovely-codex.json"

export const codexConfig = defineScopedConfig({
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

export type CodexConfig = Static<typeof codexConfig.schema>
export type { ConfigScope }
export type ScopedCodexConfig = ScopedConfig<CodexConfig>
