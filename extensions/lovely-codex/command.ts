import { homedir } from "node:os"
import { join, resolve } from "node:path"
import { type ExtensionAPI, getSettingsListTheme } from "@earendil-works/pi-coding-agent"
import { Container, type SettingItem, SettingsList, Text } from "@earendil-works/pi-tui"
import { CONFIG_FILE_NAME, type GptMode, getGptMode, readConfigFile, writeConfigFile } from "./config.js"

function modeFromArgs(args: string): GptMode | undefined {
	const mode = args.trim().split(/\s+/, 1)[0]
	return mode === "default" || mode === "fast" || mode === "fast-codex" ? mode : undefined
}

export function registerCodexCommand(pi: ExtensionAPI, refreshConfig: (cwd: string) => void) {
	pi.registerCommand("codex", {
		description: "Configure Lovely Codex GPT mode",
		async handler(args, ctx) {
			if (!ctx.hasUI) {
				ctx.ui.notify("The /codex command is only available in interactive mode.", "warning")
				return
			}

			const scope = await ctx.ui.select("Config scope:", ["Global (~/.pi/agent/)", "Project (.pi/)"])
			if (scope === undefined) return

			const configPath = scope.startsWith("Global")
				? join(homedir(), ".pi", "agent", CONFIG_FILE_NAME)
				: resolve(ctx.cwd, ".pi", CONFIG_FILE_NAME)

			let config: ReturnType<typeof readConfigFile>
			try {
				config = readConfigFile(configPath)
			} catch (error) {
				ctx.ui.notify(error instanceof Error ? error.message : String(error), "error")
				return
			}

			const argMode = modeFromArgs(args)
			if (argMode) {
				config.gptMode = argMode
				writeConfigFile(configPath, config)
				refreshConfig(ctx.cwd)
				ctx.ui.notify(`Lovely Codex GPT mode: ${argMode}`, "info")
				return
			}

			await ctx.ui.custom((_tui, theme, _keybindings, done) => {
				const items: SettingItem[] = [
					{
						id: "gpt-mode",
						label: "GPT mode",
						currentValue: getGptMode(config),
						description:
							"default uses default service tier; fast uses priority for all OpenAI GPT; fast-codex uses priority only for Codex sub.",
						values: ["default", "fast", "fast-codex"]
					}
				]
				const container = new Container()
				container.addChild(new Text(theme.fg("accent", theme.bold("Lovely Codex")), 1, 1))
				const list = new SettingsList(
					items,
					items.length,
					getSettingsListTheme(),
					(_id, newValue) => {
						config.gptMode = newValue as GptMode
						writeConfigFile(configPath, config)
						refreshConfig(ctx.cwd)
					},
					() => done(undefined)
				)
				container.addChild(list)
				return {
					render: (width: number) => container.render(width),
					invalidate: () => container.invalidate(),
					handleInput: (data: string) => list.handleInput(data)
				}
			})
		}
	})
}
