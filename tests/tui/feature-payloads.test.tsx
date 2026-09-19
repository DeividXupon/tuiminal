import "./setup"
import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { act } from "react"
import { testRender } from "@opentui/react/test-utils"
import type { TestRendererSetup } from "@opentui/core/testing"
import { buildFeaturePayloads } from "../../scripts/build-features"
import { decodeFeaturePayload } from "../../apps/cli/src/features/download"
import { prepareFeatureHost } from "../../apps/cli/src/features/host-modules"
import { importVerifiedFeature } from "../../apps/cli/src/features/loader"
import type { FeatureId } from "../../apps/cli/src/features/model"
import type { FeatureModules } from "../../apps/cli/src/features/registry"
import { FeatureStore } from "../../apps/cli/src/features/store"
import { RUNNER_SETTINGS_PATH } from "../../packages/feature-runner/src/storage/runner-settings"
import { FEATURE_HOST_KEY } from "../../packages/core/src/runtime/feature-host"

const hostRegistry = globalThis as typeof globalThis & Record<string, unknown>
const previousHost = hostRegistry[FEATURE_HOST_KEY]
let root: string
let build: Awaited<ReturnType<typeof buildFeaturePayloads>>
let tui: TestRendererSetup | undefined
let runner: FeatureModules["runner"] | undefined
let settings: Buffer | undefined

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "tuiminal-payload-tui-"))
  build = await buildFeaturePayloads(join(root, "payloads"))
  prepareFeatureHost(build.catalog.version, () => [process.execPath, "--internal-sqlite-worker"])
}, 30_000)

beforeEach(async () => {
  settings = await readFile(RUNNER_SETTINGS_PATH).catch((error) => {
    if (error.code !== "ENOENT") throw error
    return undefined
  })
})

afterEach(async () => {
  await act(async () => tui?.renderer.destroy())
  tui = undefined
  await runner?.stopAllRunnerProcesses()
  if (settings) await writeFile(RUNNER_SETTINGS_PATH, settings)
  else await rm(RUNNER_SETTINGS_PATH, { force: true })
  settings = undefined
})

afterAll(async () => {
  if (previousHost === undefined) delete hostRegistry[FEATURE_HOST_KEY]
  else hostRegistry[FEATURE_HOST_KEY] = previousHost
  if (root) await rm(root, { recursive: true, force: true })
})

async function loadPayload(id: FeatureId) {
  const artifact = build.catalog.artifacts.find((entry) => entry.id === id)!
  const files = decodeFeaturePayload(
    await readFile(join(build.destination, artifact.filename)),
    artifact,
  )
  const store = new FeatureStore(join(root, "installed"))
  await store.publish(artifact, files, new AbortController().signal)
  const verified = await store.read(artifact)
  return importVerifiedFeature(verified.get("index.mjs")!)
}

test.each([
  ["database", "DatabaseViewer"],
  ["git", "GitViewer"],
  ["runner", "Runner"],
  ["http", "HttpClient"],
  ["terminal", "FreeTerminal"],
] as const)("built %s payload imports using the real host modules", async (id, component) => {
  const module = await loadPayload(id)
  expect(typeof module[component]).toBe("function")
})

async function settle(until: () => boolean) {
  for (let attempt = 0; attempt < 150; attempt++) {
    await act(async () => Bun.sleep(10))
    await tui!.renderOnce()
    if (until()) return
  }
  throw new Error(`Built Runner did not settle:\n${tui!.captureCharFrame()}`)
}

async function key(name: string, ctrl = false) {
  await act(async () => {
    tui!.mockInput.pressKey(name, { ctrl })
    await Bun.sleep(20)
  })
  await tui!.renderOnce()
}

test("installed Runner opens its configuration and command editor with native input", async () => {
  runner = (await loadPayload("runner")) as FeatureModules["runner"]
  const { Runner } = runner
  tui = await testRender(<Runner active />, { width: 120, height: 38 })
  await settle(() => Boolean(tui!.renderer.root.findDescendantById("runner-configuration")))
  await key("y", true)
  await settle(() => tui!.renderer.currentFocusedRenderable?.id === "runner-config-yaml")
  expect(tui.captureCharFrame()).toContain("EDITOR YAML DO RUNNER")
  expect(tui.captureCharFrame()).not.toContain("Tutorial YAML")
  await key("F1")
  expect(tui.renderer.root.findDescendantById("runner-config-guide")).toBeUndefined()
  expect(tui.renderer.currentFocusedRenderable?.id).toBe("runner-config-yaml")
  await key("o", true)
  expect(tui.renderer.currentFocusedRenderable?.id).toBe("runner-config-yaml")
  await key("ESCAPE")
  if (tui.renderer.root.findDescendantById("runner-config-editor")) await key("ESCAPE")
  await settle(() => tui!.renderer.currentFocusedRenderable?.id === "runner-config-list")
  await key("n", true)
  await settle(() => tui!.renderer.currentFocusedRenderable?.id === "runner-config-yaml")
  expect(tui.renderer.root.findDescendantById("runner-config-editor")).toBeDefined()
  await key("ESCAPE")
  if (tui.renderer.root.findDescendantById("runner-config-editor")) await key("ESCAPE")
  await settle(() => tui!.renderer.currentFocusedRenderable?.id === "runner-config-list")
  await key("ESCAPE")
  await settle(() => !tui!.renderer.root.findDescendantById("runner-config-modal"))
})
