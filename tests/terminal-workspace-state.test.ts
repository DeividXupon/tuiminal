import { afterEach, expect, test } from "bun:test"
import { mkdtempSync, mkdirSync, realpathSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  loadTerminalWorkspaceState,
  parseTerminalWorkspaceState,
  saveTerminalWorkspaceState,
  terminalWorkspaceAssignmentKey,
  terminalWorkspaceStatePath,
} from "../packages/feature-terminal/src/services/terminal-workspace-state"

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

test("only reserved folder folds and tmux placement persist outside the project", () => {
  const root = mkdtempSync(join(tmpdir(), "tuiminal-terminal-folders-"))
  roots.push(root)
  const project = join(root, "project")
  const data = join(root, "data")
  mkdirSync(project)
  const environment = {
    ...process.env,
    XDG_DATA_HOME: data,
    TUIMINAL_TERMINAL_WORKSPACE_STATE: "1",
  }
  const target = {
    socket: "/tmp/tuiminal.sock",
    sessionId: "$1",
    name: "tuiminal",
    windowId: "@7",
    windowName: "terminal-stable-id",
    persistentId: "terminal-stable-id",
    paneId: "%8",
    ownedByTuiminal: true,
  }
  const key = terminalWorkspaceAssignmentKey(target)

  saveTerminalWorkspaceState(
    project,
    {
      folders: [{ id: "folder-1", name: "Services" }],
      assignments: { [key]: "terminal" },
      collapsedFolderIds: ["terminal", "folder-1"],
    },
    environment,
  )

  expect(loadTerminalWorkspaceState(project, environment)).toEqual({
    folders: [],
    assignments: { [key]: "terminal" },
    collapsedFolderIds: ["terminal"],
  })
  expect(terminalWorkspaceStatePath(project, environment)).toStartWith(data)
})

test("owned placement identity follows its stable window ID across display renames", () => {
  const first = terminalWorkspaceAssignmentKey({
    socket: "/tmp/tuiminal.sock",
    sessionId: "$1",
    name: "tuiminal",
    windowId: "@7",
    windowName: "zsh",
    persistentId: "terminal-stable-id",
    paneId: "%8",
    ownedByTuiminal: true,
  })
  const restored = terminalWorkspaceAssignmentKey({
    socket: "/tmp/tuiminal.sock",
    sessionId: "$3",
    name: "tuiminal",
    windowId: "@12",
    windowName: "codex",
    persistentId: "terminal-stable-id",
    paneId: "%14",
    ownedByTuiminal: true,
  })
  expect(restored).toBe(first)
})

test("legacy custom folders and their placements are discarded on load", () => {
  const root = mkdtempSync(join(tmpdir(), "tuiminal-terminal-folders-legacy-"))
  roots.push(root)
  const project = join(root, "project")
  mkdirSync(project)

  expect(
    parseTerminalWorkspaceState(
      JSON.stringify({
        version: 1,
        project: realpathSync.native(project),
        folders: [{ id: "folder-1", name: "Services" }],
        assignments: { legacy: "folder-1", reserved: "tmux" },
        collapsedFolderIds: ["terminal", "folder-1"],
      }),
      project,
    ),
  ).toEqual({
    folders: [],
    assignments: { reserved: "tmux" },
    collapsedFolderIds: ["terminal"],
  })
})
