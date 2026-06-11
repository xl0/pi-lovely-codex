import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent"
import { registerCodexCommand } from "./command.js"
import { getGptMode, loadScopedConfig, mergeConfig, type ScopedCodexConfig } from "./config.js"
import { registerGptModeHooks } from "./gpt-mode.js"

export default function lovelyCodexExtension(pi: ExtensionAPI) {
	let configByScope: ScopedCodexConfig = { global: {}, project: {} }
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
		updateStatus(ctx)
		return getMode()
	}

	pi.on("session_start", async (_event, ctx) => {
		try {
			refreshConfig(ctx.cwd)
			updateStatus(ctx)
		} catch (error) {
			configByScope = { global: {}, project: {} }
			ctx.ui.setStatus("lovely-codex", undefined)
			ctx.ui.notify(`Lovely Codex config error: ${error instanceof Error ? error.message : String(error)}`, "error")
		}
	})

	registerCodexCommand(pi, setConfigByScope)
	registerGptModeHooks(pi, getMode)
}
