import { afterEach, expect, spyOn, test } from "bun:test"
import * as fs from "node:fs"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import {
  scanHttpProject,
  watchHttpProject,
} from "../packages/feature-http/src/storage/collection-scan"

let root: string | undefined
let stop: (() => void) | undefined
let quietWatch: ReturnType<typeof spyOn<typeof fs, "watch">> | undefined

afterEach(async () => {
  stop?.()
  stop = undefined
  quietWatch?.mockRestore()
  quietWatch = undefined
  if (root) await rm(root, { recursive: true, force: true })
  root = undefined
})

async function fixture() {
  root = await mkdtemp(join(tmpdir(), "tuiminal-watch-startup-"))
  // The native registration may return before it starts delivering events.
  // Keep real file discovery; suppress only that initial notification source.
  quietWatch = spyOn(fs, "watch").mockImplementation((() => ({
    close() {},
  })) as unknown as typeof fs.watch)
  return root
}

test("refreshes files created during the native watcher attachment gap", async () => {
  const project = await fixture()
  let changes = 0
  stop = await watchHttpProject(project, () => changes++)
  await writeFile(join(project, "during-startup.http"), "GET https://example.test/startup\n")
  const deadline = performance.now() + 2000
  while (!changes && performance.now() < deadline) await Bun.sleep(10)
  expect(changes).toBe(1)
  expect((await scanHttpProject(project)).files.map((file) => file.path)).toEqual([
    "during-startup.http",
  ])
})

test("closing the watcher cancels its startup refresh", async () => {
  const project = await fixture()
  let changes = 0
  stop = await watchHttpProject(project, () => changes++)
  stop()
  await Bun.sleep(120)
  expect(changes).toBe(0)
})
