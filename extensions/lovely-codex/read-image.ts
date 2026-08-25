import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { detectSupportedImageMimeTypeFromFile, type ExtensionAPI } from "@earendil-works/pi-coding-agent"
import { Text } from "@earendil-works/pi-tui"
import { Type } from "typebox"

// Disabling `read` also removes the only way to view images, since shell reads
// return bytes, not attachments. This registers an image-only stand-in: Pi's
// sniff decides what is an image (whatever the extension), so text stays on
// bounded shell reads. Resize/convert is Pi's job — it normalizes every tool
// result's images as they enter history, honoring the auto-resize setting.
export function registerReadImageTool(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "view_image",
		label: "view_image",
		description: "Read an image file (png, jpg, gif, webp, bmp) and return it as an attachment.",
		promptSnippet: "Use view_image to look at image files",
		parameters: Type.Object({
			path: Type.String({ description: "Path to the image file (relative or absolute)" })
		}),
		renderCall(args, theme) {
			const title = theme.fg("toolTitle", theme.bold("view_image"))
			const path = typeof args?.path === "string" ? args.path : ""
			return new Text(path ? `${title} ${theme.fg("accent", path)}` : title, 0, 0)
		},
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const absolutePath = resolve(ctx.cwd, params.path)
			const mimeType = await detectSupportedImageMimeTypeFromFile(absolutePath)
			if (!mimeType) throw new Error(`${params.path} is not a supported image`)
			return {
				content: [
					{ type: "text", text: `Read image file [${mimeType}]` },
					{ type: "image", data: (await readFile(absolutePath)).toString("base64"), mimeType }
				],
				details: undefined
			}
		}
	})
}
