import type { Dirent } from "node:fs"
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, relative } from "node:path"

export type SnapshotEntry = { type: "dir" } | { type: "file"; content: Uint8Array }

export async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
	const dir = await mkdtemp(join(tmpdir(), "pi-apply-patch-"))
	try {
		return await fn(dir)
	} finally {
		await rm(dir, { recursive: true, force: true })
	}
}

export async function copyDirContents(src: string, dst: string): Promise<void> {
	let entries: Dirent<string>[]
	try {
		entries = await readdir(src, { withFileTypes: true })
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return
		throw error
	}
	for (const entry of entries) {
		const srcPath = join(src, entry.name)
		const dstPath = join(dst, entry.name)
		if (entry.isDirectory()) {
			await mkdir(dstPath, { recursive: true })
			await copyDirContents(srcPath, dstPath)
			continue
		}
		if (entry.isFile()) {
			await mkdir(dirname(dstPath), { recursive: true })
			await writeFile(dstPath, await readFile(srcPath))
		}
	}
}

export async function snapshotDir(root: string): Promise<Map<string, SnapshotEntry>> {
	const snapshot = new Map<string, SnapshotEntry>()
	await snapshotInto(root, root, snapshot)
	return snapshot
}

async function snapshotInto(base: string, dir: string, snapshot: Map<string, SnapshotEntry>) {
	let entries: Dirent<string>[]
	try {
		entries = await readdir(dir, { withFileTypes: true })
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return
		throw error
	}
	for (const entry of entries) {
		const path = join(dir, entry.name)
		const rel = relative(base, path)
		const metadata = await stat(path)
		if (metadata.isDirectory()) {
			snapshot.set(rel, { type: "dir" })
			await snapshotInto(base, path, snapshot)
			continue
		}
		if (metadata.isFile()) {
			snapshot.set(rel, { type: "file", content: await readFile(path) })
		}
	}
}
