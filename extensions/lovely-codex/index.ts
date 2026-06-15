import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent"
import { registerApplyPatchTool } from "./apply-patch.js"
import { registerCodexCommand } from "./command.js"
import { getApplyPatchMode, getGptMode, loadScopedConfig, mergeConfig, type ScopedCodexConfig } from "./config.js"
import { registerGptModeHooks } from "./gpt-mode.js"

function applyToolConfig(pi: ExtensionAPI, configByScope: ScopedCodexConfig, editToolBaseline: Set<string>) {
	const mode = getApplyPatchMode(mergeConfig(configByScope))
	const active = new Set(pi.getActiveTools())
	if (mode === "disabled") {
		active.delete("apply_patch")
		if (editToolBaseline.has("write")) active.add("write")
		if (editToolBaseline.has("edit")) active.add("edit")
	} else if (mode === "enabled") {
		active.add("apply_patch")
		if (editToolBaseline.has("write")) active.add("write")
		if (editToolBaseline.has("edit")) active.add("edit")
	} else {
		active.add("apply_patch")
		active.delete("write")
		active.delete("edit")
	}
	pi.setActiveTools(Array.from(active))
}

export default function lovelyCodexExtension(pi: ExtensionAPI) {
	let configByScope: ScopedCodexConfig = { global: {}, project: {} }
	let editToolBaseline = new Set<string>()
	const getMode = () => getGptMode(mergeConfig(configByScope))
	const updateStatus = (ctx: ExtensionContext) => {
		const mode = getMode()
		ctx.ui.setStatus("lovely-codex", mode === "default" ? undefined : ctx.ui.theme.fg("accent", "🏎️"))
	}
	const refreshConfig = (cwd: string) => {
		configByScope = loadScopedConfig(cwd)
	}
	const setConfigByScope = (config: ScopedCodexConfig, ctx: ExtensionContext) => {
		configByScope = config
		applyToolConfig(pi, configByScope, editToolBaseline)
		updateStatus(ctx)
	}

	pi.on("session_start", async (_event, ctx) => {
		try {
			editToolBaseline = new Set(pi.getActiveTools())
			refreshConfig(ctx.cwd)
			applyToolConfig(pi, configByScope, editToolBaseline)
			updateStatus(ctx)
		} catch (error) {
			configByScope = { global: {}, project: {} }
			applyToolConfig(pi, configByScope, editToolBaseline)
			ctx.ui.setStatus("lovely-codex", undefined)
			ctx.ui.notify(`Lovely Codex config error: ${error instanceof Error ? error.message : String(error)}`, "error")
		}
	})

	registerCodexCommand(pi, setConfigByScope)
	registerGptModeHooks(pi, getMode)
	registerApplyPatchTool(pi)
}
