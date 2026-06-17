import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent"
import { Key, matchesKey, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui"
import {
	type ApplyPatchAddMode,
	CONFIG_FILE_NAME,
	type CodexConfig,
	type ConfigScope,
	DEFAULT_APPLY_PATCH_ADD_MODE,
	DEFAULT_DISABLE_EDIT,
	DEFAULT_DISABLE_WRITE,
	DEFAULT_GPT_MODE,
	deleteConfigFile,
	type GptMode,
	getApplyPatchAddMode,
	getConfigPath,
	readConfigFile,
	type ScopedCodexConfig,
	writeConfigFile
} from "./config.js"

type GptModeSetting = GptMode | "unset"
type ApplyPatchAddModeSetting = ApplyPatchAddMode | "unset"
type DisableToolSetting = "unset" | "on" | "off"
type SettingRow = "gpt" | "applyPatchAdd" | "disableWrite" | "disableEdit" | "reset"

const scopeTabs: Array<{ scope: ConfigScope; label: string; path: string }> = [
	{ scope: "global", label: "User", path: `~/.pi/agent/${CONFIG_FILE_NAME}` },
	{ scope: "project", label: "Workspace", path: `.pi/${CONFIG_FILE_NAME}` }
]

const gptModeOptions: GptModeSetting[] = ["unset", "default", "fast", "fast-codex"]
const applyPatchAddModeOptions: ApplyPatchAddModeSetting[] = ["unset", "on", "off", "gpt-only"]
const disableToolOptions: DisableToolSetting[] = ["unset", "on", "off"]

function getScopedGptMode(config: CodexConfig): GptModeSetting {
	return config.gptMode ?? "unset"
}

function getScopedApplyPatchAddMode(config: CodexConfig): ApplyPatchAddModeSetting {
	return config.applyPatchAddMode ?? "unset"
}

function getScopedDisableWrite(config: CodexConfig): DisableToolSetting {
	return config.disableWrite === undefined ? "unset" : config.disableWrite ? "on" : "off"
}

function getScopedDisableEdit(config: CodexConfig): DisableToolSetting {
	return config.disableEdit === undefined ? "unset" : config.disableEdit ? "on" : "off"
}

function withGptMode(config: CodexConfig, mode: GptModeSetting): CodexConfig {
	const next = { ...config }
	if (mode === "unset") delete next.gptMode
	else next.gptMode = mode
	return next
}

function withApplyPatchAddMode(config: CodexConfig, mode: ApplyPatchAddModeSetting): CodexConfig {
	const next = { ...config }
	if (mode === "unset") delete next.applyPatchAddMode
	else next.applyPatchAddMode = mode
	return next
}

function withDisableWrite(config: CodexConfig, mode: DisableToolSetting): CodexConfig {
	const next = { ...config }
	if (mode === "unset") delete next.disableWrite
	else next.disableWrite = mode === "on"
	return next
}

function withDisableEdit(config: CodexConfig, mode: DisableToolSetting): CodexConfig {
	const next = { ...config }
	if (mode === "unset") delete next.disableEdit
	else next.disableEdit = mode === "on"
	return next
}

function nextOption<T extends string>(options: T[], value: T): T {
	const index = options.indexOf(value)
	return options[(index + 1) % options.length] ?? options[0] ?? value
}

function getModeScopeNote<T extends string>(scope: ConfigScope, userMode: T | undefined, workspaceMode: T | undefined, defaultMode: T) {
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

function getScopeNote(scope: ConfigScope, configs: ScopedCodexConfig): string | undefined {
	return getModeScopeNote(scope, configs.global.gptMode, configs.project.gptMode, DEFAULT_GPT_MODE)
}

function getApplyPatchAddScopeNote(scope: ConfigScope, configs: ScopedCodexConfig): string | undefined {
	return getModeScopeNote(scope, configs.global.applyPatchAddMode, configs.project.applyPatchAddMode, DEFAULT_APPLY_PATCH_ADD_MODE)
}

function getBooleanMode(value: boolean | undefined): "on" | "off" | undefined {
	return value === undefined ? undefined : value ? "on" : "off"
}

function getDisableWriteScopeNote(scope: ConfigScope, configs: ScopedCodexConfig): string | undefined {
	return getModeScopeNote(
		scope,
		getBooleanMode(configs.global.disableWrite),
		getBooleanMode(configs.project.disableWrite),
		DEFAULT_DISABLE_WRITE ? "on" : "off"
	)
}

function getDisableEditScopeNote(scope: ConfigScope, configs: ScopedCodexConfig): string | undefined {
	return getModeScopeNote(
		scope,
		getBooleanMode(configs.global.disableEdit),
		getBooleanMode(configs.project.disableEdit),
		DEFAULT_DISABLE_EDIT ? "on" : "off"
	)
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

				function currentScope(): ConfigScope {
					return scopeTabs[currentTab]?.scope ?? "global"
				}

				function effectiveConfig(scope: ConfigScope): CodexConfig {
					return scope === "global" ? configs.global : { ...configs.global, ...configs.project }
				}

				function settingRows(scope: ConfigScope = currentScope()): SettingRow[] {
					const rows: SettingRow[] = ["gpt", "applyPatchAdd"]
					if (getApplyPatchAddMode(effectiveConfig(scope)) !== "off") rows.push("disableWrite", "disableEdit")
					rows.push("reset")
					return rows
				}

				function refresh() {
					currentSetting = Math.min(currentSetting, settingRows().length - 1)
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
						currentSetting = (currentSetting + 1) % settingRows().length
						refresh()
						return
					}
					if (matchesKey(data, Key.up)) {
						const rows = settingRows()
						currentSetting = (currentSetting + rows.length - 1) % rows.length
						refresh()
						return
					}
					if (matchesKey(data, Key.enter) || data === " ") {
						const scope = currentScope()
						const activeConfig = configs[scope]
						const row = settingRows(scope)[currentSetting]
						switch (row) {
							case "gpt":
								save(scope, withGptMode(activeConfig, nextOption(gptModeOptions, getScopedGptMode(activeConfig))))
								return
							case "applyPatchAdd":
								save(
									scope,
									withApplyPatchAddMode(activeConfig, nextOption(applyPatchAddModeOptions, getScopedApplyPatchAddMode(activeConfig)))
								)
								return
							case "disableWrite":
								save(scope, withDisableWrite(activeConfig, nextOption(disableToolOptions, getScopedDisableWrite(activeConfig))))
								return
							case "disableEdit":
								save(scope, withDisableEdit(activeConfig, nextOption(disableToolOptions, getScopedDisableEdit(activeConfig))))
								return
							case "reset":
								reset(scope)
								return
						}
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
					const applyPatchAddMode = getScopedApplyPatchAddMode(activeConfig)
					const applyPatchAddNote = getApplyPatchAddScopeNote(scope, configs)
					const disableWriteMode = getScopedDisableWrite(activeConfig)
					const disableWriteNote = getDisableWriteScopeNote(scope, configs)
					const disableEditMode = getScopedDisableEdit(activeConfig)
					const disableEditNote = getDisableEditScopeNote(scope, configs)
					const rows = settingRows(scope)
					const selected = (row: SettingRow) => rows[currentSetting] === row
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
						const isUnset =
							getScopedGptMode(scopeConfig) === "unset" &&
							getScopedApplyPatchAddMode(scopeConfig) === "unset" &&
							getScopedDisableWrite(scopeConfig) === "unset" &&
							getScopedDisableEdit(scopeConfig) === "unset"
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

					const gptPrefix = theme.fg(selected("gpt") ? "accent" : "muted", selected("gpt") ? "> " : "  ")
					const gptValue = theme.fg(rawMode === "unset" ? "muted" : "accent", rawMode)
					const gptNote = note ? ` ${theme.fg("muted", `(${note})`)}` : ""
					addWrappedWithPrefix(gptPrefix, `${theme.fg("text", "GPT mode")}  ${gptValue}${gptNote}`)

					const patchPrefix = theme.fg(selected("applyPatchAdd") ? "accent" : "muted", selected("applyPatchAdd") ? "> " : "  ")
					const patchValue = theme.fg(applyPatchAddMode === "unset" ? "muted" : "accent", applyPatchAddMode)
					const patchNote = applyPatchAddNote ? ` ${theme.fg("muted", `(${applyPatchAddNote})`)}` : ""
					addWrappedWithPrefix(patchPrefix, `${theme.fg("text", "add apply_patch")}  ${patchValue}${patchNote}`)

					if (rows.includes("disableWrite")) {
						const writePrefix = theme.fg(selected("disableWrite") ? "accent" : "muted", selected("disableWrite") ? ">   " : "    ")
						const writeValue = theme.fg(disableWriteMode === "unset" ? "muted" : "accent", disableWriteMode)
						const writeNote = disableWriteNote ? ` ${theme.fg("muted", `(${disableWriteNote})`)}` : ""
						addWrappedWithPrefix(writePrefix, `${theme.fg("text", "disable write")}  ${writeValue}${writeNote}`)

						const editPrefix = theme.fg(selected("disableEdit") ? "accent" : "muted", selected("disableEdit") ? ">   " : "    ")
						const editValue = theme.fg(disableEditMode === "unset" ? "muted" : "accent", disableEditMode)
						const editNote = disableEditNote ? ` ${theme.fg("muted", `(${disableEditNote})`)}` : ""
						addWrappedWithPrefix(editPrefix, `${theme.fg("text", "disable edit")}  ${editValue}${editNote}`)
					}
					lines.push(theme.fg("dim", `  ${"─".repeat(Math.max(1, renderWidth - 2))}`))

					const resetPrefix = theme.fg(selected("reset") ? "accent" : "muted", selected("reset") ? "> " : "  ")
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
