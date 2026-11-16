import "./setup"
import { afterEach, expect, mock, test } from "bun:test"
import type { InputRenderable } from "@opentui/core"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act, useEffect, useRef, useState } from "react"
import {
  getDefaultShortcuts,
  setToolShortcuts,
  validateShortcuts,
} from "../../packages/core/src/keyboard/bindings"
import { useConfiguredKeyboard, withShortcutContext } from "../../packages/core/src/keyboard/react"
import { AgentProviderPicker } from "../../packages/feature-terminal/src/ui/AgentProviderPicker"
import { useTerminalWorkspaceKeyboard } from "../../packages/feature-terminal/src/hooks/use-terminal-workspace-keyboard"
import type { TermAgentsProcessHandle } from "../../packages/feature-terminal/src/services/terminal"
import { TerminalActions } from "../../packages/feature-terminal/src/ui/TerminalActions"
import { RemoteAgentFilesDialog } from "../../packages/feature-terminal/src/ui/RemoteAgentFilesDialog"
import { AgentProjectPicker } from "../../packages/feature-terminal/src/ui/AgentProjectPicker"
import { TerminalDialog } from "../../packages/feature-terminal/src/ui/TerminalDialog"

let tui: TestRendererSetup | undefined

afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
  setToolShortcuts("terminal", getDefaultShortcuts("terminal"))
  setToolShortcuts("global", getDefaultShortcuts("global"))
})

async function key(name: string) {
  await act(async () => {
    tui?.mockInput.pressKey(name)
    if (name === "ESCAPE") await Bun.sleep(60)
  })
  await tui?.renderOnce()
}

test("Terminal picker remaps its own shortcuts and hints without activating old bindings", async () => {
  setToolShortcuts(
    "terminal",
    validateShortcuts("terminal", {
      "provider-picker": {
        Enter: "F6",
        Esc: "F7",
        Down: "F8",
      },
    }),
  )
  const select = mock(() => undefined)
  const close = mock(() => undefined)
  tui = await testRender(<AgentProviderPicker onSelect={select} onClose={close} />, {
    width: 90,
    height: 28,
  })
  await tui.renderOnce()
  expect(tui.captureCharFrame()).toContain("[F6]")
  expect(tui.captureCharFrame()).toContain("[F7]")
  await key("RETURN")
  await key("ESCAPE")
  expect(select).not.toHaveBeenCalled()
  expect(close).not.toHaveBeenCalled()
  await key("F8")
  await key("F6")
  expect(select).toHaveBeenCalledWith("claude")
  await key("F7")
  expect(close).toHaveBeenCalledTimes(1)
})

test("Terminal rename keeps literal text while configured native submit works", async () => {
  setToolShortcuts(
    "terminal",
    validateShortcuts("terminal", { dialog: { Enter: "F6", Esc: "F7" } }),
  )
  const save = mock(() => undefined)
  const close = mock(() => undefined)
  tui = await testRender(
    <TerminalDialog kind="rename" initialValue="" onSave={save} onClose={close} />,
    { width: 90, height: 28 },
  )
  await tui.renderOnce()
  const input = tui.renderer.root.findDescendantById("terminal-command-input") as InputRenderable
  await act(async () => tui?.mockInput.typeText("qmn"))
  expect(input.value).toBe("qmn")
  await key("RETURN")
  expect(save).not.toHaveBeenCalled()
  await key("F6")
  expect(save).toHaveBeenCalledWith("qmn")
  await key("F7")
  expect(close).toHaveBeenCalledTimes(1)
})

function LeaderHarness({ onAction }: { onAction: (key: string) => void }) {
  const [leader, setLeader] = useState(false)
  const leaderRef = useRef(leader)
  leaderRef.current = leader
  useTerminalWorkspaceKeyboard({
    leaderRef,
    processHandles: useRef(new Map<string, TermAgentsProcessHandle>()),
    activeSessionRef: useRef<string | null>(null),
    setLeader,
    restoreFocus: () => undefined,
    rememberBoxFocusOrigin: () => undefined,
    runAction: onAction,
    masterKeyTargets: [],
    selectSession: () => undefined,
    isBlocked: () => false,
  })
  return leader ? (
    <TerminalActions width={100} height={35} onAction={onAction} disabled={() => false} />
  ) : (
    <text content="Terminal input" />
  )
}

test("Terminal requires the Master Key before configured global actions and renders their hints", async () => {
  setToolShortcuts(
    "global",
    validateShortcuts("global", { workspace: { http: "F6", settings: "F7", quit: null } }),
  )
  const action = mock(() => undefined)
  tui = await testRender(<LeaderHarness onAction={action} />, { width: 100, height: 35 })
  await key("F6")
  expect(action).not.toHaveBeenCalled()
  await act(async () => tui?.mockInput.pressKey("b", { ctrl: true }))
  await tui.renderOnce()
  await key("q")
  await act(async () => tui?.mockInput.pressKey("4", { meta: true }))
  expect(action).not.toHaveBeenCalled()
  await key("F6")
  expect(action).toHaveBeenCalledWith("alt+4")
  await key("F7")
  expect(action).toHaveBeenCalledWith(",")
  const title = tui.renderer.root.findDescendantById("terminal-action-title-alt+4")
  expect(title).toBeDefined()
})

const OtherTerminalPanel = withShortcutContext(
  "terminal",
  "live-diff",
  function OtherTerminalPanel() {
    useConfiguredKeyboard(() => undefined)
    return <text content="Another mounted Terminal panel" />
  },
)

test("a mounted sibling panel cannot take the native input remapping from a focused modal", async () => {
  setToolShortcuts("terminal", validateShortcuts("terminal", { dialog: { Enter: "F6" } }))
  const save = mock(() => undefined)
  tui = await testRender(
    <>
      <OtherTerminalPanel />
      <TerminalDialog kind="rename" initialValue="name" onSave={save} onClose={() => undefined} />
    </>,
    { width: 90, height: 28 },
  )
  await tui.renderOnce()
  await key("RETURN")
  expect(save).not.toHaveBeenCalled()
  await key("F6")
  expect(save).toHaveBeenCalledWith("name")
})

test.each(["a", "Enter"])(
  "remote file input remaps submission when %s opens the field",
  async (addKey) => {
    setToolShortcuts(
      "terminal",
      validateShortcuts("terminal", { "remote-files": { Enter: "F6", a: addKey } }),
    )
    const add = mock(() => undefined)
    tui = await testRender(
      <RemoteAgentFilesDialog
        state={{
          profile: { id: "fixture", name: "Fixture", host: "fixture" },
          files: [],
          completed: [],
          phase: "confirm",
          transferred: 0,
        }}
        onAdd={add}
        onClose={() => undefined}
        onConfirm={() => undefined}
        onRemove={() => undefined}
      />,
      { width: 100, height: 30 },
    )
    await tui.renderOnce()
    await key(addKey === "Enter" ? "RETURN" : "a")
    await act(async () => tui?.mockInput.typeText("/tmp/example.txt"))
    await key("RETURN")
    expect(add).not.toHaveBeenCalled()
    await key("F6")
    expect(add).toHaveBeenCalledWith("/tmp/example.txt")
  },
)

test("project search honors configured modal keys without treating typed search as actions", async () => {
  setToolShortcuts(
    "terminal",
    validateShortcuts("terminal", { "agent-project-picker": { "/": "F6", Esc: "F7" } }),
  )
  const close = mock(() => undefined)
  tui = await testRender(
    <AgentProjectPicker
      providerId="codex"
      target={{ kind: "local" }}
      sessions={[]}
      inactive={false}
      environmentEnabled={false}
      onEnvironment={() => undefined}
      onLaunch={() => undefined}
      onCancelLaunch={() => undefined}
      onCompatibility={() => undefined}
      onClose={close}
      onLaunched={() => undefined}
    />,
    { width: 100, height: 30 },
  )
  await tui.renderOnce()
  await key("F6")
  const input = tui.renderer.currentFocusedRenderable as InputRenderable
  expect(input.id).toBe("terminal-dialog-project-search")
  await act(async () => tui?.mockInput.typeText("qmn"))
  expect(input.value).toBe("qmn")
  await key("ESCAPE")
  expect(tui.renderer.currentFocusedRenderable).toBe(input)
  await key("F7")
  expect(tui.renderer.currentFocusedRenderable).not.toBe(input)
  expect(close).not.toHaveBeenCalled()
  await key("F7")
  expect(close).toHaveBeenCalledTimes(1)
})

const RenamedInputOwner = withShortcutContext(
  "terminal",
  "dialog",
  function a({ onSubmit }: { onSubmit: () => void }) {
    const input = useRef<InputRenderable | null>(null)
    useConfiguredKeyboard(() => undefined)
    useEffect(() => {
      input.current?.focus()
    }, [])
    return (
      <box id="terminal-stable-input-owner">
        <input id="terminal-stable-input" ref={input} onSubmit={onSubmit} />
      </box>
    )
  },
  "terminal-stable-input-owner",
)

test("native input ownership uses explicit IDs independently of bundled component names", async () => {
  setToolShortcuts("terminal", validateShortcuts("terminal", { dialog: { Enter: "F6" } }))
  const submit = mock(() => undefined)
  tui = await testRender(<RenamedInputOwner onSubmit={submit} />, { width: 90, height: 28 })
  await tui.renderOnce()
  await key("RETURN")
  expect(submit).not.toHaveBeenCalled()
  await key("F6")
  expect(submit).toHaveBeenCalledTimes(1)
})
