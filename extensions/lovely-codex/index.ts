import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent"
import { type ResolvedConfig, ScopedConfigEditor } from "@xl0/pi-lovely-config"
import { registerApplyPatchTool } from "./apply-patch.js"
import { type CodexConfig, codexConfigSpec } from "./config.js"
import { registerGptModeHooks } from "./gpt-mode.js"

function isGptModel(model: ExtensionContext["model"]): boolean {
	return model?.id.startsWith("gpt-") || model?.id.includes("/gpt-") || false
}

export default function lovelyCodexExtension(pi: ExtensionAPI) {
	let configValue: ResolvedConfig<CodexConfig> = codexConfigSpec.defaults
	let editToolBaseline = new Set<string>()
	let selectedModelIsGpt = false
	const getConfig = <Key extends keyof CodexConfig & string>(key: Key) => configValue[key]
	const getMode = () => getConfig("gptMode")
	const applyToolConfig = () => {
		const addMode = getConfig("applyPatchAddMode")
		const hasApplyPatch = addMode === "on" || (addMode === "gpt-only" && selectedModelIsGpt)
		const active = new Set(pi.getActiveTools())

		if (hasApplyPatch) active.add("apply_patch")
		else active.delete("apply_patch")

		if (hasApplyPatch && getConfig("disableWrite")) active.delete("write")
		else if (editToolBaseline.has("write")) active.add("write")

		if (hasApplyPatch && getConfig("disableEdit")) active.delete("edit")
		else if (editToolBaseline.has("edit")) active.add("edit")

		pi.setActiveTools(Array.from(active))
	}
	const updateStatus = (ctx: ExtensionContext) => {
		const mode = getMode()
		ctx.ui.setStatus("lovely-codex", mode === "default" ? undefined : ctx.ui.theme.fg("accent", "🏎️"))
	}
	const refreshConfig = (ctx: ExtensionContext) => {
		const loaded = codexConfigSpec.load(ctx.cwd)
		configValue = loaded.value
		notifyConfigWarnings(ctx, loaded.warnings)
	}
	const setConfig = (value: ResolvedConfig<CodexConfig>, ctx: ExtensionContext) => {
		configValue = value
		applyToolConfig()
		updateStatus(ctx)
	}

	pi.on("session_start", async (_event, ctx) => {
		try {
			editToolBaseline = new Set(pi.getActiveTools())
			selectedModelIsGpt = isGptModel(ctx.model)
			refreshConfig(ctx)
			applyToolConfig()
			updateStatus(ctx)
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

			const loaded = loadCommandConfig(ctx)
			if (!loaded) return
			setConfig(loaded.value, ctx)

			await ctx.ui.custom<void>(
				(tui, theme, _keybindings, done) =>
					new ScopedConfigEditor({
						tui,
						theme,
						config: codexConfigSpec,
						onChange(config) {
							setConfig(config.value, ctx)
						},
						done
					})
			)
		}
	})
	registerGptModeHooks(pi, getMode)
	registerApplyPatchTool(pi)
}

function loadCommandConfig(ctx: ExtensionContext): ReturnType<typeof codexConfigSpec.load> | undefined {
	try {
		const loaded = codexConfigSpec.load(ctx.cwd)
		notifyConfigWarnings(ctx, loaded.warnings)
		return loaded
	} catch (error) {
		ctx.ui.notify(`Config error: ${error instanceof Error ? error.message : String(error)}`, "error")
		return undefined
	}
}

function notifyConfigWarnings(ctx: ExtensionContext, warnings: ReturnType<typeof codexConfigSpec.load>["warnings"]): void {
	if (warnings.length === 0) return
	ctx.ui.notify(warnings.map(warning => `${warning.path}: ${warning.message}`).join("\n"), "warning")
}
