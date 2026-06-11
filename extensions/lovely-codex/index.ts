import type { ExtensionAPI } from "@earendil-works/pi-coding-agent"
import { registerCodexCommand } from "./command.js"
import { type CodexConfig, getGptMode, loadConfig } from "./config.js"
import { registerGptModeHooks } from "./gpt-mode.js"

export default function lovelyCodexExtension(pi: ExtensionAPI) {
	let config: CodexConfig = {}
	const refreshConfig = (cwd: string) => {
		config = loadConfig(cwd)
	}

	pi.on("session_start", async (_event, ctx) => {
		try {
			refreshConfig(ctx.cwd)
		} catch (error) {
			ctx.ui.notify(`Lovely Codex config error: ${error instanceof Error ? error.message : String(error)}`, "error")
		}
	})

	registerCodexCommand(pi, refreshConfig)
	registerGptModeHooks(pi, () => getGptMode(config))
}
