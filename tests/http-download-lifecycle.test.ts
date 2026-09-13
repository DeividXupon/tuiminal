import { afterEach, describe, expect, spyOn, test } from "bun:test"
import * as files from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createScratchRequest } from "../src/features/http/model/workspace"
import { downloadCompleteHttpResponse } from "../src/features/http/services/download"
import { prepareHttpRequest } from "../src/features/http/services/request-builder"

const cleanups: Array<() => void> = []
const roots: string[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup()
  for (const root of roots.splice(0)) await files.rm(root, { recursive: true, force: true })
})

async function fixture({ closed = false, cancelError = false } = {}) {
  const root = await files.mkdtemp(join(tmpdir(), "tuiminal-download-owner-"))
  roots.push(root)
  let cancellations = 0
  const body = new Uint8Array(Array.from({ length: 32 }, (_, index) => index))
  const response = new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(body)
        if (closed) controller.close()
      },
      cancel() {
        cancellations += 1
        if (cancelError) throw new Error("synthetic cleanup failure")
      },
    }),
    { headers: { "content-type": "application/octet-stream" } },
  )
  const fetcher = spyOn(globalThis, "fetch").mockResolvedValue(response)
  cleanups.push(() => fetcher.mockRestore())
  const controller = new AbortController()
  const request = prepareHttpRequest(
    createScratchRequest("download", "http://download.example.test/data"),
    "download-fixture",
    0,
  )
  return {
    root,
    body,
    response,
    controller,
    get cancellations() {
      return cancellations
    },
    run: () =>
      downloadCompleteHttpResponse({
        root,
        requestName: "Fixture",
        request,
        signal: controller.signal,
        now: new Date("2026-09-12T12:00:00Z"),
      }),
    outputFiles: () => files.readdir(join(root, "tuiminal-exports/http")),
  }
}

function interceptHandle(update: (handle: files.FileHandle) => void) {
  const original = files.open
  const opener = spyOn(files, "open").mockImplementation(async (path, flags, mode) => {
    const handle = await original(path, flags, mode)
    update(handle)
    return handle
  })
  cleanups.push(() => opener.mockRestore())
}

describe("complete HTTP download ownership", () => {
  test("a destination failure cancels the unread response", async () => {
    const h = await fixture()
    await files.mkdir(join(h.root, "tuiminal-exports"))
    await files.writeFile(join(h.root, "tuiminal-exports/http"), "not a directory")
    await expect(h.run()).rejects.toBeDefined()
    expect(h.cancellations).toBe(1)
    expect(h.response.body?.locked).toBe(false)
  })

  test("a write failure cancels the stream and cleanup preserves the original error", async () => {
    const h = await fixture({ cancelError: true })
    const failure = new Error("synthetic disk failure")
    interceptHandle((handle) => {
      const writer = spyOn(handle, "write").mockRejectedValue(failure)
      cleanups.push(() => writer.mockRestore())
    })
    await expect(h.run()).rejects.toBe(failure)
    expect(h.cancellations).toBe(1)
    expect(h.response.body?.locked).toBe(false)
    expect(await h.outputFiles()).toEqual([])
  })

  test("short writes persist every byte before publishing a protected file", async () => {
    const h = await fixture({ closed: true })
    let writes = 0
    interceptHandle((handle) => {
      const original = handle.write.bind(handle)
      handle.write = (async (buffer: Uint8Array, offset = 0, length = buffer.length - offset) => {
        writes += 1
        return original(buffer, offset, Math.min(3, length))
      }) as typeof handle.write
    })
    const result = await h.run()
    expect(result.bytes).toBe(h.body.length)
    expect(new Uint8Array(await files.readFile(result.path))).toEqual(h.body)
    expect(writes).toBeGreaterThan(1)
    expect((await files.stat(result.path)).mode & 0o777).toBe(0o600)
    expect(h.response.body?.locked).toBe(false)
    expect(await h.outputFiles()).toHaveLength(1)
  })

  test("a zero-byte write fails instead of publishing an incomplete download", async () => {
    const h = await fixture({ closed: true })
    interceptHandle((handle) => {
      handle.write = (async (buffer: Uint8Array) => ({
        bytesWritten: 0,
        buffer,
      })) as typeof handle.write
    })
    await expect(h.run()).rejects.toThrow("Não foi possível gravar o download completo.")
    expect(await h.outputFiles()).toEqual([])
    expect(h.response.body?.locked).toBe(false)
  })

  test("cancellation during file synchronization cannot publish the completed body", async () => {
    const h = await fixture({ closed: true })
    const failure = new Error("synthetic cancellation")
    interceptHandle((handle) => {
      const original = handle.sync.bind(handle)
      handle.sync = async () => {
        await original()
        h.controller.abort(failure)
      }
    })
    await expect(h.run()).rejects.toBe(failure)
    expect(await h.outputFiles()).toEqual([])
    expect(h.response.body?.locked).toBe(false)
  })

  test("success releases the response lock without leaving the temporary file", async () => {
    const h = await fixture({ closed: true })
    const result = await h.run()
    expect(new Uint8Array(await files.readFile(result.path))).toEqual(h.body)
    expect(h.response.body?.locked).toBe(false)
    expect(h.cancellations).toBe(0)
    expect(await h.outputFiles()).toHaveLength(1)
  })
})
