import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { CONFIG_DIR_NAME, type ExtensionAPI, type ExtensionContext, getAgentDir } from "@earendil-works/pi-coding-agent"
import { Key, matchesKey, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui"
import { type Static, type TBoolean, type TLiteral, type TObject, type TOptional, type TSchema, type TUnion, Type } from "typebox"
import Schema from "typebox/schema"

export type ConfigScope = "global" | "project"
export type ScopedConfig<Config extends object> = Record<ConfigScope, Config>

type FieldKind = "enum" | "boolean"
type EnumValues = readonly [string, ...string[]]

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
	values: EnumValues
	default: string
}

export type BooleanConfigField = BaseField & {
	kind: "boolean"
	default: boolean
}

export type ScopedConfigField = EnumConfigField | BooleanConfigField

type FieldUnion<Fields extends readonly ScopedConfigField[]> = Fields[number] | ChildFieldUnion<Fields[number]>
type ChildFieldUnion<Field> = Field extends { children: infer Children extends readonly ScopedConfigField[] } ? FieldUnion<Children> : never
type LiteralSchemas<Values extends readonly string[]> = Values extends readonly [infer First extends string, ...infer Rest extends string[]]
	? [TLiteral<First>, ...LiteralSchemas<Rest>]
	: []
type FieldSchema<Field extends ScopedConfigField> = Field extends { kind: "enum"; values: infer Values extends EnumValues }
	? TOptional<TUnion<LiteralSchemas<Values>>>
	: Field extends { kind: "boolean" }
		? TOptional<TBoolean>
		: never
type UnionToIntersection<Union> = (Union extends unknown ? (value: Union) => void : never) extends (value: infer Intersection) => void
	? Intersection
	: never
type FieldProperty<Field extends ScopedConfigField> = Field extends unknown ? { [Key in Field["key"]]: FieldSchema<Field> } : never
type SchemaProperties<Fields extends readonly ScopedConfigField[]> =
	UnionToIntersection<FieldProperty<FieldUnion<Fields>>> extends infer Properties ? { [Key in keyof Properties]: Properties[Key] } : never
type FieldDefaultProperty<Field extends ScopedConfigField> = Field extends unknown ? { [Key in Field["key"]]: Field["default"] } : never
type DefaultValues<Fields extends readonly ScopedConfigField[]> =
	UnionToIntersection<FieldDefaultProperty<FieldUnion<Fields>>> extends infer Defaults ? { [Key in keyof Defaults]: Defaults[Key] } : never
type ConfigFromFields<Fields extends readonly ScopedConfigField[]> = Static<TObject<SchemaProperties<Fields>>>

type FlatField = ScopedConfigField & { depth: number }
type Row = { kind: "field"; field: FlatField } | { kind: "reset" }

type ScopedConfigCommandOptions<Config extends object> = {
	command: string
	description: string
	config: ScopedConfigDefinition<Config>
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

export type ScopedConfigDefinition<Config extends object> = ScopedConfigIO<Config> & {
	fileName: string
	fields: readonly ScopedConfigField[]
	schema: TSchema
	defaults: Record<string, unknown>
	get<Key extends keyof Config>(config: Config, key: Key): NonNullable<Config[Key]>
}

const scopeTabs: Array<{ scope: ConfigScope; label: string }> = [
	{ scope: "global", label: "User" },
	{ scope: "project", label: "Workspace" }
]

export function createScopedConfigSchema<const Fields extends readonly ScopedConfigField[]>(
	fields: Fields
): TObject<SchemaProperties<Fields>> {
	const properties: Record<string, TSchema> = {}
	for (const field of flattenFields(fields)) {
		if (properties[field.key]) continue
		properties[field.key] = Type.Optional(createFieldSchema(field))
	}
	return Type.Object(properties) as TObject<SchemaProperties<Fields>>
}

export function defineScopedConfig<const Fields extends readonly ScopedConfigField[]>(options: {
	fileName: string
	fields: Fields
}): ScopedConfigDefinition<ConfigFromFields<Fields>> & {
	fields: Fields
	schema: TObject<SchemaProperties<Fields>>
	defaults: DefaultValues<Fields>
} {
	const schema = createScopedConfigSchema(options.fields)
	const defaults = defaultConfig(schema) as DefaultValues<Fields>
	const io = createScopedConfigIO<ConfigFromFields<Fields>>({ fileName: options.fileName, schema })
	function get<Key extends keyof ConfigFromFields<Fields>>(
		config: ConfigFromFields<Fields>,
		key: Key
	): NonNullable<ConfigFromFields<Fields>[Key]> {
		const value = getConfigValue(config, String(key))
		return (value === undefined ? defaults[key as keyof DefaultValues<Fields>] : value) as NonNullable<ConfigFromFields<Fields>[Key]>
	}

	return { ...io, fileName: options.fileName, fields: options.fields, schema, defaults, get }
}

export function createScopedConfigIO<Config extends object>(options: { fileName: string; schema: TSchema }): ScopedConfigIO<Config> {
	const validator = Schema.Compile(options.schema)

	function getPath(scope: ConfigScope, cwd: string): string {
		return scope === "global" ? join(getAgentDir(), options.fileName) : resolve(cwd, CONFIG_DIR_NAME, options.fileName)
	}

	function readFile(path: string): Config {
		if (!existsSync(path)) return {} as Config
		const raw = readFileSync(path, "utf-8")
		try {
			return validator.Parse(JSON.parse(raw)) as Config
		} catch {
			return {} as Config
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
	const configDefinition = options.config
	const allFields = flattenFields(configDefinition.fields)
	const defaults = configDefinition.defaults

	return (pi: ExtensionAPI) => {
		pi.registerCommand(options.command, {
			description: options.description,
			async handler(_args, ctx) {
				let configs = loadCommandConfig(ctx, configDefinition)

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
						configDefinition.writeFile(configDefinition.getPath(scope, ctx.cwd), config)
						options.onChange(configDefinition.merge(configs), configs, ctx)
						refresh()
					}

					function reset(scope: ConfigScope) {
						configs = { ...configs, [scope]: {} as Config }
						configDefinition.deleteFile(configDefinition.getPath(scope, ctx.cwd))
						options.onChange(configDefinition.merge(configs), configs, ctx)
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
							const path =
								tab.scope === "global" ? `~/.pi/agent/${configDefinition.fileName}` : `${CONFIG_DIR_NAME}/${configDefinition.fileName}`
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
			return Type.Union(field.values.map(value => Type.Literal(value)) as unknown as [TSchema, ...TSchema[]], { default: field.default })
		case "boolean":
			return Type.Boolean({ default: field.default })
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

function defaultConfig(schema: TObject): Record<string, unknown> {
	const defaults: Record<string, unknown> = {}
	for (const [key, property] of Object.entries(schema.properties)) {
		defaults[key] = (property as TSchema & { default: unknown }).default
	}
	return defaults
}

function loadCommandConfig<Config extends object>(ctx: ExtensionContext, io: ScopedConfigDefinition<Config>): ScopedConfig<Config> {
	const config: ScopedConfig<Config> = { global: {} as Config, project: {} as Config }
	for (const scope of ["global", "project"] as const) {
		const path = io.getPath(scope, ctx.cwd)
		try {
			config[scope] = io.readFile(path)
		} catch (error) {
			ctx.ui.notify(
				`${io.fileName} ignored unreadable ${scope === "global" ? "User" : "Workspace"} config at ${path}: ${error instanceof Error ? error.message : String(error)}`,
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
