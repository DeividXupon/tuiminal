import { afterEach, expect, spyOn, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import * as fs from "node:fs/promises"
import { tmpdir } from "node:os"
import { delimiter, join, resolve } from "node:path"
import { discoverRunnerProjects } from "../src/features/runner/discovery/projects"

const readDirectory = fs.readdir
const previousRoots = process.env.TUIMINAL_PROJECT_ROOTS
const roots: string[] = []
let readSpy: ReturnType<typeof spyOn<typeof fs, "readdir">> | undefined

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "tuiminal-project-scan-"))
  roots.push(root)
  process.env.TUIMINAL_PROJECT_ROOTS = root
  return root
}

function repository(path: string) {
  mkdirSync(join(path, ".git"), { recursive: true })
  writeFileSync(join(path, ".git", "HEAD"), "ref: refs/heads/main\n")
}

afterEach(() => {
  readSpy?.mockRestore()
  readSpy = undefined
  if (previousRoots === undefined) delete process.env.TUIMINAL_PROJECT_ROOTS
  else process.env.TUIMINAL_PROJECT_ROOTS = previousRoots
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

test("project discovery uses bounded parallel reads after the initial root", async () => {
  const root = fixture()
  for (let index = 0; index < 40; index += 1) repository(join(root, `project-${index}`))
  let pending = 0
  let maximum = 0
  readSpy = spyOn(fs, "readdir").mockImplementation((async (
    ...args: Parameters<typeof fs.readdir>
  ) => {
    pending += 1
    maximum = Math.max(maximum, pending)
    try {
      await Bun.sleep(2)
      return await readDirectory(...args)
    } finally {
      pending -= 1
    }
  }) as typeof fs.readdir)
  const projects = await discoverRunnerProjects(root)
  expect(projects).toHaveLength(40)
  expect(maximum).toBeGreaterThan(1)
  expect(maximum).toBeLessThanOrEqual(16)
})

test("overlapping and equivalent roots scan each path once", async () => {
  const root = fixture()
  const child = join(root, "group")
  repository(join(child, "project"))
  process.env.TUIMINAL_PROJECT_ROOTS = [root, child, join(root, "group", "..")].join(delimiter)
  readSpy = spyOn(fs, "readdir")
  expect(await discoverRunnerProjects(child)).toHaveLength(1)
  const scanned = readSpy.mock.calls.map(([path]) => resolve(String(path)))
  expect(new Set(scanned).size).toBe(scanned.length)
})

test("discovery retains its depth, ignored-folder and project limits", async () => {
  const root = fixture()
  for (let index = 0; index < 320; index += 1) repository(join(root, `project-${index}`))
  repository(join(root, "node_modules", "hidden"))
  repository(join(root, ".cache", "hidden"))
  const projects = await discoverRunnerProjects(root)
  expect(projects).toHaveLength(300)
  expect(projects.some((project) => project.name === "hidden")).toBe(false)
  const nested = fixture()
  repository(join(nested, ...Array(7).fill("level")))
  repository(join(nested, ...Array(8).fill("deep")))
  expect(await discoverRunnerProjects(nested)).toHaveLength(1)
})
