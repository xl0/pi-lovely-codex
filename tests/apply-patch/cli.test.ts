import { describe, expect, test } from "bun:test"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { withTempDir } from "./fs"
import { runners } from "./runners"

for (const runner of runners) {
	describe(`apply_patch cli: ${runner.name}`, () => {
		test("add then update", async () => {
			await withTempDir(async cwd => {
				const path = join(cwd, "cli_test.txt")
				const addPatch = `*** Begin Patch
*** Add File: cli_test.txt
+hello
*** End Patch`
				const addResult = await runner.run(cwd, addPatch)
				expect(addResult).toEqual({
					exitCode: 0,
					stdout: "Success. Updated the following files:\nA cli_test.txt\n",
					stderr: ""
				})
				expect(await readFile(path, "utf8")).toBe("hello\n")

				const updatePatch = `*** Begin Patch
*** Update File: cli_test.txt
@@
-hello
+world
*** End Patch`
				const updateResult = await runner.run(cwd, updatePatch)
				expect(updateResult).toEqual({
					exitCode: 0,
					stdout: "Success. Updated the following files:\nM cli_test.txt\n",
					stderr: ""
				})
				expect(await readFile(path, "utf8")).toBe("world\n")
			})
		})

		test("multiple operations", async () => {
			await withTempDir(async cwd => {
				await writeFile(join(cwd, "modify.txt"), "line1\nline2\n")
				await writeFile(join(cwd, "delete.txt"), "obsolete\n")
				const patch = `*** Begin Patch
*** Add File: nested/new.txt
+created
*** Delete File: delete.txt
*** Update File: modify.txt
@@
-line2
+changed
*** End Patch`
				const result = await runner.run(cwd, patch)
				expect(result).toEqual({
					exitCode: 0,
					stdout: "Success. Updated the following files:\nA nested/new.txt\nM modify.txt\nD delete.txt\n",
					stderr: ""
				})
				expect(await readFile(join(cwd, "nested/new.txt"), "utf8")).toBe("created\n")
				expect(await readFile(join(cwd, "modify.txt"), "utf8")).toBe("line1\nchanged\n")
			})
		})

		test("move to new directory", async () => {
			await withTempDir(async cwd => {
				await mkdir(join(cwd, "old"), { recursive: true })
				await writeFile(join(cwd, "old/name.txt"), "old content\n")
				const patch = `*** Begin Patch
*** Update File: old/name.txt
*** Move to: renamed/dir/name.txt
@@
-old content
+new content
*** End Patch`
				const result = await runner.run(cwd, patch)
				expect(result).toEqual({
					exitCode: 0,
					stdout: "Success. Updated the following files:\nM renamed/dir/name.txt\n",
					stderr: ""
				})
				expect(await readFile(join(cwd, "renamed/dir/name.txt"), "utf8")).toBe("new content\n")
			})
		})

		test("rejects empty patch", async () => {
			await withTempDir(async cwd => {
				const result = await runner.run(
					cwd,
					`*** Begin Patch
*** End Patch`
				)
				expect(result).toEqual({
					exitCode: 1,
					stdout: "",
					stderr: "No files were modified.\n"
				})
			})
		})

		test("rejects missing context", async () => {
			await withTempDir(async cwd => {
				await writeFile(join(cwd, "modify.txt"), "line1\nline2\n")
				const result = await runner.run(
					cwd,
					`*** Begin Patch
*** Update File: modify.txt
@@
-missing
+changed
*** End Patch`
				)
				expect(result.exitCode).toBe(1)
				expect(result.stdout).toBe("")
				expect(result.stderr).toBe(`Failed to find expected lines in ${join(cwd, "modify.txt")}:
missing
`)
			})
		})

		test("requires existing file for update", async () => {
			await withTempDir(async cwd => {
				const result = await runner.run(
					cwd,
					`*** Begin Patch
*** Update File: missing.txt
@@
-old
+new
*** End Patch`
				)
				expect(result.exitCode).toBe(1)
				expect(result.stdout).toBe("")
				expect(result.stderr).toBe(`Failed to read file to update ${join(cwd, "missing.txt")}: No such file or directory (os error 2)\n`)
			})
		})

		test("rejects missing file delete", async () => {
			await withTempDir(async cwd => {
				const result = await runner.run(
					cwd,
					`*** Begin Patch
*** Delete File: missing.txt
*** End Patch`
				)
				expect(result.exitCode).toBe(1)
				expect(result.stdout).toBe("")
				expect(result.stderr).toBe(`Failed to delete file ${join(cwd, "missing.txt")}\n`)
			})
		})
	})
}
