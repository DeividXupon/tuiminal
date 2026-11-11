import { afterEach, expect, test } from "bun:test"
import { mkdtemp, open, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { createScratchRequest } from "../packages/feature-http/src/model/workspace"
import {
  HTTP_REQUEST_LIMITS,
  prepareHttpRequest,
} from "../packages/feature-http/src/services/request-builder"
import { executePreparedHttpRequest } from "../packages/feature-http/src/services/fetch-transport"
import { chooseHttpBodyFiles } from "../packages/feature-http/src/services/native-file-picker"
import { applyHttpFileSelection } from "../packages/feature-http/src/model/file-selection"
import {
  parseHttpFile,
  requestFromHttpFile,
  serializeHttpRequestBlock,
} from "../packages/feature-http/src/model/http-file"
import { pastedHttpBodyFiles } from "../packages/feature-http/src/services/body-file-drop"
import { resolveHttpBodyFiles } from "../packages/feature-http/src/services/body-file"
import { importPostmanCollection } from "../packages/feature-http/src/importing/postman"

const roots: string[] = []
let server: ReturnType<typeof Bun.serve> | undefined
afterEach(async () => {
  await server?.stop(true)
  server = undefined
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "tuiminal-body-file-"))
  roots.push(root)
  const path = join(root, "ação [1] (final).bin")
  const bytes = new Uint8Array([0, 255, 1, 254, 13, 10])
  await writeFile(path, bytes)
  return { root, path, bytes }
}

test("sends exact bytes from an external absolute file in raw and multipart bodies", async () => {
  const { root, path, bytes } = await fixture()
  const received: { bytes: Uint8Array; name?: string; contentType: string }[] = []
  server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const contentType = request.headers.get("content-type") ?? ""
      if (contentType.startsWith("multipart/")) {
        const part = (await request.formData()).get("upload")
        if (!(part instanceof File)) throw new Error("Missing uploaded file")
        received.push({
          bytes: new Uint8Array(await part.arrayBuffer()),
          name: part.name,
          contentType,
        })
      } else received.push({ bytes: new Uint8Array(await request.arrayBuffer()), contentType })
      return new Response("uploaded")
    },
  })
  const request = createScratchRequest("file", `http://127.0.0.1:${server.port}/upload`)
  request.method = "POST"
  request.body = { kind: "file", text: "", form: [], filePath: path }
  const prepared = prepareHttpRequest(request, "raw", 0, undefined, join(root, "unrelated-library"))
  expect((await executePreparedHttpRequest(prepared)).status).toBe(200)
  request.body = {
    kind: "multipart",
    text: "",
    form: [],
    multipart: [
      {
        id: "file",
        enabled: true,
        kind: "file",
        name: "upload",
        value: pathToFileURL(path).href,
        sensitivity: "normal",
      },
    ],
  }
  expect(
    (await executePreparedHttpRequest(prepareHttpRequest(request, "multipart", 0))).status,
  ).toBe(200)
  expect(received).toHaveLength(2)
  expect(received[0]?.bytes).toEqual(bytes)
  expect(received[0]?.contentType).toBe("application/octet-stream")
  expect(received[1]?.bytes).toEqual(bytes)
  expect(received[1]?.name).toBe("ação [1] (final).bin")
})

test("still rejects missing files, directories, and oversized bodies before transport", async () => {
  const { root, path } = await fixture()
  const request = createScratchRequest("file", "https://example.invalid/upload")
  request.method = "POST"
  for (const [filePath, error] of [
    [join(root, "missing.bin"), "não foi encontrado"],
    [root, "não aponta para um arquivo"],
    ["", "Selecione um arquivo"],
  ] as const) {
    request.body = { kind: "file", text: "", form: [], filePath }
    expect(() => prepareHttpRequest(request, "invalid", 0)).toThrow(error)
  }
  const file = await open(path, "r+")
  try {
    await file.truncate(HTTP_REQUEST_LIMITS.fileBytes + 1)
  } finally {
    await file.close()
  }
  request.body.filePath = path
  expect(() => prepareHttpRequest(request, "oversized", 0)).toThrow("256 MB")
})

test("selecting multiple files switches to multipart, preserves repeated keys and roundtrips before sending", async () => {
  const { root, path, bytes } = await fixture()
  const second = join(root, "another file.bin")
  await writeFile(second, "second file")
  const request = createScratchRequest("multi", "http://127.0.0.1")
  request.method = "POST"
  request.body.kind = "file"
  request.headers = [
    {
      id: "type",
      name: "Content-Type",
      value: "application/octet-stream",
      enabled: true,
      sensitivity: "normal",
    },
  ]
  const selected = applyHttpFileSelection(request, [path, second])
  Object.assign(request, selected)
  expect(selected.body.kind).toBe("multipart")
  expect(request.headers).toEqual([])
  const serialized = serializeHttpRequestBlock(request)
  const file = parseHttpFile(serialized, "multi.http")
  const block = file.requests[0]
  if (!block) throw new Error("Missing serialized multipart")
  const restored = requestFromHttpFile(file, block)
  expect(restored.body.multipart?.map((part) => [part.name, part.value])).toEqual([
    ["file", path],
    ["file", second],
  ])
  let received: File[] = []
  server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      received = (await request.formData()).getAll("file") as File[]
      return new Response("ok")
    },
  })
  restored.url = `http://127.0.0.1:${server.port}`
  expect(
    (await executePreparedHttpRequest(prepareHttpRequest(restored, "multiple", 0))).status,
  ).toBe(200)
  expect(received).toHaveLength(2)
  const first = received[0]
  if (!first) throw new Error("Missing first upload")
  expect(new Uint8Array(await first.arrayBuffer())).toEqual(bytes)
  expect(await received[1]?.text()).toBe("second file")
  const appended = applyHttpFileSelection(restored, [second])
  expect(appended.body.multipart).toHaveLength(3)
  expect(new Set(appended.body.multipart?.map((part) => part.id)).size).toBe(3)
})

test("parses multiple quoted, escaped and URI-list drops and validates the complete batch", async () => {
  const { root, path } = await fixture()
  const other = join(root, "second file.bin")
  await writeFile(other, "second")
  expect(pastedHttpBodyFiles(`'${path}' '${other}'`)).toEqual([path, other])
  const escaped = [path, other].map((value) => value.replace(/([ ()[\]])/g, "\\$1")).join(" ")
  expect(pastedHttpBodyFiles(escaped)).toEqual([path, other])
  expect(
    pastedHttpBodyFiles([path, other].map((value) => pathToFileURL(value).href).join("\r\n")),
  ).toEqual([path, other])
  expect(pastedHttpBodyFiles(path)).toEqual([path])
  expect(resolveHttpBodyFiles([path, other, path])).toEqual([path, other])
  expect(() => resolveHttpBodyFiles([path, root])).toThrow("não aponta para um arquivo")
})

test("imports all files from one Postman form-data field", () => {
  const report = importPostmanCollection({
    info: { name: "Files" },
    item: [
      {
        name: "Upload",
        request: {
          method: "POST",
          url: "https://example.invalid",
          body: {
            mode: "formdata",
            formdata: [{ key: "photos", type: "file", src: ["first.png", "second.png"] }],
          },
        },
      },
    ],
  })
  expect(report.requests[0]?.body.multipart?.map((part) => [part.name, part.value])).toEqual([
    ["photos", "first.png"],
    ["photos", "second.png"],
  ])
  expect(new Set(report.requests[0]?.body.multipart?.map((part) => part.id)).size).toBe(2)
})

function pickerCommand(source: string, json = false) {
  return { cmd: [process.execPath, "-e", source], json }
}

test("native chooser preserves multiple literal filenames and distinguishes cancel from failure", async () => {
  const { path } = await fixture()
  const signal = new AbortController().signal
  const paths = [path, `${path}.second`, `${path}\nline`]
  expect(
    await chooseHttpBodyFiles(
      signal,
      pickerCommand(`console.log(${JSON.stringify(JSON.stringify(paths))})`, true),
    ),
  ).toEqual(paths)
  expect(
    await chooseHttpBodyFiles(
      signal,
      pickerCommand(`console.log(${JSON.stringify(paths.slice(0, 2).join("\n"))})`),
    ),
  ).toEqual(paths.slice(0, 2))
  expect(await chooseHttpBodyFiles(signal, pickerCommand("process.exit(1)"))).toBeNull()
  await expect(
    chooseHttpBodyFiles(signal, pickerCommand("console.error('No display');process.exit(1)")),
  ).rejects.toThrow("Não foi possível abrir")
  await expect(
    chooseHttpBodyFiles(signal, { cmd: [join(roots[0] ?? "", "nonexistent-picker")], json: false }),
  ).rejects.toThrow("Não foi possível abrir")
})

test("cancels only the owned chooser process and ignores its late output", async () => {
  const controller = new AbortController()
  const pending = chooseHttpBodyFiles(
    controller.signal,
    pickerCommand("setTimeout(() => console.log('/fixture/late'), 30000)"),
  )
  controller.abort()
  expect(await pending).toBeNull()
  expect(await chooseHttpBodyFiles(controller.signal)).toBeNull()
})
