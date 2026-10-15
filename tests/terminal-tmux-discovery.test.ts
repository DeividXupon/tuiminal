import { afterEach, expect, spyOn, test } from "bun:test"
import * as commands from "../packages/feature-terminal/src/services/tmux-command"
import { discoverTmuxPanes } from "../packages/feature-terminal/src/services/tmux-discovery"

const originalTmux = process.env.TMUX
const originalPane = process.env.TMUX_PANE
let capability: ReturnType<typeof spyOn<typeof commands, "hasTmux">> | undefined
let command: ReturnType<typeof spyOn<typeof commands, "runTmux">> | undefined
afterEach(() => {
  capability?.mockRestore()
  command?.mockRestore()
  if (originalTmux === undefined) delete process.env.TMUX
  else process.env.TMUX = originalTmux
  if (originalPane === undefined) delete process.env.TMUX_PANE
  else process.env.TMUX_PANE = originalPane
})

test("discovery keeps the agent beside Tuiminal and deduplicates linked panes", async () => {
  process.env.TMUX = "/tmp/fixture.sock,100,0"
  process.env.TMUX_PANE = "%7"
  capability = spyOn(commands, "hasTmux").mockResolvedValue(true)
  command = spyOn(commands, "runTmux").mockResolvedValue(
    [
      "$0\t0\t@3\t3\tagent\t%6\t0\tnode\t1120",
      "$0\t0\t@4\t4\ttuiminal\t%7\t0\tbun\t1189",
      "$1\tprojects\t@5\t0\tzsh\t%8\t0\tzsh\t1272",
      "$2\tlinked\t@3\t3\tagent\t%6\t0\tnode\t1120",
    ]
      .map((pane) => `/tmp/fixture.sock\t${pane}\t/tmp/project`)
      .join("\n"),
  )
  const result = await discoverTmuxPanes(new AbortController().signal)
  expect(result.available).toBe(true)
  expect(result.panes.map((pane) => [pane.sessionId, pane.paneId, pane.command])).toEqual([
    ["$0", "%6", "node"],
    ["$1", "%8", "zsh"],
  ])
  expect(
    command.mock.calls.every(([args]) => args.includes("list-panes") && args.includes("-a")),
  ).toBe(true)
})

test("missing tmux returns an actionable empty state without discovering sessions", async () => {
  capability = spyOn(commands, "hasTmux").mockResolvedValue(false)
  command = spyOn(commands, "runTmux").mockResolvedValue("")
  expect(await discoverTmuxPanes(new AbortController().signal)).toEqual({
    available: false,
    panes: [],
  })
  expect(command).not.toHaveBeenCalled()
})

test("marks panes from the persistent Tuiminal server separately from external tmux panes", async () => {
  capability = spyOn(commands, "hasTmux").mockResolvedValue(true)
  command = spyOn(commands, "runTmux").mockImplementation(async (args) => {
    const owned = args.includes("tuiminal")
    return `${owned ? "/tmp/tuiminal.sock" : "/tmp/default.sock"}\t$1\t${
      owned ? "tuiminal" : "work"
    }\t@1\t0\tshell\t%1\t0\tzsh\t100\t/tmp/project\n`
  })
  const result = await discoverTmuxPanes(new AbortController().signal)
  expect(result.panes.map(({ name, ownedByTuiminal }) => [name, ownedByTuiminal])).toEqual([
    ["work", false],
    ["tuiminal", true],
  ])
})

test("the shared Tuiminal session wins over temporary linked client sessions", async () => {
  capability = spyOn(commands, "hasTmux").mockResolvedValue(true)
  command = spyOn(commands, "runTmux").mockImplementation(async (args) => {
    if (!args.includes("tuiminal")) return ""
    return [
      "/tmp/tuiminal.sock\t$2\ttuiminal-client-temp\t@1\t0\tzsh\t%1\t0\tzsh\t100\t/tmp/project",
      "/tmp/tuiminal.sock\t$1\ttuiminal\t@1\t0\tzsh\t%1\t0\tzsh\t100\t/tmp/project",
    ].join("\n")
  })
  const result = await discoverTmuxPanes(new AbortController().signal)
  expect(result.panes.map(({ name, sessionId }) => [name, sessionId])).toEqual([["tuiminal", "$1"]])
})

test("discovery excludes marked and just-started pinned sidebar panes", async () => {
  capability = spyOn(commands, "hasTmux").mockResolvedValue(true)
  command = spyOn(commands, "runTmux").mockResolvedValue(
    [
      "/tmp/default.sock\t$1\twork\t@1\t0\tmain\t%1\t0\tzsh\t100\t\t'zsh'\tzsh\t/tmp/project",
      "/tmp/default.sock\t$1\twork\t@1\t0\tmain\t%2\t1\tbun\t101\t1\t'tuiminal --internal-terminal-sidebar'\tTuiminal sidebar\t/tmp/project",
      "/tmp/default.sock\t$1\twork\t@2\t1\tnew\t%3\t0\tbun\t102\t\t'tuiminal --internal-terminal-sidebar'\t\t/tmp/project",
    ].join("\n"),
  )
  const result = await discoverTmuxPanes(new AbortController().signal)
  expect(result.panes.map((pane) => pane.paneId)).toEqual(["%1"])
})
