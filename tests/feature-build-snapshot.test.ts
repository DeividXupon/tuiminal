import { afterEach, expect, test } from "bun:test"
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { localFeatureCatalog } from "../apps/cli/src/features/catalog-snapshot"
import { FeatureController } from "../apps/cli/src/features/controller"
import { decodeFeaturePayload } from "../apps/cli/src/features/download"
import { importVerifiedFeature } from "../apps/cli/src/features/loader"
import type { FeatureArtifact } from "../apps/cli/src/features/model"
import { FeatureStore } from "../apps/cli/src/features/store"
import { publishFeatureBuild } from "../scripts/publish-feature-build"
import { featureFixture } from "./fixtures/feature-payload"

const cleanup: Array<() => void | Promise<void>> = []
afterEach(async () => {
  for (const dispose of cleanup.splice(0).reverse()) await dispose()
})

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "tuiminal-feature-build-"))
  cleanup.push(() => rm(root, { recursive: true, force: true }))
  return { root, store: new FeatureStore(join(root, "installed")) }
}

test("an open installer can install, activate and reinstall its snapshot after a rebuild", async () => {
  const { root, store } = await fixture()
  const original = featureFixture()
  const rebuilt = featureFixture("1.2.3", "rebuilt")
  publishFeatureBuild(root, original.catalog, original.archives)
  const environment = async () => ({
    ...(await localFeatureCatalog(root, "1.2.3")),
    store,
    allowLocalFiles: true,
  })
  const loaded: string[] = []
  const load = async (_id: string, artifact?: FeatureArtifact) => {
    // Activation must receive the same artifact that the controller installed.
    expect(artifact).toBeDefined()
    const files = await store.read(artifact!)
    const module = await importVerifiedFeature(files.get("index.mjs")!)
    loaded.push(module.identity as string)
  }
  const controller = new FeatureController({ source: false, environment, load })
  cleanup.push(() => controller.dispose())
  await controller.initialize()
  await controller.install(["runner"])
  expect(await controller.open("runner")).toBe(true)

  publishFeatureBuild(root, rebuilt.catalog, rebuilt.archives)
  await controller.install(["git", "http"])
  expect(controller.snapshot()).toMatchObject({
    installed: ["runner", "git", "http"],
    error: "",
    busy: null,
    progress: null,
  })
  expect(await controller.open("git")).toBe(true)
  expect(await controller.open("http")).toBe(true)
  expect(loaded).toEqual([
    "1.2.3/runner/index.mjs/✓",
    "1.2.3/git/index.mjs/✓",
    "1.2.3/http/index.mjs/✓",
  ])
  expect(await controller.uninstall("git", async () => {})).toBe(true)
  await controller.install(["git"])
  expect(controller.snapshot().error).toBe("")
  expect(await controller.open("git")).toBe(true)

  const fresh = new FeatureController({ source: false, environment, load })
  cleanup.push(() => fresh.dispose())
  await fresh.initialize()
  expect(fresh.snapshot().installed).toEqual([])
  await fresh.install(["git"])
  expect(await fresh.open("git")).toBe(true)
  expect(loaded.at(-1)).toBe("1.2.3/git/index.mjs/✓rebuilt")
  expect(await store.installed(original.catalog.artifacts[1]!)).toBe(true)
  expect(await store.installed(rebuilt.catalog.artifacts[1]!)).toBe(true)
})

test("repeated builds retain complete snapshots and the canonical release layout", async () => {
  const { root } = await fixture()
  const { catalog, archives } = featureFixture()
  publishFeatureBuild(root, catalog, archives)
  publishFeatureBuild(root, catalog, archives)
  expect(await readdir(join(root, "snapshots"))).toHaveLength(1)
  expect(
    (await readdir(root)).some((name) => name.startsWith(".build-") || name.endsWith(".tmp")),
  ).toBe(false)
  const local = await localFeatureCatalog(root, catalog.version)
  expect(local.catalog).toEqual(catalog)
  expect(fileURLToPath(local.baseUrl)).toContain("snapshots")
  for (const artifact of catalog.artifacts) {
    const archive = await readFile(join(root, artifact.filename))
    expect(decodeFeaturePayload(archive, artifact).size).toBe(artifact.files.length)
    expect(await readFile(new URL(artifact.filename, local.baseUrl))).toEqual(archive)
  }
})

test("a failed build leaves the previously published catalog and archives usable", async () => {
  const { root } = await fixture()
  const original = featureFixture()
  const invalid = featureFixture("1.2.3", "invalid")
  publishFeatureBuild(root, original.catalog, original.archives)
  invalid.archives.set(invalid.catalog.artifacts[1]!.filename, Buffer.from("broken"))
  expect(() => publishFeatureBuild(root, invalid.catalog, invalid.archives)).toThrow("checksum")
  expect((await localFeatureCatalog(root, "1.2.3")).catalog).toEqual(original.catalog)
  for (const artifact of original.catalog.artifacts)
    expect(
      (await readFile(join(root, artifact.filename))).equals(
        original.archives.get(artifact.filename)!,
      ),
    ).toBe(true)
})

test("snapshot verification still rejects corrupt payloads and allows an explicit retry", async () => {
  const { root, store } = await fixture()
  const original = featureFixture()
  publishFeatureBuild(root, original.catalog, original.archives)
  const local = await localFeatureCatalog(root, "1.2.3")
  const artifact = original.catalog.artifacts[1]!
  const path = new URL(artifact.filename, local.baseUrl)
  await writeFile(path, "corrupt")
  const controller = new FeatureController({
    source: false,
    environment: async () => ({ ...local, store, allowLocalFiles: true }),
    load: async () => {},
  })
  cleanup.push(() => controller.dispose())
  await controller.install(["git"])
  expect(controller.snapshot().error).toBe(
    "A ferramenta falhou na verificação. Instale-a novamente.",
  )
  expect(controller.snapshot().installed).toEqual([])
  await writeFile(path, original.archives.get(artifact.filename)!)
  await controller.install(["git"])
  expect(controller.snapshot()).toMatchObject({ error: "", installed: ["git"] })
})

test("legacy flat builds remain readable", async () => {
  const { root } = await fixture()
  const { catalog } = featureFixture()
  await writeFile(join(root, "catalog.json"), JSON.stringify(catalog))
  const local = await localFeatureCatalog(root, catalog.version)
  expect(fileURLToPath(local.baseUrl)).toBe(`${root}/`)
})
