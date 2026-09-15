import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { gzipSync } from "node:zlib"
import { featureFixture } from "./fixtures/feature-payload"
import { FeatureStore } from "../apps/cli/src/features/store"
import {
  decodeFeaturePayload,
  downloadFeature,
  featureDigest,
} from "../apps/cli/src/features/download"
import { parseFeatureCatalog, preferredInstalledFeature } from "../apps/cli/src/features/model"
import { FeatureController } from "../apps/cli/src/features/controller"
import { importVerifiedFeature } from "../apps/cli/src/features/loader"
import { FEATURE_MESSAGES } from "../packages/core/src/i18n/features-catalog"
import { translateUi } from "../packages/core/src/i18n/index"

const cleanup: Array<() => void | Promise<void>> = []
afterEach(async () => {
  for (const dispose of cleanup.splice(0).reverse()) await dispose()
})
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "tuiminal-features-"))
  cleanup.push(() => rm(root, { recursive: true, force: true }))
  return { ...featureFixture(), root, store: new FeatureStore(join(root, "data")) }
}
const signal = () => new AbortController().signal

describe("official feature installation", () => {
  test("trusts only an exact catalog with complete, bounded, flat payloads", () => {
    const { catalog } = featureFixture()
    expect(parseFeatureCatalog(catalog, "1.2.3")).toEqual(catalog)
    expect(() => parseFeatureCatalog(catalog, "1.2.4")).toThrow("catalog")
    for (const mutate of [
      (copy: typeof catalog) => {
        copy.artifacts[0]!.files[0]!.name = "../outside.mjs"
      },
      (copy: typeof catalog) => {
        copy.artifacts[0]!.size = 33 * 1024 * 1024
      },
      (copy: typeof catalog) => {
        copy.artifacts[0]!.files.pop()
      },
      (copy: typeof catalog) => {
        copy.artifacts[1] = copy.artifacts[0]!
      },
      (copy: typeof catalog) => {
        copy.artifacts[0]!.sha256 = "unchecked"
      },
    ]) {
      const copy = structuredClone(catalog)
      mutate(copy)
      expect(() => parseFeatureCatalog(copy, "1.2.3")).toThrow()
    }
    expect(preferredInstalledFeature([])).toBeNull()
    expect(preferredInstalledFeature(["git"])).toBe("git")
    expect(preferredInstalledFeature(["git", "runner"])).toBe("runner")
    expect(preferredInstalledFeature(["git", "runner"], "git")).toBe("git")
  })

  test("checks both downloaded archive and expanded file identities before publishing", () => {
    const { catalog, archives } = featureFixture()
    const artifact = catalog.artifacts[0]!
    const archive = archives.get(artifact.filename)!
    expect(decodeFeaturePayload(archive, artifact).size).toBe(4)
    expect(() => decodeFeaturePayload(archive.subarray(1), artifact)).toThrow("checksum")
    const invalid = gzipSync(
      JSON.stringify({
        schema: 1,
        id: artifact.id,
        version: artifact.version,
        files: { "index.mjs": "eA==", "../outside": "eA==" },
      }),
    )
    expect(() =>
      decodeFeaturePayload(invalid, {
        ...artifact,
        size: invalid.length,
        sha256: featureDigest(invalid),
      }),
    ).toThrow()
  })

  test("publishes atomically, survives concurrent installs, detects tampering, and repairs explicitly", async () => {
    const { store, catalog, contents, root } = await fixture()
    const artifact = catalog.artifacts[1]!
    expect(await store.installed(artifact)).toBe(false)
    await Promise.all(
      Array.from({ length: 4 }, () => store.publish(artifact, contents.get("git")!, signal())),
    )
    expect(await store.read(artifact)).toEqual(contents.get("git")!)
    const folder = join(store.directory, artifact.version, `${artifact.id}-${artifact.sha256}`)
    await writeFile(join(folder, "index.mjs"), "corrupted")
    expect(await store.installed(artifact)).toBe(false)
    await store.publish(artifact, contents.get("git")!, signal())
    expect(await store.installed(artifact)).toBe(true)
    expect(await readdir(join(store.directory, artifact.version))).toEqual([
      `${artifact.id}-${artifact.sha256}`,
    ])
    expect(await store.installed({ ...artifact, version: "1.2.4" })).toBe(false)
    expect(await readdir(root)).toEqual(["data"])
  })

  test.skipIf(process.platform === "win32")(
    "rejects symlinks and never modifies their targets",
    async () => {
      const { store, catalog, contents, root } = await fixture()
      const artifact = catalog.artifacts[1]!
      await store.publish(artifact, contents.get("git")!, signal())
      const entry = join(
        store.directory,
        artifact.version,
        `${artifact.id}-${artifact.sha256}`,
        "index.mjs",
      )
      const outside = join(root, "outside")
      await writeFile(outside, "user-owned")
      await rm(entry)
      await symlink(outside, entry)
      expect(await store.installed(artifact)).toBe(false)
      await store.publish(artifact, contents.get("git")!, signal())
      expect(await readFile(outside, "utf8")).toBe("user-owned")
      expect(await store.installed(artifact)).toBe(true)
    },
  )

  test("does not publish already-cancelled or unverified data", async () => {
    const { store, catalog, contents } = await fixture()
    const artifact = catalog.artifacts[1]!
    const controller = new AbortController()
    controller.abort()
    await expect(store.publish(artifact, contents.get("git")!, controller.signal)).rejects.toThrow()
    await expect(
      store.publish(artifact, new Map([["index.mjs", Buffer.from("bad")]]), signal()),
    ).rejects.toThrow("unverified")
    expect(await store.installed(artifact)).toBe(false)
    expect(await readdir(join(store.directory, artifact.version))).toEqual([])
  })

  test("downloads once, reports progress, and loads only on explicit activation", async () => {
    const { store, catalog, archives } = await fixture()
    let requests = 0
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch(request) {
        requests++
        return new Response(new Uint8Array(archives.get(new URL(request.url).pathname.slice(1))!))
      },
    })
    cleanup.push(() => {
      server.stop(true)
    })
    const loads: string[] = []
    const controller = new FeatureController({
      source: false,
      environment: async () => ({
        store,
        catalog,
        baseUrl: new URL(`http://127.0.0.1:${server.port}/`),
        allowLocalFiles: false,
      }),
      load: async (id) => {
        loads.push(id)
      },
    })
    cleanup.push(() => controller.dispose())
    await controller.initialize("git", true)
    expect(controller.snapshot().installed).toEqual([])
    expect(loads).toEqual([])
    const progress: number[] = []
    controller.subscribe(() => {
      if (controller.snapshot().progress) progress.push(controller.snapshot().progress!.received)
    })
    await Promise.all([controller.install(["git", "git"]), controller.install(["git"])])
    expect(requests).toBe(1)
    expect(loads).toEqual([])
    expect(controller.snapshot().installed).toEqual(["git"])
    expect(progress.some((received) => received > 0)).toBe(true)
    expect(await controller.open("git")).toBe(true)
    expect(loads).toEqual(["git"])
    await controller.install(["git"])
    expect(requests).toBe(1)
    const snapshot = await store.read(catalog.artifacts[1]!)
    const module = await importVerifiedFeature(snapshot.get("index.mjs")!)
    expect(module.identity).toBe("1.2.3/git/index.mjs/✓")
  })

  test("rejects a refused/oversized download and unsafe redirects", async () => {
    const { catalog, archives } = featureFixture()
    const artifact = catalog.artifacts[1]!
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch(request) {
        if (new URL(request.url).pathname === "/redirect")
          return Response.redirect("http://example.com/payload")
        return new Response(Buffer.concat([archives.get(artifact.filename)!, Buffer.from("extra")]))
      },
    })
    cleanup.push(() => {
      server.stop(true)
    })
    await expect(
      downloadFeature(artifact, new URL(`http://127.0.0.1:${server.port}/large`), {
        signal: signal(),
      }),
    ).rejects.toThrow("size")
    await expect(
      downloadFeature(artifact, new URL(`http://127.0.0.1:${server.port}/redirect`), {
        signal: signal(),
      }),
    ).rejects.toThrow("redirect")
    await expect(
      downloadFeature(artifact, new URL("http://example.com/payload"), { signal: signal() }),
    ).rejects.toThrow("HTTPS")
  })

  test("cancels a partial stream without installing or replaying it", async () => {
    const { catalog, store, archives } = await fixture()
    let requests = 0
    let closeStream: (() => void) | undefined
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch() {
        requests++
        return new Response(
          new ReadableStream({
            start(stream) {
              stream.enqueue(archives.get(catalog.artifacts[1]!.filename)!.subarray(0, 10))
              closeStream = () => {
                try {
                  stream.close()
                } catch {}
              }
            },
          }),
        )
      },
    })
    cleanup.push(() => {
      closeStream?.()
      server.stop(true)
    })
    const controller = new FeatureController({
      source: false,
      environment: async () => ({
        store,
        catalog,
        baseUrl: new URL(`http://127.0.0.1:${server.port}/`),
        allowLocalFiles: false,
      }),
      load: async () => {},
    })
    cleanup.push(() => controller.dispose())
    controller.subscribe(() => {
      if ((controller.snapshot().progress?.received ?? 0) > 0) controller.cancel()
    })
    await controller.install(["git"])
    expect(controller.snapshot().installed).toEqual([])
    expect(controller.snapshot().error).toBe("Instalação de ferramenta cancelada")
    expect(requests).toBe(1)
    expect(await store.installed(catalog.artifacts[1]!)).toBe(false)
  })

  test("every installer message is available in all six UI languages", () => {
    for (const message of FEATURE_MESSAGES) {
      for (const [index, language] of (
        ["pt-BR", "en", "es", "ja", "zh-CN", "ko"] as const
      ).entries()) {
        expect(translateUi(message[0], language)).toBe(message[index]!)
      }
    }
  })
})

test("isolated initialization does not load an installed sibling when its requested tool is missing", async () => {
  const { catalog, contents, store } = await fixture()
  await store.publish(catalog.artifacts[2]!, contents.get("runner")!, signal())
  const loads: string[] = []
  const controller = new FeatureController({
    source: false,
    environment: async () => ({
      store,
      catalog,
      baseUrl: new URL("https://example.com/"),
      allowLocalFiles: false,
    }),
    load: async (id) => {
      loads.push(id)
    },
  })
  cleanup.push(() => controller.dispose())
  await controller.initialize("git", true)
  expect(controller.snapshot().installed).toEqual(["runner"])
  expect(loads).toEqual([])
})

test("late activation cannot replace a newer selection or publish after disposal", async () => {
  const { catalog, contents, store } = await fixture()
  for (const artifact of catalog.artifacts.slice(1, 3))
    await store.publish(artifact, contents.get(artifact.id)!, signal())
  let release: () => void = () => {}
  const paused = new Promise<void>((resolve) => {
    release = resolve
  })
  const controller = new FeatureController({
    source: false,
    environment: async () => ({
      store,
      catalog,
      baseUrl: new URL("https://example.com/"),
      allowLocalFiles: false,
    }),
    load: async (id) => {
      if (id === "git") await paused
    },
  })
  cleanup.push(() => controller.dispose())
  await controller.initialize("runner")
  const old = controller.open("git")
  expect(await controller.open("runner")).toBe(true)
  release()
  expect(await old).toBe(false)
  expect(controller.snapshot().busy).toBeNull()
  let updates = 0
  controller.subscribe(() => updates++)
  controller.dispose()
  expect(await controller.open("git")).toBe(false)
  expect(updates).toBe(0)
})
