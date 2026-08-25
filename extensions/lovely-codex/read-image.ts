import { extname } from "node:path"
import { createReadToolDefinition, type ExtensionAPI } from "@earendil-works/pi-coding-agent"
import { Text } from "@earendil-works/pi-tui"
import { Type } from "typebox"

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"])

// Disabling `read` also removes the only way to view images, since shell reads
// return bytes, not attachments. This registers an image-only stand-in that
// reuses Pi's read tool (mime sniff, resize, convert, rendering) but refuses
// text files, keeping the model on bounded shell reads for those.
export function registerReadImageTool(pi: ExtensionAPI): void {
	// The read def binds its cwd at construction, but we only learn cwd from ctx
	// at execute time; cwd is fixed per session, so build it once on first use.
	// The scaffold (bound to ".") only supplies name/schema/render for the spread.
	const scaffold = createReadToolDefinition(".")
	let readDef: typeof scaffold | undefined
	pi.registerTool({
		...scaffold,
		name: "view_image",
		label: "view_image",
		description: `Read an image file (${[...IMAGE_EXTENSIONS].map(ext => ext.slice(1)).join(", ")}) and return it as an attachment.`,
		promptSnippet: "Use view_image to look at image files",
		promptGuidelines: [],
		parameters: Type.Object({
			path: Type.String({ description: "Path to the image file (relative or absolute)" })
		}),
		renderCall(args, theme) {
			const title = theme.fg("toolTitle", theme.bold("view_image"))
			const path = typeof args?.path === "string" ? args.path : ""
			return new Text(path ? `${title} ${theme.fg("accent", path)}` : title, 0, 0)
		},
		async execute(toolCallId, params, signal, onUpdate, ctx) {
			if (!IMAGE_EXTENSIONS.has(extname(params.path).toLowerCase())) throw new Error(`view_image only reads images`)
			readDef ??= createReadToolDefinition(ctx.cwd)
			return readDef.execute(toolCallId, params, signal, onUpdate, ctx)
		}
	})
}
