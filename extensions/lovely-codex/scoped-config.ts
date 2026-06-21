import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { CONFIG_DIR_NAME, type ExtensionContext, getAgentDir, type Theme } from "@earendil-works/pi-coding-agent"
import { Key, matchesKey, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui"
import { type TObject, type TSchema, Type } from "typebox"
import Schema from "typebox/schema"

export type ConfigScope = "user" | "workspace"
export type ScopedConfig<Config extends object> = Record<ConfigScope, Config>

type EnumValues = readonly [string, ...string[]]

type VisibilityContext = {
	get(key: string): unknown
	getScoped(key: string, scope?: ConfigScope): unknown
	scope: ConfigScope
}

type BaseField = {
	key: string
	label: string
	kind: "enum" | "boolean"
	depth?: number
	visibleWhen?: (ctx: VisibilityContext) => boolean
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
export type ConfigFromFields<Fields extends readonly ScopedConfigField[]> = {
	[Field in Fields[number] as Field["key"]]?: FieldValue<Field>
}

type ConfigDefaults<Config extends object> = { [Key in keyof Config]-?: NonNullable<Config[Key]> } & Record<string, unknown>
type FieldValue<Field> = Field extends { kind: "enum"; values: infer Values extends readonly string[] }
	? Values[number]
	: Field extends { kind: "boolean" }
		? boolean
		: never
type ValidateEnumDefaults<Fields extends readonly ScopedConfigField[]> = {
	[Index in keyof Fields]: Fields[Index] extends {
		kind: "enum"
		values: infer Values extends readonly string[]
		default: infer Default extends string
	}
		? Default extends Values[number]
			? unknown
			: { enumDefaultMustBeOneOf: Values[number] }
		: unknown
}

type Row = { kind: "field"; field: ScopedConfigField } | { kind: "reset" }
type RenderTui = { requestRender(): void }

type ScopedConfigChangeHandler<Config extends object> = (effective: Config, scoped: ScopedConfig<Config>) => void

export type ScopedConfigSpec<Config extends object> = {
	fileName: string
	fields: readonly ScopedConfigField[]
	schema: TSchema
	defaults: ConfigDefaults<Config>
	get<Key extends keyof Config>(config: Config, key: Key): NonNullable<Config[Key]>
	getPath(scope: ConfigScope, cwd: string): string
	readFileOrEmpty(path: string): Config
	writeFile(path: string, config: Config): void
	deleteFile(path: string): void
	merge(scoped: ScopedConfig<Config>): Config
	loadScoped(cwd: string): ScopedConfig<Config>
	load(cwd: string): Config
}

export class ScopedConfigState<Config extends object> {
	private effective: Config = {} as Config

	constructor(readonly spec: ScopedConfigSpec<Config>) {}

	load(cwd: string): Config {
		this.effective = this.spec.load(cwd)
		return this.effective
	}

	set(next: Config): Config {
		this.effective = next
		return this.effective
	}

	reset(): Config {
		this.effective = {} as Config
		return this.effective
	}

	get<Key extends keyof Config>(key: Key): NonNullable<Config[Key]> {
		return this.spec.get(this.effective, key)
	}
}

const scopeTabs = ["user", "workspace"] as const satisfies readonly ConfigScope[]

export function createScopedConfigSchema(fields: readonly ScopedConfigField[]): TObject {
	validateFields(fields)
	const properties: Record<string, TSchema> = {}
	for (const field of fields) {
		properties[field.key] = Type.Optional(createFieldSchema(field))
	}
	return Type.Object(properties)
}

export function defineScopedConfigSpec<const Fields extends readonly ScopedConfigField[]>(options: {
	fileName: string
	fields: Fields & ValidateEnumDefaults<Fields>
}): ScopedConfigSpec<ConfigFromFields<Fields>> & {
	fields: Fields
	schema: TObject
} {
	type Config = ConfigFromFields<Fields>
	const schema = createScopedConfigSchema(options.fields)
	const defaults = defaultConfig(options.fields) as ConfigDefaults<Config>
	const validator = Schema.Compile(schema)

	function get<Key extends keyof Config>(config: Config, key: Key): NonNullable<Config[Key]> {
		const value = getConfigValue(config, String(key))
		return (value === undefined ? defaults[key] : value) as NonNullable<Config[Key]>
	}

	function getPath(scope: ConfigScope, cwd: string): string {
		return scope === "user" ? join(getAgentDir(), options.fileName) : resolve(cwd, CONFIG_DIR_NAME, options.fileName)
	}

	function readFileOrEmpty(path: string): Config {
		if (!existsSync(path)) return {} as Config
		const raw = readFileSync(path, "utf-8")
		try {
			return validator.Parse(JSON.parse(raw)) as Config
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			throw new Error(`Invalid config at ${path}: ${message}`)
		}
	}

	function writeFile(path: string, config: Config): void {
		mkdirSync(dirname(path), { recursive: true })
		writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`, "utf-8")
	}

	function deleteFile(path: string): void {
		rmSync(path, { force: true })
	}

	function merge(scoped: ScopedConfig<Config>): Config {
		return { ...scoped.user, ...scoped.workspace }
	}

	function loadScoped(cwd: string): ScopedConfig<Config> {
		return {
			user: readFileOrEmpty(getPath("user", cwd)),
			workspace: readFileOrEmpty(getPath("workspace", cwd))
		}
	}

	function load(cwd: string): Config {
		return merge(loadScoped(cwd))
	}

	return {
		fileName: options.fileName,
		fields: options.fields,
		schema,
		defaults,
		get,
		getPath,
		readFileOrEmpty,
		writeFile,
		deleteFile,
		merge,
		loadScoped,
		load
	}
}

export class ScopedConfigEditor<Config extends object> {
	private scoped: ScopedConfig<Config>
	private readonly tui: RenderTui
	private readonly theme: Theme
	private readonly ctx: ExtensionContext
	private readonly spec: ScopedConfigSpec<Config>
	private readonly onChange: ScopedConfigChangeHandler<Config>
	private readonly fields: readonly ScopedConfigField[]
	private readonly defaults: ConfigDefaults<Config>
	private readonly done: (result: undefined) => void
	private currentTab = 0
	private currentRow = 0

	constructor(options: {
		tui: RenderTui
		theme: Theme
		ctx: ExtensionContext
		spec: ScopedConfigSpec<Config>
		scoped: ScopedConfig<Config>
		onChange: ScopedConfigChangeHandler<Config>
		done: (result: undefined) => void
	}) {
		this.tui = options.tui
		this.theme = options.theme
		this.ctx = options.ctx
		this.spec = options.spec
		this.onChange = options.onChange
		this.fields = options.spec.fields
		this.defaults = options.spec.defaults
		this.scoped = options.scoped
		this.done = options.done
	}

	render(width: number): string[] {
		const lines: string[] = []
		const renderWidth = Math.max(1, width)
		const scope = this.currentScope()
		const rows = this.rows(scope)

		lines.push(this.theme.fg("accent", "─".repeat(renderWidth)))
		this.renderTabs(lines, renderWidth)
		lines.push("")
		this.renderScopeHeader(lines, renderWidth)
		lines.push("")
		this.renderRows(lines, renderWidth, scope, rows)
		lines.push("")
		addWrappedWithPrefix(
			lines,
			renderWidth,
			" ",
			this.theme.fg("dim", "Tab/←→ switch scope • ↑↓ select • Enter/Space change/reset • Esc close")
		)
		lines.push(this.theme.fg("accent", "─".repeat(renderWidth)))

		return lines
	}

	invalidate() {}

	handleInput(data: string): void {
		if (matchesKey(data, Key.tab) || matchesKey(data, Key.right)) {
			this.switchTab(1)
			return
		}
		if (matchesKey(data, Key.shift("tab")) || matchesKey(data, Key.left)) {
			this.switchTab(-1)
			return
		}
		if (matchesKey(data, Key.down)) {
			this.moveRow(1)
			return
		}
		if (matchesKey(data, Key.up)) {
			this.moveRow(-1)
			return
		}
		if (matchesKey(data, Key.enter) || data === " ") {
			this.activateRow()
			return
		}
		if (matchesKey(data, Key.escape)) this.done(undefined)
	}

	private renderTabs(lines: string[], width: number): void {
		const tabs = ["← "]
		for (const [index, scope] of scopeTabs.entries()) {
			const isUnset = this.scopeIsUnset(scope)
			const text = ` ${isUnset ? "□" : "■"} ${scopeLabel(scope)} `
			const styled =
				index === this.currentTab
					? this.theme.bg("selectedBg", this.theme.fg("text", text))
					: this.theme.fg(isUnset ? "muted" : "success", text)
			tabs.push(`${styled} `)
		}
		tabs.push("→")
		addWrappedWithPrefix(lines, width, " ", tabs.join(""))
	}

	private renderScopeHeader(lines: string[], width: number): void {
		const scope = scopeTabs[this.currentTab]
		if (!scope) return

		const path = this.spec.getPath(scope, this.ctx.cwd)
		addWrappedWithPrefix(
			lines,
			width,
			" ",
			`${this.theme.fg("accent", this.theme.bold(`${scopeLabel(scope)} config`))} ${this.theme.fg("dim", path)}`
		)
	}

	private renderRows(lines: string[], width: number, scope: ConfigScope, rows: Row[]): void {
		for (const [index, row] of rows.entries()) {
			const selected = index === this.currentRow
			if (row.kind === "reset") {
				this.renderResetRow(lines, width, selected)
				continue
			}

			const prefix = this.theme.fg(selected ? "accent" : "muted", `${selected ? "> " : "  "}${"  ".repeat(row.field.depth ?? 0)}`)
			const value = formatScopedValue(this.scoped[scope], row.field)
			const note = getScopeNote(scope, this.scoped, row.field)
			const renderedNote = note ? ` ${this.theme.fg("muted", `(${note})`)}` : ""
			const valueStyle = value === "unset" ? "muted" : "accent"
			addWrappedWithPrefix(
				lines,
				width,
				prefix,
				`${this.theme.fg("text", row.field.label)}  ${this.theme.fg(valueStyle, value)}${renderedNote}`
			)
		}
	}

	private renderResetRow(lines: string[], width: number, selected: boolean): void {
		lines.push(this.theme.fg("dim", `  ${"─".repeat(Math.max(1, width - 2))}`))
		const prefix = this.theme.fg(selected ? "accent" : "muted", selected ? "> " : "  ")
		addWrappedWithPrefix(
			lines,
			width,
			prefix,
			`${this.theme.fg("text", "Reset to default")}  ${this.theme.fg("muted", "delete this scope config file")}`
		)
	}

	private currentScope(): ConfigScope {
		return scopeTabs[this.currentTab] ?? "user"
	}

	private resolvedConfig(scope: ConfigScope): Record<string, unknown> {
		return { ...this.defaults, ...this.scoped.user, ...(scope === "workspace" ? this.scoped.workspace : {}) }
	}

	private rows(scope: ConfigScope = this.currentScope()): Row[] {
		const effective = this.resolvedConfig(scope)
		const fields = this.fields.filter(field => isFieldVisible(field, scope, this.scoped, effective))
		return [...fields.map(field => ({ kind: "field" as const, field })), { kind: "reset" }]
	}

	private scopeIsUnset(scope: ConfigScope): boolean {
		return this.fields.every(field => getConfigValue(this.scoped[scope], field.key) === undefined)
	}

	private refresh(): void {
		this.currentRow = Math.min(this.currentRow, this.rows().length - 1)
		this.tui.requestRender()
	}

	private switchTab(delta: number): void {
		this.currentTab = (this.currentTab + delta + scopeTabs.length) % scopeTabs.length
		this.refresh()
	}

	private moveRow(delta: number): void {
		const rowCount = this.rows().length
		this.currentRow = (this.currentRow + delta + rowCount) % rowCount
		this.refresh()
	}

	private activateRow(): void {
		const scope = this.currentScope()
		const row = this.rows(scope)[this.currentRow]
		if (!row) return
		if (row.kind === "reset") this.reset(scope)
		else this.save(scope, cycleField(this.scoped[scope], row.field))
	}

	private save(scope: ConfigScope, nextConfig: Config): void {
		this.scoped = { ...this.scoped, [scope]: nextConfig }
		this.spec.writeFile(this.spec.getPath(scope, this.ctx.cwd), nextConfig)
		this.onChange(this.spec.merge(this.scoped), this.scoped)
		this.refresh()
	}

	private reset(scope: ConfigScope): void {
		this.scoped = { ...this.scoped, [scope]: {} as Config }
		this.spec.deleteFile(this.spec.getPath(scope, this.ctx.cwd))
		this.onChange(this.spec.merge(this.scoped), this.scoped)
		this.refresh()
	}
}

function addWrappedWithPrefix(lines: string[], width: number, prefix: string, text: string): void {
	const prefixWidth = visibleWidth(prefix)
	if (prefixWidth >= width) {
		lines.push(...wrapTextWithAnsi(prefix + text, width))
		return
	}

	const wrapped = wrapTextWithAnsi(text, width - prefixWidth)
	const continuationPrefix = " ".repeat(prefixWidth)
	for (let i = 0; i < wrapped.length; i++) lines.push(`${i === 0 ? prefix : continuationPrefix}${wrapped[i]}`)
}

function validateFields(fields: readonly ScopedConfigField[]): void {
	const keys = new Set<string>()
	for (const field of fields) {
		if (keys.has(field.key)) throw new Error(`Duplicate config field key: ${field.key}`)
		keys.add(field.key)
		if (field.depth !== undefined && (!Number.isInteger(field.depth) || field.depth < 0)) {
			throw new Error(`Config field ${field.key} depth must be a non-negative integer`)
		}

		if (field.kind !== "enum") continue
		if (field.values.length === 0) throw new Error(`Enum field ${field.key} must have at least one value`)
		if (!field.values.includes(field.default)) {
			throw new Error(`Enum field ${field.key} default must be one of: ${field.values.join(", ")}`)
		}
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

function defaultConfig(fields: readonly ScopedConfigField[]): Record<string, unknown> {
	const defaults: Record<string, unknown> = {}
	for (const field of fields) defaults[field.key] ??= field.default
	return defaults
}

function isFieldVisible<Config extends object>(
	field: ScopedConfigField,
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

function getScopeNote<Config extends object>(
	scope: ConfigScope,
	configs: ScopedConfig<Config>,
	field: ScopedConfigField
): string | undefined {
	const userValue = getConfigValue(configs.user, field.key)
	const workspaceValue = getConfigValue(configs.workspace, field.key)
	const user = userValue === undefined ? undefined : formatFieldValue(field, userValue)
	const workspace = workspaceValue === undefined ? undefined : formatFieldValue(field, workspaceValue)
	const defaultValue = formatFieldValue(field, field.default)

	if (user === undefined && workspace === undefined) return `uses default: ${defaultValue}`

	if (scope === "user") {
		if (user !== undefined && workspace !== undefined) return `Workspace overrides with: ${workspace}`
		if (user === undefined && workspace !== undefined) return `Workspace sets: ${workspace}`
		return undefined
	}

	if (workspace === undefined && user !== undefined) return `inherits User: ${user}`
	if (workspace !== undefined && user !== undefined) return workspace === user ? `same as User: ${user}` : `overrides User: ${user}`
	if (workspace !== undefined && user === undefined) return `overrides default: ${defaultValue}`
	return undefined
}

function scopeLabel(scope: ConfigScope): string {
	return `${scope[0]?.toUpperCase() ?? ""}${scope.slice(1)}`
}
