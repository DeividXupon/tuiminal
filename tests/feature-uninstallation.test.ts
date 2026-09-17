import { afterEach, expect, spyOn, test } from "bun:test"
import { mkdtemp, readFile, readdir, rename, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { FeatureController } from "../apps/cli/src/features/controller"
import { FeatureStore } from "../apps/cli/src/features/store"
import { featureFixture } from "./fixtures/feature-payload"

const cleanup: Array<() => void | Promise<void>> = []
afterEach(async () => {
  for (const dispose of cleanup.splice(0).reverse()) await dispose()
})
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "tuiminal-uninstall-"))
  cleanup.push(() => rm(root, { recursive: true, force: true }))
  const store = new FeatureStore(join(root, "features"))
  const { catalog, contents } = featureFixture()
  for (const artifact of catalog.artifacts.slice(1, 3))
    await store.publish(artifact, contents.get(artifact.id)!, new AbortController().signal)
  const controller = new FeatureController({
    source: false,
    environment: async () => ({
      store,
      catalog,
      baseUrl: new URL("https://example.com/"),
      allowLocalFiles: false,
    }),
    load: async () => {},
  })
  cleanup.push(() => controller.dispose())
  await controller.initialize("git", true)
  return { root, store, controller, artifact: catalog.artifacts[1]!, contents }
}

test("uninstall removes only the selected payload and supports a verified reinstall", async () => {
  const { root, store, artifact, contents } = await fixture()
  const otherVersion = { ...artifact, version: "1.2.4" }
  await store.publish(otherVersion, contents.get("git")!, new AbortController().signal)
  await writeFile(join(root, "settings.json"), "user settings")
  await store.remove(artifact)
  expect(await store.installed(artifact)).toBe(false)
  expect(await store.installed(otherVersion)).toBe(true)
  expect(
    (await readdir(join(store.directory, artifact.version))).every((name) =>
      name.startsWith("runner-"),
    ),
  ).toBe(true)
  expect(await readFile(join(root, "settings.json"), "utf8")).toBe("user settings")
  await store.remove(artifact)
  await store.publish(artifact, contents.get("git")!, new AbortController().signal)
  expect(await store.installed(artifact)).toBe(true)
  await expect(
    store.remove({ ...artifact, id: "../outside" as typeof artifact.id }),
  ).rejects.toThrow("identity")
})

test.skipIf(process.platform === "win32")(
  "uninstall rejects redirected storage and preserves symlink targets",
  async () => {
    const { root, store, artifact } = await fixture()
    const version = join(store.directory, artifact.version)
    const outside = join(root, "outside")
    await rename(version, outside)
    await symlink(outside, version)
    await expect(store.remove(artifact)).rejects.toThrow("directory")
    expect(await readdir(outside)).toHaveLength(2)
    await rm(version)
    await rename(outside, version)
    const folder = join(version, `${artifact.id}-${artifact.sha256}`)
    const target = join(root, "project-file")
    await writeFile(target, "keep this file")
    await rm(join(folder, "index.mjs"))
    await symlink(target, join(folder, "index.mjs"))
    await store.remove(artifact)
    expect(await readFile(target, "utf8")).toBe("keep this file")
  },
)

test("uninstall closes the tool before removal and rejects duplicate or competing operations", async () => {
  const { store, controller, artifact } = await fixture()
  const removal = spyOn(store, "remove")
  cleanup.push(() => removal.mockRestore())
  let finish = () => {}
  let retirements = 0
  const pending = controller.uninstall("git", () => {
    retirements++
    return new Promise<void>((resolve) => {
      finish = resolve
    })
  })
  expect(controller.snapshot().removing).toBe("git")
  await controller.uninstall("git", async () => {
    retirements++
  })
  expect(await controller.open("runner")).toBe(false)
  await controller.install(["database"])
  expect(retirements).toBe(1)
  expect(removal).not.toHaveBeenCalled()
  expect(await store.installed(artifact)).toBe(true)
  finish()
  expect(await pending).toBe(true)
  expect(removal).toHaveBeenCalledTimes(1)
  expect(controller.snapshot()).toMatchObject({
    installed: ["runner"],
    busy: null,
    removing: null,
    error: "",
  })
  expect(await store.installed(artifact)).toBe(false)
  await controller.uninstall("runner", async () => {})
  expect(controller.snapshot().installed).toEqual([])
})

test("failed retirement keeps the payload and allows an explicit retry", async () => {
  const { store, controller, artifact } = await fixture()
  expect(
    await controller.uninstall("git", async () => {
      throw new Error("close failed")
    }),
  ).toBe(false)
  expect(controller.snapshot().installed).toContain("git")
  expect(controller.snapshot().error).toContain("desinstalar")
  expect(await store.installed(artifact)).toBe(true)
  expect(await controller.uninstall("git", async () => {})).toBe(true)
})

test("a storage failure is reported without claiming the tool was uninstalled", async () => {
  const { store, controller, artifact } = await fixture()
  const removal = spyOn(store, "remove").mockRejectedValue(new Error("permission denied"))
  cleanup.push(() => removal.mockRestore())
  expect(await controller.uninstall("git", async () => {})).toBe(false)
  expect(controller.snapshot()).toMatchObject({
    installed: ["git", "runner"],
    busy: null,
    removing: null,
  })
  expect(controller.snapshot().error).toContain("desinstalar")
  expect(await store.installed(artifact)).toBe(true)
})

test("closing the app during retirement cannot start a later removal", async () => {
  const { store, controller, artifact } = await fixture()
  let finish = () => {}
  const pending = controller.uninstall(
    "git",
    () =>
      new Promise<void>((resolve) => {
        finish = resolve
      }),
  )
  controller.dispose()
  finish()
  expect(await pending).toBe(false)
  expect(await store.installed(artifact)).toBe(true)
})

test("a partial filesystem failure invalidates the damaged tool and keeps an error visible", async () => {
  const { store, controller, artifact } = await fixture()
  const removal = spyOn(store, "remove").mockImplementation(async () => {
    await rm(
      join(store.directory, artifact.version, `${artifact.id}-${artifact.sha256}`, "index.mjs"),
    )
    throw new Error("disk error")
  })
  cleanup.push(() => removal.mockRestore())
  expect(await controller.uninstall("git", async () => {})).toBe(false)
  expect(controller.snapshot().installed).toEqual(["runner"])
  expect(controller.snapshot().error).toContain("desinstalar")
  expect(await store.installed(artifact)).toBe(false)
})
