import { type ConfigFromSchema, defineScopedConfig, field } from "@xl0/pi-lovely-config"

const CONFIG_FILE_NAME = "xl0-pi-lovely-codex.json"

const codexConfigSchema = {
	gptMode: field.enum(["default", "fast", "fast-codex"], "default", {
		label: "GPT mode",
		description: "Choose where requests use OpenAI's priority service tier.",
		valueDescriptions: {
			default: "Do not request priority serving",
			fast: "Request priority serving from openai and openai-codex",
			"fast-codex": "Request priority serving from openai-codex only"
		}
	}),
	applyPatchAddMode: field.enum(["on", "off", "gpt-only"], "gpt-only", {
		label: "add apply_patch",
		description: "Control when the Codex-compatible apply_patch tool is active.",
		valueDescriptions: {
			on: "Enable for every model",
			off: "Disable for every model",
			"gpt-only": "Enable only for GPT model ids"
		}
	}),
	applyPatchFreeform: field.boolean(false, {
		label: "enable freeform",
		description: "Use the grammar-constrained custom tool instead of JSON when the model supports it.",
		valueDescriptions: {
			on: "Use freeform when supported",
			off: "Use the JSON input schema"
		},
		depth: 1,
		visibleWhen: ({ get }) => get("applyPatchAddMode") !== "off"
	}),
	disableWrite: field.boolean(false, {
		label: "disable write",
		description: "Remove the built-in write tool while apply_patch is active.",
		valueDescriptions: {
			on: "Remove write",
			off: "Keep write"
		},
		depth: 1,
		visibleWhen: ({ get }) => get("applyPatchAddMode") !== "off"
	}),
	disableEdit: field.boolean(false, {
		label: "disable edit",
		description: "Remove the built-in edit tool while apply_patch is active.",
		valueDescriptions: {
			on: "Remove edit",
			off: "Keep edit"
		},
		depth: 1,
		visibleWhen: ({ get }) => get("applyPatchAddMode") !== "off"
	}),
	disableRead: field.enum(["on", "off", "gpt-only"], "gpt-only", {
		label: "disable read",
		description: "Remove the built-in read tool, forcing bounded shell reads (sed/head) to save context.",
		valueDescriptions: {
			on: "Remove read for every model",
			off: "Keep read",
			"gpt-only": "Remove read only for GPT model ids"
		}
	}),
	viewImage: field.boolean(true, {
		label: "add view_image",
		description: "Add the view_image tool while read is disabled, so images stay readable.",
		valueDescriptions: {
			on: "Add view_image",
			off: "No image tool"
		},
		depth: 1,
		visibleWhen: ({ get }) => get("disableRead") !== "off"
	})
} as const

export type CodexConfig = ConfigFromSchema<typeof codexConfigSchema>

export const codexConfigSpec = defineScopedConfig({
	fileName: CONFIG_FILE_NAME,
	schema: codexConfigSchema
})
