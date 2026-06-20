import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent"
import { registerApplyPatchTool } from "./apply-patch.js"
import { type CodexConfig, codexConfigSpec, type ScopedCodexConfig } from "./config.js"
import { registerGptModeHooks } from "./gpt-mode.js"
import { createScopedConfigEditor } from "./scoped-config.js"

function isGptModel(model: ExtensionContext["model"]): boolean {
	return model?.id.startsWith("gpt-") || model?.id.includes("/gpt-") || false
}

export default function lovelyCodexExtension(pi: ExtensionAPI) {
	let effectiveConfig: CodexConfig = {}
	let editToolBaseline = new Set<string>()
	let selectedModelIsGpt = false
	const getMode = () => codexConfigSpec.get(effectiveConfig, "gptMode")
	const applyToolConfig = () => {
		const addMode = codexConfigSpec.get(effectiveConfig, "applyPatchAddMode")
		const hasApplyPatch = addMode === "on" || (addMode === "gpt-only" && selectedModelIsGpt)
		const active = new Set(pi.getActiveTools())

		if (hasApplyPatch) active.add("apply_patch")
		else active.delete("apply_patch")

		if (hasApplyPatch && codexConfigSpec.get(effectiveConfig, "disableWrite")) active.delete("write")
		else if (editToolBaseline.has("write")) active.add("write")

		if (hasApplyPatch && codexConfigSpec.get(effectiveConfig, "disableEdit")) active.delete("edit")
		else if (editToolBaseline.has("edit")) active.add("edit")

		pi.setActiveTools(Array.from(active))
	}
	const updateStatus = (ctx: ExtensionContext) => {
		const mode = getMode()
		ctx.ui.setStatus("lovely-codex", mode === "default" ? undefined : ctx.ui.theme.fg("accent", "🏎️"))
	}
	const refreshConfig = (cwd: string) => {
		effectiveConfig = codexConfigSpec.load(cwd)
	}
	const setConfig = (nextConfig: CodexConfig, ctx: ExtensionContext) => {
		effectiveConfig = nextConfig
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
			effectiveConfig = {}
			applyToolConfig()
			ctx.ui.setStatus("lovely-codex", undefined)
			ctx.ui.notify(`${codexConfigSpec.fileName} config error: ${error instanceof Error ? error.message : String(error)}`, "error")
		}
	})

	pi.on("model_select", async event => {
		selectedModelIsGpt = isGptModel(event.model)
		applyToolConfig()
	})

	pi.registerCommand("lovely-codex", {
		description: "Configure Lovely Codex settings",
		async handler(_args, ctx) {
			const scoped = loadCommandConfig(ctx)

			if (ctx.mode !== "tui") {
				ctx.ui.notify("The interactive /lovely-codex settings UI is only available in TUI mode.", "warning")
				return
			}

			await ctx.ui.custom<void>((tui, theme, _keybindings, done) =>
				createScopedConfigEditor({
					tui,
					theme,
					ctx,
					config: codexConfigSpec,
					scoped,
					onChange(effective) {
						setConfig(effective, ctx)
					},
					done
				})
			)
		}
	})
	registerGptModeHooks(pi, getMode)
	registerApplyPatchTool(pi)
}

function loadCommandConfig(ctx: ExtensionContext): ScopedCodexConfig {
	const config: ScopedCodexConfig = { user: {}, workspace: {} }
	for (const scope of ["user", "workspace"] as const) {
		const path = codexConfigSpec.getPath(scope, ctx.cwd)
		try {
			config[scope] = codexConfigSpec.readFile(path)
		} catch (error) {
			const label = `${scope[0]?.toUpperCase() ?? ""}${scope.slice(1)}`
			const message = error instanceof Error ? error.message : String(error)
			ctx.ui.notify(`${codexConfigSpec.fileName} ignored unreadable ${label} config at ${path}: ${message}`, "warning")
		}
	}
	return config
}
