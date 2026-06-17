import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent"
import { Key, matchesKey, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui"
import {
	type ApplyPatchMode,
	CONFIG_FILE_NAME,
	type CodexConfig,
	type ConfigScope,
	DEFAULT_GPT_MODE,
	deleteConfigFile,
	type GptMode,
	getApplyPatchMode,
	getConfigPath,
	readConfigFile,
	type ScopedCodexConfig,
	writeConfigFile
} from "./config.js"

type GptModeSetting = GptMode | "unset"
type ApplyPatchModeSetting = ApplyPatchMode | "unset"

const scopeTabs: Array<{ scope: ConfigScope; label: string; path: string }> = [
	{ scope: "global", label: "User", path: `~/.pi/agent/${CONFIG_FILE_NAME}` },
	{ scope: "project", label: "Workspace", path: `.pi/${CONFIG_FILE_NAME}` }
]

const gptModeOptions: GptModeSetting[] = ["unset", "default", "fast", "fast-codex"]
const applyPatchModeOptions: ApplyPatchModeSetting[] = ["unset", "disabled", "enabled", "replace-edit"]

function getScopedGptMode(config: CodexConfig): GptModeSetting {
	return config.gptMode ?? "unset"
}

function getScopedApplyPatchMode(config: CodexConfig): ApplyPatchModeSetting {
	return config.applyPatchMode ?? "unset"
}

function withGptMode(config: CodexConfig, mode: GptModeSetting): CodexConfig {
	const next = { ...config }
	if (mode === "unset") delete next.gptMode
	else next.gptMode = mode
	return next
}

function withApplyPatchMode(config: CodexConfig, mode: ApplyPatchModeSetting): CodexConfig {
	const next = { ...config }
	if (mode === "unset") delete next.applyPatchMode
	else next.applyPatchMode = mode
	return next
}

function nextOption<T extends string>(options: T[], value: T): T {
	const index = options.indexOf(value)
	return options[(index + 1) % options.length] ?? options[0] ?? value
}

function getScopeNote(scope: ConfigScope, configs: ScopedCodexConfig): string | undefined {
	const userMode = configs.global.gptMode
	const workspaceMode = configs.project.gptMode
	if (!userMode && !workspaceMode) return `uses default: ${DEFAULT_GPT_MODE}`

	if (scope === "global") {
		if (userMode && workspaceMode) return `Workspace overrides with: ${workspaceMode}`
		if (!userMode && workspaceMode) return `Workspace sets: ${workspaceMode}`
		return undefined
	}

	if (!workspaceMode && userMode) return `inherits User: ${userMode}`
	if (workspaceMode && userMode) return workspaceMode === userMode ? `same as User: ${userMode}` : `overrides User: ${userMode}`
	if (workspaceMode && !userMode) return `overrides default: ${DEFAULT_GPT_MODE}`
	return undefined
}

function getApplyPatchScopeNote(scope: ConfigScope, configs: ScopedCodexConfig): string | undefined {
	const userMode = configs.global.applyPatchMode
	const workspaceMode = configs.project.applyPatchMode
	const defaultMode = getApplyPatchMode({})
	if (!userMode && !workspaceMode) return `uses default: ${defaultMode}`

	if (scope === "global") {
		if (userMode && workspaceMode) return `Workspace overrides with: ${workspaceMode}`
		if (!userMode && workspaceMode) return `Workspace sets: ${workspaceMode}`
		return undefined
	}

	if (!workspaceMode && userMode) return `inherits User: ${userMode}`
	if (workspaceMode && userMode) return workspaceMode === userMode ? `same as User: ${userMode}` : `overrides User: ${userMode}`
	if (workspaceMode && !userMode) return `overrides default: ${defaultMode}`
	return undefined
}

function loadCommandConfig(ctx: ExtensionContext): ScopedCodexConfig {
	const config: ScopedCodexConfig = { global: {}, project: {} }
	for (const scope of ["global", "project"] as const) {
		const path = getConfigPath(scope, ctx.cwd)
		try {
			config[scope] = readConfigFile(path)
		} catch (error) {
			ctx.ui.notify(
				`Lovely Codex ignored bad ${scope === "global" ? "User" : "Workspace"} config at ${path}: ${error instanceof Error ? error.message : String(error)}`,
				"warning"
			)
		}
	}
	return config
}

export function registerCodexCommand(pi: ExtensionAPI, setConfigByScope: (config: ScopedCodexConfig, ctx: ExtensionContext) => void) {
	pi.registerCommand("codex", {
		description: "Configure Lovely Codex settings",
		async handler(_args, ctx) {
			let configs = loadCommandConfig(ctx)

			if (ctx.mode !== "tui") {
				ctx.ui.notify("The interactive /codex settings UI is only available in TUI mode.", "warning")
				return
			}

			await ctx.ui.custom<void>((tui, theme, _keybindings, done) => {
				let currentTab = 0
				let currentSetting = 0
				const settingCount = 3

				function currentScope(): ConfigScope {
					return scopeTabs[currentTab]?.scope ?? "global"
				}

				function refresh() {
					tui.requestRender()
				}

				function switchTab(nextTab: number) {
					currentTab = (nextTab + scopeTabs.length) % scopeTabs.length
					refresh()
				}

				function save(scope: ConfigScope, config: CodexConfig) {
					configs = { ...configs, [scope]: config }
					writeConfigFile(getConfigPath(scope, ctx.cwd), config)
					setConfigByScope(configs, ctx)
					refresh()
				}

				function reset(scope: ConfigScope) {
					configs = { ...configs, [scope]: {} }
					deleteConfigFile(getConfigPath(scope, ctx.cwd))
					setConfigByScope(configs, ctx)
					refresh()
				}

				function handleInput(data: string) {
					if (matchesKey(data, Key.tab) || matchesKey(data, Key.right)) {
						switchTab(currentTab + 1)
						return
					}
					if (matchesKey(data, Key.shift("tab")) || matchesKey(data, Key.left)) {
						switchTab(currentTab - 1)
						return
					}
					if (matchesKey(data, Key.down)) {
						currentSetting = (currentSetting + 1) % settingCount
						refresh()
						return
					}
					if (matchesKey(data, Key.up)) {
						currentSetting = (currentSetting + settingCount - 1) % settingCount
						refresh()
						return
					}
					if (matchesKey(data, Key.enter) || data === " ") {
						const scope = currentScope()
						const activeConfig = configs[scope]
						if (currentSetting === 0) {
							save(scope, withGptMode(activeConfig, nextOption(gptModeOptions, getScopedGptMode(activeConfig))))
							return
						}
						if (currentSetting === 1) {
							save(scope, withApplyPatchMode(activeConfig, nextOption(applyPatchModeOptions, getScopedApplyPatchMode(activeConfig))))
							return
						}
						reset(scope)
						return
					}
					if (matchesKey(data, Key.escape)) done(undefined)
				}

				function render(width: number): string[] {
					const lines: string[] = []
					const renderWidth = Math.max(1, width)
					const scope = currentScope()
					const activeConfig = configs[scope]
					const rawMode = getScopedGptMode(activeConfig)
					const note = getScopeNote(scope, configs)
					const applyPatchMode = getScopedApplyPatchMode(activeConfig)
					const applyPatchNote = getApplyPatchScopeNote(scope, configs)
					function addWrapped(text: string) {
						lines.push(...wrapTextWithAnsi(text, renderWidth))
					}

					function addWrappedWithPrefix(prefix: string, text: string) {
						const prefixWidth = visibleWidth(prefix)
						if (prefixWidth >= renderWidth) {
							addWrapped(prefix + text)
							return
						}
						const wrapped = wrapTextWithAnsi(text, renderWidth - prefixWidth)
						const continuationPrefix = " ".repeat(prefixWidth)
						for (let i = 0; i < wrapped.length; i++) {
							lines.push(`${i === 0 ? prefix : continuationPrefix}${wrapped[i]}`)
						}
					}

					lines.push(theme.fg("accent", "─".repeat(renderWidth)))

					const tabs: string[] = ["← "]
					for (const [index, tab] of scopeTabs.entries()) {
						const scopeConfig = configs[tab.scope]
						const isUnset = getScopedGptMode(scopeConfig) === "unset" && getScopedApplyPatchMode(scopeConfig) === "unset"
						const marker = isUnset ? "□" : "■"
						const text = ` ${marker} ${tab.label} `
						const styled =
							index === currentTab ? theme.bg("selectedBg", theme.fg("text", text)) : theme.fg(isUnset ? "muted" : "success", text)
						tabs.push(`${styled} `)
					}
					tabs.push("→")
					addWrappedWithPrefix(" ", tabs.join(""))
					lines.push("")

					const tab = scopeTabs[currentTab]
					if (tab) addWrappedWithPrefix(" ", `${theme.fg("accent", theme.bold(`${tab.label} config`))} ${theme.fg("dim", tab.path)}`)
					lines.push("")

					const gptPrefix = theme.fg(currentSetting === 0 ? "accent" : "muted", currentSetting === 0 ? "> " : "  ")
					const gptValue = theme.fg(rawMode === "unset" ? "muted" : "accent", rawMode)
					const gptNote = note ? ` ${theme.fg("muted", `(${note})`)}` : ""
					addWrappedWithPrefix(gptPrefix, `${theme.fg("text", "GPT mode")}  ${gptValue}${gptNote}`)

					const patchPrefix = theme.fg(currentSetting === 1 ? "accent" : "muted", currentSetting === 1 ? "> " : "  ")
					const patchValue = theme.fg(applyPatchMode === "unset" ? "muted" : "accent", applyPatchMode)
					const patchNote = applyPatchNote ? ` ${theme.fg("muted", `(${applyPatchNote})`)}` : ""
					addWrappedWithPrefix(patchPrefix, `${theme.fg("text", "apply_patch")}  ${patchValue}${patchNote}`)
					lines.push(theme.fg("dim", `  ${"─".repeat(Math.max(1, renderWidth - 2))}`))

					const resetPrefix = theme.fg(currentSetting === 2 ? "accent" : "muted", currentSetting === 2 ? "> " : "  ")
					addWrappedWithPrefix(
						resetPrefix,
						`${theme.fg("text", "Reset to default")}  ${theme.fg("muted", "delete this scope config file")}`
					)

					lines.push("")
					addWrappedWithPrefix(" ", theme.fg("dim", "Tab/←→ switch scope • ↑↓ select • Enter/Space change/reset • Esc close"))
					lines.push(theme.fg("accent", "─".repeat(renderWidth)))

					return lines
				}

				return {
					render,
					invalidate: () => {},
					handleInput
				}
			})
		}
	})
}
