import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent"
import { ScopedConfigEditor } from "@xl0/pi-lovely-config"
import { registerApplyPatchTool } from "./apply-patch.js"
import { type CodexConfig, codexConfigSpec } from "./config.js"
import { registerGptModeHooks } from "./gpt-mode.js"

function isGptModel(model: ExtensionContext["model"]): boolean {
	return model?.id.startsWith("gpt-") || model?.id.includes("/gpt-") || false
}

export default function lovelyCodexExtension(pi: ExtensionAPI) {
	let configValue: CodexConfig = codexConfigSpec.defaults
	let editToolBaseline = new Set<string>()
	let selectedModelIsGpt = false
	const getMode = () => configValue.gptMode
	const applyToolConfig = () => {
		const addMode = configValue.applyPatchAddMode
		const hasApplyPatch = addMode === "on" || (addMode === "gpt-only" && selectedModelIsGpt)
		const active = new Set(pi.getActiveTools())

		if (hasApplyPatch) active.add("apply_patch")
		else active.delete("apply_patch")

		if (hasApplyPatch && configValue.disableWrite) active.delete("write")
		else if (editToolBaseline.has("write")) active.add("write")

		if (hasApplyPatch && configValue.disableEdit) active.delete("edit")
		else if (editToolBaseline.has("edit")) active.add("edit")

		pi.setActiveTools(Array.from(active))
	}
	const updateStatus = (ctx: ExtensionContext) => {
		const mode = getMode()
		ctx.ui.setStatus("lovely-codex", mode === "default" ? undefined : ctx.ui.theme.fg("accent", "🏎️"))
	}
	const applyConfig = (ctx: ExtensionContext, value: CodexConfig) => {
		configValue = value
		applyToolConfig()
		updateStatus(ctx)
	}
	const loadConfig = (ctx: ExtensionContext) => {
		const loaded = codexConfigSpec.load(ctx.cwd)
		notifyConfigWarnings(ctx, loaded.warnings)
		applyConfig(ctx, loaded.value)
	}

	pi.on("session_start", async (_event, ctx) => {
		try {
			editToolBaseline = new Set(pi.getActiveTools())
			selectedModelIsGpt = isGptModel(ctx.model)
			loadConfig(ctx)
		} catch (error) {
			configValue = codexConfigSpec.defaults
			applyToolConfig()
			ctx.ui.setStatus("lovely-codex", undefined)
			ctx.ui.notify(`Config error: ${error instanceof Error ? error.message : String(error)}`, "error")
		}
	})

	pi.on("model_select", async event => {
		selectedModelIsGpt = isGptModel(event.model)
		applyToolConfig()
	})

	pi.registerCommand("lovely-codex", {
		description: "Configure Lovely Codex settings",
		async handler(_args, ctx) {
			if (ctx.mode !== "tui") return

			try {
				loadConfig(ctx)
			} catch (error) {
				ctx.ui.notify(`Config error: ${error instanceof Error ? error.message : String(error)}`, "error")
				return
			}

			await ctx.ui.custom<void>(
				(tui, theme, _keybindings, done) =>
					new ScopedConfigEditor({
						tui,
						theme,
						config: codexConfigSpec,
						onChange(config) {
							applyConfig(ctx, config.value)
						},
						done
					})
			)
		}
	})
	registerGptModeHooks(pi, getMode)
	registerApplyPatchTool(pi)
}

function notifyConfigWarnings(ctx: ExtensionContext, warnings: ReturnType<typeof codexConfigSpec.load>["warnings"]): void {
	if (warnings.length === 0) return
	ctx.ui.notify(warnings.map(warning => `${warning.path}: ${warning.message}`).join("\n"), "warning")
}
