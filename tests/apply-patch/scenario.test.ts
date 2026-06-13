import { describe, expect, test } from "bun:test"
import { readdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import { copyDirContents, snapshotDir, withTempDir } from "./fs"
import { runners } from "./runners"

const scenariosDir = join(import.meta.dir, "fixtures", "scenarios")
const scenarioNames = (await readdir(scenariosDir, { withFileTypes: true }))
	.filter(entry => entry.isDirectory())
	.map(entry => entry.name)
	.sort()

for (const runner of runners) {
	describe(`apply_patch scenarios: ${runner.name}`, () => {
		for (const scenarioName of scenarioNames) {
			test(scenarioName, async () => {
				const scenarioDir = join(scenariosDir, scenarioName)
				const inputDir = join(scenarioDir, "input")
				const expectedDir = join(scenarioDir, "expected")
				const patch = await readFile(join(scenarioDir, "patch.txt"), "utf8")

				await withTempDir(async cwd => {
					await copyDirContents(inputDir, cwd)
					await runner.run(cwd, patch)

					const actual = await snapshotDir(cwd)
					const expected = await snapshotDir(expectedDir)
					expect([...actual.entries()]).toEqual([...expected.entries()])
				})
			})
		}
	})
}
