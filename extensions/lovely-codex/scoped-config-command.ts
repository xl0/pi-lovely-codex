import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { type ExtensionAPI, type ExtensionContext, getAgentDir } from "@earendil-works/pi-coding-agent"
import { Key, matchesKey, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui"
import { type TSchema, Type } from "typebox"
import Schema from "typebox/schema"

export type ConfigScope = "global" | "project"
export type ScopedConfig<Config extends object> = Record<ConfigScope, Config>

type FieldKind = "enum" | "boolean"

type VisibilityContext = {
	get(key: string): unknown
	getScoped(key: string, scope?: ConfigScope): unknown
	scope: ConfigScope
}

type BaseField = {
	key: string
	label: string
	kind: FieldKind
	visibleWhen?: (ctx: VisibilityContext) => boolean
	children?: readonly ScopedConfigField[]
}

export type EnumConfigField = BaseField & {
	kind: "enum"
	values: readonly string[]
	default: string
}

export type BooleanConfigField = BaseField & {
	kind: "boolean"
	default: boolean
}

export type ScopedConfigField = EnumConfigField | BooleanConfigField

type FlatField = ScopedConfigField & { depth: number }
type Row = { kind: "field"; field: FlatField } | { kind: "reset" }

type ScopedConfigCommandOptions<Config extends object> = {
	command: string
	description: string
	title: string
	fileName: string
	fields: readonly ScopedConfigField[]
	onChange: (effective: Config, scoped: ScopedConfig<Config>, ctx: ExtensionContext) => void
}

type ScopedConfigIO<Config extends object> = {
	getPath(scope: ConfigScope, cwd: string): string
	readFile(path: string): Config
	writeFile(path: string, config: Config): void
	deleteFile(path: string): void
	merge(scoped: ScopedConfig<Config>): Config
	loadScoped(cwd: string): ScopedConfig<Config>
	load(cwd: string): Config
}

const scopeTabs: Array<{ scope: ConfigScope; label: string }> = [
	{ scope: "global", label: "User" },
	{ scope: "project", label: "Workspace" }
]

export function createScopedConfigSchema(fields: readonly ScopedConfigField[]) {
	const properties: Record<string, TSchema> = {}
	for (const field of flattenFields(fields)) {
		if (properties[field.key]) continue
		properties[field.key] = Type.Optional(createFieldSchema(field))
	}
	return Type.Object(properties)
}

export function createScopedConfigIO<Config extends object>(options: {
	fileName: string
	title: string
	schema: TSchema
}): ScopedConfigIO<Config> {
	const validator = Schema.Compile(options.schema)

	function getPath(scope: ConfigScope, cwd: string): string {
		return scope === "global" ? join(getAgentDir(), options.fileName) : resolve(cwd, ".pi", options.fileName)
	}

	function readFile(path: string): Config {
		if (!existsSync(path)) return {} as Config
		const raw = readFileSync(path, "utf-8")
		try {
			return validator.Parse(JSON.parse(raw)) as Config
		} catch (error) {
			throw new Error(`Could not parse ${options.title} config at ${path}: ${error instanceof Error ? error.message : String(error)}`)
		}
	}

	function writeFile(path: string, config: Config): void {
		mkdirSync(resolve(path, ".."), { recursive: true })
		writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`, "utf-8")
	}

	function deleteFile(path: string): void {
		rmSync(path, { force: true })
	}

	function merge(scoped: ScopedConfig<Config>): Config {
		return { ...scoped.global, ...scoped.project }
	}

	function loadScoped(cwd: string): ScopedConfig<Config> {
		return {
			global: readFile(getPath("global", cwd)),
			project: readFile(getPath("project", cwd))
		}
	}

	function load(cwd: string): Config {
		return merge(loadScoped(cwd))
	}

	return { getPath, readFile, writeFile, deleteFile, merge, loadScoped, load }
}

export function createScopedConfigCommand<Config extends object>(options: ScopedConfigCommandOptions<Config>) {
	const io = createScopedConfigIO<Config>({
		fileName: options.fileName,
		title: options.title,
		schema: createScopedConfigSchema(options.fields)
	})
	const allFields = flattenFields(options.fields)
	const defaults = defaultConfig(allFields)

	return (pi: ExtensionAPI) => {
		pi.registerCommand(options.command, {
			description: options.description,
			async handler(_args, ctx) {
				let configs = loadCommandConfig(ctx, io, options.title)

				if (ctx.mode !== "tui") {
					ctx.ui.notify(`The interactive /${options.command} settings UI is only available in TUI mode.`, "warning")
					return
				}

				await ctx.ui.custom<void>((tui, theme, _keybindings, done) => {
					let currentTab = 0
					let currentSetting = 0

					function currentScope(): ConfigScope {
						return scopeTabs[currentTab]?.scope ?? "global"
					}

					function resolvedConfig(scope: ConfigScope): Record<string, unknown> {
						return { ...defaults, ...configs.global, ...(scope === "project" ? configs.project : {}) }
					}

					function visibleFields(scope: ConfigScope = currentScope()): FlatField[] {
						return allFields.filter(field => isFieldVisible(field, scope, configs, resolvedConfig(scope)))
					}

					function rows(scope: ConfigScope = currentScope()): Row[] {
						return [...visibleFields(scope).map(field => ({ kind: "field" as const, field })), { kind: "reset" }]
					}

					function refresh() {
						currentSetting = Math.min(currentSetting, rows().length - 1)
						tui.requestRender()
					}

					function switchTab(nextTab: number) {
						currentTab = (nextTab + scopeTabs.length) % scopeTabs.length
						refresh()
					}

					function save(scope: ConfigScope, config: Config) {
						configs = { ...configs, [scope]: config }
						io.writeFile(io.getPath(scope, ctx.cwd), config)
						options.onChange(io.merge(configs), configs, ctx)
						refresh()
					}

					function reset(scope: ConfigScope) {
						configs = { ...configs, [scope]: {} as Config }
						io.deleteFile(io.getPath(scope, ctx.cwd))
						options.onChange(io.merge(configs), configs, ctx)
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
							currentSetting = (currentSetting + 1) % rows().length
							refresh()
							return
						}
						if (matchesKey(data, Key.up)) {
							const activeRows = rows()
							currentSetting = (currentSetting + activeRows.length - 1) % activeRows.length
							refresh()
							return
						}
						if (matchesKey(data, Key.enter) || data === " ") {
							const scope = currentScope()
							const row = rows(scope)[currentSetting]
							if (!row) return
							if (row.kind === "reset") {
								reset(scope)
								return
							}
							save(scope, cycleField(configs[scope], row.field))
							return
						}
						if (matchesKey(data, Key.escape)) done(undefined)
					}

					function render(width: number): string[] {
						const lines: string[] = []
						const renderWidth = Math.max(1, width)
						const scope = currentScope()
						const activeRows = rows(scope)
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
							const isUnset = allFields.every(field => getConfigValue(scopeConfig, field.key) === undefined)
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
						if (tab) {
							const path = tab.scope === "global" ? `~/.pi/agent/${options.fileName}` : `.pi/${options.fileName}`
							addWrappedWithPrefix(" ", `${theme.fg("accent", theme.bold(`${tab.label} config`))} ${theme.fg("dim", path)}`)
						}
						lines.push("")

						for (const [index, row] of activeRows.entries()) {
							const selected = index === currentSetting
							if (row.kind === "reset") {
								lines.push(theme.fg("dim", `  ${"─".repeat(Math.max(1, renderWidth - 2))}`))
								const resetPrefix = theme.fg(selected ? "accent" : "muted", selected ? "> " : "  ")
								addWrappedWithPrefix(
									resetPrefix,
									`${theme.fg("text", "Reset to default")}  ${theme.fg("muted", "delete this scope config file")}`
								)
								continue
							}

							const prefix = theme.fg(selected ? "accent" : "muted", `${selected ? "> " : "  "}${"  ".repeat(row.field.depth)}`)
							const value = formatScopedValue(configs[scope], row.field)
							const valueStyle = value === "unset" ? "muted" : "accent"
							const note = getScopeNote(scope, configs, row.field)
							const renderedNote = note ? ` ${theme.fg("muted", `(${note})`)}` : ""
							addWrappedWithPrefix(prefix, `${theme.fg("text", row.field.label)}  ${theme.fg(valueStyle, value)}${renderedNote}`)
						}

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
}

function createFieldSchema(field: ScopedConfigField): TSchema {
	switch (field.kind) {
		case "enum":
			if (field.values.length === 0) throw new Error(`Enum field ${field.key} must have at least one value`)
			return Type.Union(field.values.map(value => Type.Literal(value)) as unknown as [TSchema, ...TSchema[]])
		case "boolean":
			return Type.Boolean()
	}
}

function flattenFields(fields: readonly ScopedConfigField[], depth = 0): FlatField[] {
	const flattened: FlatField[] = []
	for (const field of fields) {
		flattened.push({ ...field, depth })
		if (field.children) flattened.push(...flattenFields(field.children, depth + 1))
	}
	return flattened
}

function defaultConfig(fields: readonly ScopedConfigField[]): Record<string, unknown> {
	const defaults: Record<string, unknown> = {}
	for (const field of fields) defaults[field.key] = field.default
	return defaults
}

function loadCommandConfig<Config extends object>(ctx: ExtensionContext, io: ScopedConfigIO<Config>, title: string): ScopedConfig<Config> {
	const config: ScopedConfig<Config> = { global: {} as Config, project: {} as Config }
	for (const scope of ["global", "project"] as const) {
		const path = io.getPath(scope, ctx.cwd)
		try {
			config[scope] = io.readFile(path)
		} catch (error) {
			ctx.ui.notify(
				`${title} ignored bad ${scope === "global" ? "User" : "Workspace"} config at ${path}: ${error instanceof Error ? error.message : String(error)}`,
				"warning"
			)
		}
	}
	return config
}

function isFieldVisible<Config extends object>(
	field: FlatField,
	scope: ConfigScope,
	configs: ScopedConfig<Config>,
	effective: Record<string, unknown>
): boolean {
	if (!field.visibleWhen) return true
	return field.visibleWhen({
		scope,
		get: key => effective[key],
		getScoped: (key, targetScope = scope) => getConfigValue(configs[targetScope], key)
	})
}

function getConfigValue(config: object, key: string): unknown {
	return (config as Record<string, unknown>)[key]
}

function setConfigValue<Config extends object>(config: Config, key: string, value: unknown): Config {
	const next = { ...(config as Record<string, unknown>) }
	if (value === undefined) delete next[key]
	else next[key] = value
	return next as Config
}

function cycleField<Config extends object>(config: Config, field: ScopedConfigField): Config {
	const current = formatScopedValue(config, field)
	const options = field.kind === "enum" ? ["unset", ...field.values] : ["unset", "on", "off"]
	const next = nextOption(options, current)
	const persisted = field.kind === "boolean" ? (next === "unset" ? undefined : next === "on") : next === "unset" ? undefined : next
	return setConfigValue(config, field.key, persisted)
}

function nextOption<T extends string>(options: readonly T[], value: T): T {
	const index = options.indexOf(value)
	return options[(index + 1) % options.length] ?? options[0] ?? value
}

function formatScopedValue(config: object, field: ScopedConfigField): string {
	const value = getConfigValue(config, field.key)
	return formatFieldValue(field, value)
}

function formatFieldValue(field: ScopedConfigField, value: unknown): string {
	if (value === undefined) return "unset"
	if (field.kind === "boolean") return value ? "on" : "off"
	return String(value)
}

function formatDefaultValue(field: ScopedConfigField): string {
	return formatFieldValue(field, field.default)
}

function getScopeNote<Config extends object>(
	scope: ConfigScope,
	configs: ScopedConfig<Config>,
	field: ScopedConfigField
): string | undefined {
	const userValue = getConfigValue(configs.global, field.key)
	const workspaceValue = getConfigValue(configs.project, field.key)
	const user = userValue === undefined ? undefined : formatFieldValue(field, userValue)
	const workspace = workspaceValue === undefined ? undefined : formatFieldValue(field, workspaceValue)
	const defaultValue = formatDefaultValue(field)

	if (user === undefined && workspace === undefined) return `uses default: ${defaultValue}`

	if (scope === "global") {
		if (user !== undefined && workspace !== undefined) return `Workspace overrides with: ${workspace}`
		if (user === undefined && workspace !== undefined) return `Workspace sets: ${workspace}`
		return undefined
	}

	if (workspace === undefined && user !== undefined) return `inherits User: ${user}`
	if (workspace !== undefined && user !== undefined) return workspace === user ? `same as User: ${user}` : `overrides User: ${user}`
	if (workspace !== undefined && user === undefined) return `overrides default: ${defaultValue}`
	return undefined
}
