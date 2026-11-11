import { afterEach, expect, test } from "bun:test"
import { mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { LANGUAGE_OPTIONS, translateUi } from "../packages/core/src/i18n"
import { TERMINAL_FILES_MESSAGES } from "../packages/core/src/i18n/terminal-files-catalog"
import russian from "../packages/core/src/i18n/ru.json"
import {
  agentFilePrompt,
  droppedAgentPaths,
} from "../packages/feature-terminal/src/model/agent-file-drop"
import { inspectAgentFileDrop } from "../packages/feature-terminal/src/services/agent-file-drop"
import {
  REMOTE_AGENT_FILES_ROOT,
  uploadRemoteAgentFile,
} from "../packages/feature-terminal/src/services/remote-agent-upload"

const roots: string[] = []
const profile = { id: "fixture", name: "Fixture VPS", host: "fixture-vps" }
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})
async function fixture(name = "arquivo ' [1] $(touch SHOULD_NOT_EXIST).bin") {
  const root = await mkdtemp(join(tmpdir(), "tuiminal-agent-files-"))
  roots.push(root)
  const path = join(root, name)
  const content = Buffer.from([0, 1, 255, 27, 13, 10, 99])
  await writeFile(path, content)
  const file = (await inspectAgentFileDrop(path))?.[0]
  if (!file) throw new Error("Missing file fixture")
  const destination = join(root, "remote")
  const command = (script: string) => [
    "/bin/sh",
    "-c",
    script.replaceAll(REMOTE_AGENT_FILES_ROOT, destination),
  ]
  return { root, path, file, content, destination, command }
}

test("upload controls are localized in every supported language", () => {
  for (const message of TERMINAL_FILES_MESSAGES) {
    for (const [index, language] of LANGUAGE_OPTIONS.entries()) {
      const expected =
        language.id === "ru" ? russian[message[1] as keyof typeof russian] : message[index]
      expect(expected).toBeDefined()
      if (expected === undefined) throw new Error(`Missing translation: ${language.id}`)
      expect(translateUi(message[0], language.id)).toBe(expected)
    }
  }
})

test("file drops parse paths without executing shell syntax or mistaking prompt text and image markers for files", () => {
  expect(droppedAgentPaths("'/tmp/a b.png' /tmp/c\\ d.txt")).toEqual([
    "/tmp/a b.png",
    "/tmp/c d.txt",
  ])
  expect(droppedAgentPaths('"C:\\Users\\me\\a b.png"', true)).toEqual(["C:\\Users\\me\\a b.png"])
  for (const text of [
    "[Image #1]",
    "[Image #2] [Image #3]",
    "read /tmp/a",
    "'/tmp/a",
    "/tmp/a\u001b[31m",
  ])
    expect(droppedAgentPaths(text)).toBeNull()
  expect(agentFilePrompt(["/tmp/a b.txt", "/tmp/a.bin"])).toBe(' "/tmp/a b.txt" /tmp/a.bin ')
})

test("inspects existing regular files and file URLs, rejects directories and mixed prompt text", async () => {
  const item = await fixture()
  expect((await inspectAgentFileDrop(pathToFileURL(item.path).href))?.[0]?.path).toBe(item.path)
  expect(await inspectAgentFileDrop(item.root)).toBeNull()
  expect(await inspectAgentFileDrop(`${item.path}\nplease read it`)).toBeNull()
  const other = join(item.root, "outro.txt")
  await writeFile(other, "synthetic")
  expect((await inspectAgentFileDrop(`${pathToFileURL(item.path).href}\n${other}`))?.length).toBe(2)
})

test.skipIf(process.platform !== "linux")(
  "streams exact binary bytes to unique private remote paths without interpreting filenames",
  async () => {
    const item = await fixture()
    const signal = new AbortController().signal
    const progress: number[] = []
    const first = await uploadRemoteAgentFile(profile, item.file, signal, {
      command: item.command,
      onProgress: (bytes) => {
        progress.push(bytes)
      },
    })
    expect(progress.at(-1)).toBe(item.file.size)
    const second = await uploadRemoteAgentFile(profile, item.file, signal, {
      command: item.command,
    })
    expect(first).toStartWith(`${REMOTE_AGENT_FILES_ROOT}/`)
    expect(first).not.toBe(second)
    const actual = first.replace(REMOTE_AGENT_FILES_ROOT, item.destination)
    expect(await readFile(actual)).toEqual(item.content)
    expect((await stat(actual)).mode & 0o777).toBe(0o600)
    expect((await stat(item.destination)).mode & 0o777).toBe(0o700)
    expect((await readdir(item.root)).sort()).toEqual([item.file.name, "remote"].sort())
  },
)

test.skipIf(process.platform === "win32")(
  "fails before SSH when a reviewed file changed",
  async () => {
    const item = await fixture()
    await writeFile(item.path, "changed data")
    let started = false
    await expect(
      uploadRemoteAgentFile(profile, item.file, new AbortController().signal, {
        command: (script) => {
          started = true
          return item.command(script)
        },
      }),
    ).rejects.toThrow("arquivo local mudou")
    expect(started).toBe(false)
  },
)

test.skipIf(process.platform !== "linux")(
  "rejects failed or unverified uploads and removes incomplete owned directories",
  async () => {
    const item = await fixture()
    await expect(
      uploadRemoteAgentFile(profile, item.file, new AbortController().signal, {
        command: (script) => item.command(script.replace("cat >", "false; cat >")),
      }),
    ).rejects.toThrow("enviar o arquivo")
    expect(await readdir(item.destination)).toEqual([])
    await expect(
      uploadRemoteAgentFile(profile, item.file, new AbortController().signal, {
        command: () => ["/bin/sh", "-c", "cat >/dev/null; printf 'TUIMINAL_UPLOAD_OK wrong\\n'"],
      }),
    ).rejects.toThrow("enviar o arquivo")
  },
)

test.skipIf(process.platform === "win32")(
  "aborts owned transfer children and bounds stalled uploads",
  async () => {
    const item = await fixture()
    const command = () => [process.execPath, "-e", "setInterval(() => {}, 1000)"]
    await expect(
      uploadRemoteAgentFile(profile, item.file, new AbortController().signal, {
        command,
        timeoutMs: 50,
      }),
    ).rejects.toThrow("tempo limite")
    const controller = new AbortController()
    controller.abort(new Error("fixture cancelled"))
    await expect(
      uploadRemoteAgentFile(profile, item.file, controller.signal, { command }),
    ).rejects.toThrow("fixture cancelled")
  },
)
