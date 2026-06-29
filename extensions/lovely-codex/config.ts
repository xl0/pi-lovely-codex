import { type ConfigFromSchema, defineScopedConfig, field } from "@xl0/pi-lovely-config"

export const CONFIG_FILE_NAME = "xl0-pi-lovely-codex.json"

const codexConfigSchema = {
	gptMode: field.enum(["default", "fast", "fast-codex"], "default", {
		label: "GPT mode"
	}),
	applyPatchAddMode: field.enum(["on", "off", "gpt-only"], "gpt-only", {
		label: "add apply_patch"
	}),
	disableWrite: field.boolean(false, {
		label: "disable write",
		depth: 1,
		visibleWhen: ({ get }) => get("applyPatchAddMode") !== "off"
	}),
	disableEdit: field.boolean(false, {
		label: "disable edit",
		depth: 1,
		visibleWhen: ({ get }) => get("applyPatchAddMode") !== "off"
	})
} as const

export type CodexConfig = ConfigFromSchema<typeof codexConfigSchema>

export const codexConfigSpec = defineScopedConfig({
	fileName: CONFIG_FILE_NAME,
	schema: codexConfigSchema
})
