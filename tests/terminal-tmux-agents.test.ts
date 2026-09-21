import { afterEach, expect, spyOn, test } from "bun:test"
import { getUiSettings, updateUiSettings } from "../packages/core/src/settings/theme"
import * as discovery from "../packages/feature-terminal/src/services/tmux-discovery"
import * as inspection from "../packages/feature-terminal/src/services/agent-processes"
import { discoverTmuxAgents } from "../packages/feature-terminal/src/services/tmux-agents"
import { parsePosixProcesses } from "../packages/feature-terminal/src/model/agent-detection"
import type { TmuxPaneInfo } from "../packages/feature-terminal/src/model/tmux"

const settings = getUiSettings()
let panes: ReturnType<typeof spyOn<typeof discovery, "discoverTmuxPanes">> | undefined
let processes: ReturnType<typeof spyOn<typeof inspection, "readTerminalProcesses">> | undefined
afterEach(() => {
  panes?.mockRestore()
  processes?.mockRestore()
  updateUiSettings(settings)
})

function pane(panePid: number): TmuxPaneInfo {
  return {
    socket: "/tmp/fixture.sock",
    sessionId: "$0",
    name: "work",
    windowId: "@1",
    windowIndex: 1,
    windowName: "codex",
    paneId: `%${panePid}`,
    paneIndex: 0,
    command: "zsh",
    panePid,
    cwd: "/tmp/project",
  }
}

test("automatic discovery mirrors live agent processes, including Node wrappers, but not named empty shells", async () => {
  panes = spyOn(discovery, "discoverTmuxPanes").mockResolvedValue({
    available: true,
    panes: [100, 200, 300, 400, 500].map(pane),
  })
  processes = spyOn(inspection, "readTerminalProcesses").mockResolvedValue(
    parsePosixProcesses(
      [
        "100 1 Ss zsh zsh",
        "101 100 Sl+ node node /opt/@openai/codex/bin/codex.js",
        "200 1 Ss+ zsh zsh", // An empty window named codex is not an agent.
        "300 1 Ss zsh zsh",
        "301 300 S node node /opt/@anthropic-ai/claude-code/cli.js",
        "400 1 Ss zsh zsh",
        "401 400 T+ claude claude",
        "500 1 S+ node node server.js --prompt codex",
        "900 1 S+ gemini gemini", // Outside the enumerated pane trees.
      ].join("\n"),
    ),
  )
  const result = await discoverTmuxAgents(new AbortController().signal)
  expect(result.agents.map(({ pane, agent }) => [pane.paneId, agent.label])).toEqual([
    ["%100", "Codex"],
  ])
})

test("discovery honors configured agent names and excludes the enclosing app without TMUX_PANE", async () => {
  updateUiSettings({ terminalAgentCommands: ["team.assistant"] })
  panes = spyOn(discovery, "discoverTmuxPanes").mockResolvedValue({
    available: true,
    panes: [pane(100), pane(process.pid)],
  })
  processes = spyOn(inspection, "readTerminalProcesses").mockResolvedValue([
    {
      pid: 101,
      parentPid: 100,
      executable: "python",
      command: "python -m team.assistant",
      foreground: true,
    },
    {
      pid: process.pid,
      parentPid: 1,
      executable: "bun",
      command: "bun tuiminal",
      foreground: true,
    },
    {
      pid: process.pid + 100,
      parentPid: process.pid,
      executable: "claude",
      command: "claude",
      foreground: true,
    },
  ])
  expect(
    (await discoverTmuxAgents(new AbortController().signal)).agents.map(({ pane }) => pane.paneId),
  ).toEqual(["%100"])
})

test("without tmux discovery leaves native terminals alone and does not scan unrelated processes", async () => {
  panes = spyOn(discovery, "discoverTmuxPanes").mockResolvedValue({ available: false, panes: [] })
  processes = spyOn(inspection, "readTerminalProcesses").mockResolvedValue([])
  expect(await discoverTmuxAgents(new AbortController().signal)).toEqual({
    available: false,
    agents: [],
  })
  expect(processes).not.toHaveBeenCalled()
})

test("cancellation discards a late process snapshot", async () => {
  const deferred =
    Promise.withResolvers<Awaited<ReturnType<typeof inspection.readTerminalProcesses>>>()
  panes = spyOn(discovery, "discoverTmuxPanes").mockResolvedValue({
    available: true,
    panes: [pane(100)],
  })
  processes = spyOn(inspection, "readTerminalProcesses").mockReturnValue(deferred.promise)
  const controller = new AbortController()
  const scan = discoverTmuxAgents(controller.signal)
  await Promise.resolve()
  controller.abort()
  deferred.resolve([
    { pid: 101, parentPid: 100, executable: "codex", command: "codex", foreground: true },
  ])
  await expect(scan).rejects.toThrow()
})
