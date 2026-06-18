import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent"
import { registerApplyPatchTool } from "./apply-patch.js"
import { type CodexConfig, codexConfig } from "./config.js"
import { registerGptModeHooks } from "./gpt-mode.js"
import { createScopedConfigCommand } from "./scoped-config-command.js"

function isGptModel(model: ExtensionContext["model"]): boolean {
	return model?.id.startsWith("gpt-") || model?.id.includes("/gpt-") || false
}

export default function lovelyCodexExtension(pi: ExtensionAPI) {
	let config: CodexConfig = {}
	let editToolBaseline = new Set<string>()
	let selectedModelIsGpt = false
	const getMode = () => codexConfig.get(config, "gptMode")
	const applyToolConfig = () => {
		const addMode = codexConfig.get(config, "applyPatchAddMode")
		const hasApplyPatch = addMode === "on" || (addMode === "gpt-only" && selectedModelIsGpt)
		const active = new Set(pi.getActiveTools())

		if (hasApplyPatch) active.add("apply_patch")
		else active.delete("apply_patch")

		if (hasApplyPatch && codexConfig.get(config, "disableWrite")) active.delete("write")
		else if (editToolBaseline.has("write")) active.add("write")

		if (hasApplyPatch && codexConfig.get(config, "disableEdit")) active.delete("edit")
		else if (editToolBaseline.has("edit")) active.add("edit")

		pi.setActiveTools(Array.from(active))
	}
	const updateStatus = (ctx: ExtensionContext) => {
		const mode = getMode()
		ctx.ui.setStatus("lovely-codex", mode === "default" ? undefined : ctx.ui.theme.fg("accent", "🏎️"))
	}
	const refreshConfig = (cwd: string) => {
		config = codexConfig.load(cwd)
	}
	const setConfig = (nextConfig: CodexConfig, ctx: ExtensionContext) => {
		config = nextConfig
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
			ctx.ui.notify(`${codexConfig.fileName} config error: ${error instanceof Error ? error.message : String(error)}`, "error")
		}
	})

	pi.on("model_select", async event => {
		selectedModelIsGpt = isGptModel(event.model)
		applyToolConfig()
	})

	createScopedConfigCommand<CodexConfig>({
		command: "codex",
		description: "Configure Lovely Codex settings",
		config: codexConfig,
		onChange(effective, _scoped, ctx) {
			setConfig(effective, ctx)
		}
	})(pi)
	registerGptModeHooks(pi, getMode)
	registerApplyPatchTool(pi)
}
