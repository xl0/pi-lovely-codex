import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent"
import { registerApplyPatchTool } from "./apply-patch.js"
import { registerCodexCommand } from "./command.js"
import {
	type CodexConfig,
	getApplyPatchAddMode,
	getDisableEdit,
	getDisableWrite,
	getGptMode,
	loadScopedConfig,
	mergeConfig,
	type ScopedCodexConfig
} from "./config.js"
import { registerGptModeHooks } from "./gpt-mode.js"

function isGptModel(model: ExtensionContext["model"]): boolean {
	return model?.id.startsWith("gpt-") || model?.id.includes("/gpt-") || false
}

export default function lovelyCodexExtension(pi: ExtensionAPI) {
	let config: CodexConfig = {}
	let editToolBaseline = new Set<string>()
	let selectedModelIsGpt = false
	const getMode = () => getGptMode(config)
	const applyToolConfig = () => {
		const addMode = getApplyPatchAddMode(config)
		const hasApplyPatch = addMode === "on" || (addMode === "gpt-only" && selectedModelIsGpt)
		const active = new Set(pi.getActiveTools())

		if (hasApplyPatch) active.add("apply_patch")
		else active.delete("apply_patch")

		if (hasApplyPatch && getDisableWrite(config)) active.delete("write")
		else if (editToolBaseline.has("write")) active.add("write")

		if (hasApplyPatch && getDisableEdit(config)) active.delete("edit")
		else if (editToolBaseline.has("edit")) active.add("edit")

		pi.setActiveTools(Array.from(active))
	}
	const updateStatus = (ctx: ExtensionContext) => {
		const mode = getMode()
		ctx.ui.setStatus("lovely-codex", mode === "default" ? undefined : ctx.ui.theme.fg("accent", "🏎️"))
	}
	const refreshConfig = (cwd: string) => {
		config = mergeConfig(loadScopedConfig(cwd))
	}
	const setConfigByScope = (nextConfigByScope: ScopedCodexConfig, ctx: ExtensionContext) => {
		config = mergeConfig(nextConfigByScope)
		applyToolConfig()
		updateStatus(ctx)
	}

	pi.on("session_start", async (_event, ctx) => {
		try {
			editToolBaseline = new Set(pi.getActiveTools())
			selectedModelIsGpt = isGptModel(ctx.model)
			refreshConfig(ctx.cwd)
			applyToolConfig()
			updateStatus(ctx)
		} catch (error) {
			config = {}
			applyToolConfig()
			ctx.ui.setStatus("lovely-codex", undefined)
			ctx.ui.notify(`Lovely Codex config error: ${error instanceof Error ? error.message : String(error)}`, "error")
		}
	})

	pi.on("model_select", async event => {
		selectedModelIsGpt = isGptModel(event.model)
		applyToolConfig()
	})

	registerCodexCommand(pi, setConfigByScope)
	registerGptModeHooks(pi, getMode)
	registerApplyPatchTool(pi)
}
