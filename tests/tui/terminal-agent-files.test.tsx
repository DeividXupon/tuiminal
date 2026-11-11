import "./setup"
import { afterEach, expect, spyOn, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act, useEffect, useRef, useState } from "react"
import { useTerminalWorkspaceKeyboard } from "../../packages/feature-terminal/src/hooks/use-terminal-workspace-keyboard"
import { TerminalActions } from "../../packages/feature-terminal/src/ui/TerminalActions"
import { useRemoteAgentFiles } from "../../packages/feature-terminal/src/hooks/use-remote-agent-files"
import { useTerminalSessions } from "../../packages/feature-terminal/src/hooks/use-terminal-sessions"
import * as integration from "../../packages/feature-terminal/src/services/integrated-agent-terminal"
import * as upload from "../../packages/feature-terminal/src/services/remote-agent-upload"
import {
  createCodexAgentCommand,
  createRemoteCodexAgentCommand,
} from "../../packages/feature-terminal/src/services/terminal"
import { RemoteAgentFilesDialog } from "../../packages/feature-terminal/src/ui/RemoteAgentFilesDialog"
import { TermAgentsPane } from "../../packages/feature-terminal/src/ui/TermAgentsPane"

let tui: TestRendererSetup | undefined
let api: ReturnType<typeof useTerminalSessions> | undefined
let flow: ReturnType<typeof useRemoteAgentFiles> | undefined
const roots: string[] = []
const spies: { mockRestore: () => void }[] = []
const writes: string[] = []
const remote = {
  profile: { id: "fixture", name: "Fixture VPS", host: "fixture-vps" },
  workingDirectory: "/synthetic",
}

afterEach(async () => {
  act(() => tui?.renderer.destroy())
  tui = undefined
  api = undefined
  flow = undefined
  for (const spy of spies.splice(0)) spy.mockRestore()
  writes.length = 0
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

function Harness({ local = false }: { local?: boolean }) {
  const terminal = useTerminalSessions(true, { width: 100, height: 30 })
  api = terminal
  const files = useRemoteAgentFiles(terminal, true)
  flow = files
  const leaderRef = useRef(false)
  const [leader, setLeaderState] = useState(false)
  const setLeader = (value: boolean) => {
    leaderRef.current = value
    setLeaderState(value)
  }
  const runAction = (key: string) => {
    setLeader(false)
    if (key === ".") files.open()
  }
  useTerminalWorkspaceKeyboard({
    leaderRef,
    setLeader,
    runAction,
    processHandles: terminal.processHandles,
    activeSessionRef: terminal.activeSessionRef,
    restoreFocus: () => terminal.focusTerminal(terminal.activeSessionId),
    rememberBoxFocusOrigin() {},
    masterKeyTargets: [],
    selectSession: terminal.activateSession,
    isBlocked: files.busy,
  })
  useEffect(() => {
    terminal.launchCommand(
      local ? createCodexAgentCommand() : createRemoteCodexAgentCommand(remote),
      {
        sectionId: "fixture",
        folderId: "terminal",
        row: 0,
        column: 0,
      },
    )
  }, [local, terminal.launchCommand])
  return (
    <box style={{ flexGrow: 1 }}>
      {terminal.sessions.map((session) => (
        <TermAgentsPane
          key={session.id}
          session={session}
          active
          visible
          toolActive
          appearanceKey="fixture"
          paletteSequence=""
          syncStatus={local ? undefined : { kind: "unmapped" }}
          onSendFiles={files.open}
          layout={{
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            borderTop: false,
            borderLeft: false,
          }}
          onActivate={terminal.activateSession}
          onReady={terminal.terminalReady}
          onGone={terminal.terminalGone}
          onInput={terminal.terminalInput}
          onResize={terminal.terminalResize}
        />
      ))}
      {leader && (
        <TerminalActions
          width={100}
          height={30}
          onAction={runAction}
          disabled={(key) => key === "." && !files.canOpen(terminal.activeSessionId)}
        />
      )}
      {files.state && (
        <RemoteAgentFilesDialog
          state={files.state}
          onConfirm={files.confirm}
          onClose={files.cancel}
          onAdd={files.add}
          onRemove={files.remove}
        />
      )}
    </box>
  )
}

async function settle(check: () => boolean) {
  for (let index = 0; index < 250; index++) {
    await act(async () => {
      await Bun.sleep(10)
      await tui?.renderOnce()
    })
    if (check()) return
  }
  throw new Error(`Timed out: ${tui?.captureCharFrame()}`)
}
function dialog() {
  return tui?.renderer.root.findDescendantById("terminal-agent-files-dialog")
}
function view() {
  const id = api?.activeSessionId
  return id ? api?.terminalRefs.current.get(id) : undefined
}
async function key(name: string, modifiers: { ctrl?: boolean } = {}) {
  await act(async () => {
    tui?.mockInput.pressKey(name, modifiers)
    await tui?.renderOnce()
  })
}
async function paste(text: string) {
  await act(async () => {
    tui?.mockInput.pasteBracketedText(text)
    await tui?.renderOnce()
  })
}
async function click(id: string) {
  const target = tui?.renderer.root.findDescendantById(id)
  if (!target) throw new Error(`Missing target: ${id}`)
  await act(async () => {
    await tui?.mockMouse.click(target.screenX + 1, target.screenY)
    await tui?.renderOnce()
  })
}
async function mount(local = false, width = 100, height = 30) {
  spies.push(
    spyOn(integration, "startIntegratedAgentTerminal").mockImplementation(
      async (_launch, options) => {
        options.onData(Buffer.from("\u001b[?2004h> draft "))
        return {
          pid: 987654,
          write(data) {
            const text = typeof data === "string" ? data : Buffer.from(data).toString()
            writes.push(text)
          },
          resize() {},
          async stop() {},
        }
      },
    ),
  )
  const send = spyOn(upload, "uploadRemoteAgentFile").mockImplementation(
    async (_profile, file) => `${upload.REMOTE_AGENT_FILES_ROOT}/fixture/${file.name}`,
  )
  spies.push(send)
  await act(async () => {
    tui = await testRender(<Harness local={local} />, { width, height, kittyKeyboard: true })
  })
  await settle(() => Boolean(view()?.focused && api?.sessions[0]?.status === "running"))
  const root = await mkdtemp(join(tmpdir(), "tuiminal-file-drop-tui-"))
  roots.push(root)
  const path = join(root, "arquivo [1].txt")
  await writeFile(path, "synthetic test data")
  return { send, path, root }
}

test.each([48, 100])(
  "asks before upload, inserts the remote path without Enter, and restores PTY focus at %s columns",
  async (width) => {
    const { path, send } = await mount(false, width)
    await paste(pathToFileURL(path).href)
    await settle(() => flow?.state?.phase === "confirm")
    expect(send).not.toHaveBeenCalled()
    expect(writes).toEqual([])
    expect(tui?.captureCharFrame()).toContain("Fixture VPS")
    expect(tui?.captureCharFrame()).toContain("/tmp/tuiminal-agents")
    await key("RETURN")
    await settle(() => !dialog() && Boolean(view()?.focused))
    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0]?.[0]).toEqual(remote.profile)
    expect(writes).toEqual([
      '\u001b[200~ "/tmp/tuiminal-agents/fixture/arquivo [1].txt" \u001b[201~',
    ])
    expect(view()?.screen().text).toContain("draft")
  },
)

test("Escape declines a raw file drop without forwarding Escape or uploading", async () => {
  const { path, send } = await mount()
  await act(async () => {
    tui?.renderer.stdin.emit("data", Buffer.from(pathToFileURL(path).href))
  })
  await settle(() => flow?.state?.phase === "confirm")
  await key("ESCAPE")
  await settle(() => !dialog() && Boolean(view()?.focused))
  expect(send).not.toHaveBeenCalled()
  expect(writes).toEqual([])
})

test("every image opens confirmation without first pasting a local path into the agent", async () => {
  const { root, send } = await mount()
  const image = join(root, "image.png")
  await writeFile(image, "synthetic image fixture")
  for (const number of [1, 2]) {
    view()?.write(`[Image #${number}]`)
    await paste(image)
    await settle(() => flow?.state?.phase === "confirm")
    expect(flow?.state?.files[0]?.path).toBe(image)
    expect(writes).toEqual([])
    await key("ESCAPE")
    await settle(() => !dialog() && Boolean(view()?.focused))
  }
  expect(send).not.toHaveBeenCalled()
})

test("an image upload inserts only its remote path and preserves existing draft text", async () => {
  const { root, send } = await mount()
  const image = join(root, "missing-native.png")
  await writeFile(image, "synthetic image fixture")
  await paste(image)
  await settle(() => flow?.state?.phase === "confirm")
  expect(send).not.toHaveBeenCalled()
  expect(writes).toEqual([])
  await key("RETURN")
  await settle(() => !dialog())
  expect(writes.at(-1)).toBe(
    "\u001b[200~ /tmp/tuiminal-agents/fixture/missing-native.png \u001b[201~",
  )
  expect(view()?.screen().text).toContain("draft")
})

test("ordinary paste, marker text, and local agents keep their original paste behavior", async () => {
  const { path, send } = await mount(true)
  for (const text of ["read this", "[Image #1] [Image #3]", path]) await paste(text)
  expect(writes).toEqual(
    ["read this", "[Image #1] [Image #3]", path].map((text) => `\u001b[200~${text}\u001b[201~`),
  )
  expect(dialog()).toBeUndefined()
  expect(send).not.toHaveBeenCalled()
})

test("cancellation aborts transfer and a late completion cannot write into a closed pane", async () => {
  const { path, send } = await mount()
  let finish: ((path: string) => void) | undefined
  let signal: AbortSignal | undefined
  send.mockImplementationOnce(async (_profile, _file, current) => {
    signal = current
    return new Promise<string>((resolve) => {
      finish = resolve
    })
  })
  await paste(path)
  await settle(() => flow?.state?.phase === "confirm")
  await key("RETURN")
  await settle(() => Boolean(signal))
  await act(async () => {
    if (api?.activeSessionId) api.closeSession(api.activeSessionId)
  })
  await settle(() => signal?.aborted === true && !dialog())
  await act(async () => finish?.("/tmp/tuiminal-agents/late/file.txt"))
  expect(writes).toEqual([])
})

test("multi-file failure retains only pending files for retry and never submits the prompt", async () => {
  const { path, root, send } = await mount()
  const other = join(root, "second.txt")
  await writeFile(other, "second synthetic file")
  send
    .mockResolvedValueOnce("/tmp/tuiminal-agents/first/file.txt")
    .mockRejectedValueOnce(new Error("Não foi possível enviar o arquivo ao servidor."))
  await paste(`${pathToFileURL(path).href}\n${other}`)
  await settle(() => flow?.state?.phase === "confirm")
  await key("RETURN")
  await settle(() => tui?.captureCharFrame().includes("Não foi possível enviar") ?? false)
  expect(writes).toHaveLength(1)
  await key("RETURN")
  await settle(() => !dialog())
  expect(send).toHaveBeenCalledTimes(3)
  expect(send.mock.calls[2]?.[1]?.path).toBe(other)
  expect(writes).toHaveLength(2)
  expect(writes.every((data) => !data.includes("\r") && !data.includes("\n"))).toBe(true)
})

test.each([48, 100])(
  "header upload tag precedes sync and opens an empty dialog by mouse at %s columns",
  async (width) => {
    const { send } = await mount(false, width)
    const id = api?.activeSessionId
    const tag = tui?.renderer.root.findDescendantById(`terminal-context-upload-${id}`)
    const sync = tui?.renderer.root.findDescendantById(`terminal-context-sync-${id}`)
    expect(tag).toBeDefined()
    expect(sync).toBeDefined()
    if (!tag || !sync) throw new Error("Missing header actions")
    expect(tag.screenX + tag.width).toBeLessThan(sync.screenX)
    if (width === 100) expect(tui?.captureCharFrame()).toContain("Enviar arquivos [Ctrl+B] > [.]")
    await click(`terminal-context-upload-${id}`)
    await settle(() => Boolean(dialog()?.focused))
    expect(tui?.captureCharFrame()).toContain("Solte arquivos aqui")
    expect(flow?.state?.files).toEqual([])
    await click("terminal-agent-files-send")
    expect(send).not.toHaveBeenCalled()
    await click("terminal-agent-files-cancel")
    await settle(() => !dialog() && Boolean(view()?.focused))
    expect(writes).toEqual([])
  },
)

test.each([16, 30])(
  "Master Key then dot opens upload; path entry, selection and removal work at %s rows",
  async (height) => {
    const { path, root, send } = await mount(false, 48, height)
    await key("b", { ctrl: true })
    await settle(() => Boolean(tui?.renderer.root.findDescendantById("terminal-actions")))
    await key(".")
    await settle(() => Boolean(dialog()?.focused))
    await key("a")
    await settle(() => tui?.renderer.currentFocusedRenderable?.id === "terminal-agent-files-path")
    const input = tui?.renderer.currentFocusedRenderable
    const modal = dialog()
    if (!input || !modal) throw new Error("Missing path entry")
    expect(input.screenY + input.height).toBeLessThan(modal.screenY + modal.height)
    expect(tui?.captureCharFrame()).toContain("[Esc] Cancelar")
    const footer = tui?.renderer.root.findDescendantById("terminal-agent-files-send")
    if (!footer) throw new Error("Missing upload action")
    expect(footer.screenY + footer.height).toBeLessThan(modal.screenY + modal.height)
    await paste(path)
    await key("RETURN")
    await settle(() => flow?.state?.phase === "confirm" && flow.state.files.length === 1)
    const other = join(root, "second.txt")
    await writeFile(other, "second synthetic file")
    await paste(other)
    await settle(() => flow?.state?.files.length === 2)
    await key("ARROW_DOWN")
    await key("DELETE")
    expect(flow?.state?.files.map((file) => file.path)).toEqual([path])
    await key("a")
    await key("ESCAPE")
    expect(dialog()?.focused).toBe(true)
    expect(send).not.toHaveBeenCalled()
    expect(writes).toEqual([])
    await click("terminal-agent-files-send")
    await settle(() => !dialog() && Boolean(view()?.focused))
    expect(send).toHaveBeenCalledTimes(1)
    expect(writes).toHaveLength(1)
  },
)

test("progress stays in the modal and Escape aborts without forwarding input", async () => {
  const { path, send } = await mount()
  let finish: ((path: string) => void) | undefined
  let signal: AbortSignal | undefined
  send.mockImplementationOnce(async (_profile, file, current, options) => {
    signal = current
    options?.onProgress?.(file.size / 2)
    return new Promise<string>((resolve) => {
      finish = resolve
    })
  })
  await paste(path)
  await settle(() => flow?.state?.phase === "confirm")
  await click("terminal-agent-files-send")
  await settle(() => tui?.captureCharFrame().includes("50%") ?? false)
  await key("ESCAPE")
  await settle(() => !dialog() && Boolean(view()?.focused))
  expect(signal?.aborted).toBe(true)
  await act(async () => finish?.("/tmp/tuiminal-agents/late/file.txt"))
  expect(writes).toEqual([])
})
