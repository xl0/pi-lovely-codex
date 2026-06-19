import type { Usage } from "@earendil-works/pi-ai"
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent"
import type { CodexConfig } from "./config.js"

const serviceTierProviders = new Set(["openai", "openai-codex"])

export function registerGptModeHooks(pi: ExtensionAPI, getMode: () => NonNullable<CodexConfig["gptMode"]>) {
	pi.on("before_provider_request", (event, ctx) => {
		const model = ctx.model
		if (!model?.id.startsWith("gpt-") || !serviceTierProviders.has(model.provider)) return

		const mode = getMode()
		if (mode !== "fast" && (mode !== "fast-codex" || model.provider !== "openai-codex")) return
		return { ...(event.payload as Record<string, unknown>), service_tier: "priority" }
	})

	pi.on("message_end", event => {
		// Uses current mode; changing /lovely-codex mid-stream can skew cost display, but billing unaffected.
		if (event.message.role !== "assistant") return
		if (event.message.provider !== "openai-codex" || !event.message.model.startsWith("gpt-")) return
		const mode = getMode()
		if (mode !== "fast" && mode !== "fast-codex") return

		const multiplier = event.message.model === "gpt-5.5" ? 2.5 : 2
		const cost = event.message.usage.cost
		const nextCost: Usage["cost"] = {
			input: cost.input * multiplier,
			output: cost.output * multiplier,
			cacheRead: cost.cacheRead * multiplier,
			cacheWrite: cost.cacheWrite * multiplier,
			total: 0
		}
		nextCost.total = nextCost.input + nextCost.output + nextCost.cacheRead + nextCost.cacheWrite
		return { message: { ...event.message, usage: { ...event.message.usage, cost: nextCost } } }
	})
}
