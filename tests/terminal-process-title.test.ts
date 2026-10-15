import { describe, expect, test } from "bun:test"
import {
  type ProcessIdentity,
  parsePosixProcesses,
  parseWindowsProcesses,
} from "../packages/feature-terminal/src/model/agent-detection"
import {
  terminalProcessPresentation,
  terminalProcessSnapshot,
  terminalProcessTitle,
} from "../packages/feature-terminal/src/model/process-title"

describe("automatic terminal names", () => {
  test("follows the foreground tool and returns to the shell when it closes", () => {
    const shell = "100 1 Ss /bin/zsh -zsh\n"
    expect(terminalProcessTitle(100, parsePosixProcesses(shell))).toBe("zsh")
    expect(terminalProcessPresentation(100, parsePosixProcesses(shell))).toEqual({
      title: "zsh",
      busy: false,
    })
    expect(
      terminalProcessTitle(100, parsePosixProcesses(`${shell}101 100 Sl+ lazygit lazygit\n`)),
    ).toBe("lazygit")
    expect(
      terminalProcessPresentation(
        100,
        parsePosixProcesses(`${shell}101 100 Sl+ lazygit lazygit\n`),
      ),
    ).toEqual({ title: "lazygit", busy: true })
    expect(terminalProcessTitle(100, parsePosixProcesses(shell))).toBe("zsh")
  })

  test("skips shell wrappers and keeps the tool name while it runs helper commands", () => {
    const tree = parsePosixProcesses(
      "100 1 Ss zsh zsh\n101 100 S+ sh sh -c lazygit\n102 101 S+ lazygit lazygit\n103 102 S+ git git status\n",
    )
    expect(terminalProcessTitle(100, tree)).toBe("lazygit")
    expect(terminalProcessTitle(100, [...tree].reverse())).toBe("lazygit")
  })

  test("ignores background, stopped, zombie and foreign processes", () => {
    const tree = parsePosixProcesses(
      "100 1 Ss zsh zsh\n101 100 S node node server.js\n102 100 T+ lazygit lazygit\n103 100 Z+ nvim nvim\n200 1 S+ htop htop\n",
    )
    expect(terminalProcessTitle(100, tree)).toBe("zsh")
    expect(
      terminalProcessTitle(100, [...tree, ...parsePosixProcesses("104 100 S+ less less")]),
    ).toBe("less")
  })

  test("recognizes a tool replacing the shell and does not use arbitrary arguments", () => {
    expect(terminalProcessTitle(100, parsePosixProcesses("100 1 S+ lazygit lazygit"))).toBe(
      "lazygit",
    )
    expect(
      terminalProcessTitle(100, parsePosixProcesses("100 1 S+ cat cat lazygit private-token")),
    ).toBe("cat")
  })

  test("uses owned Windows descendants when job-control metadata is unavailable", () => {
    const tree = parseWindowsProcesses(
      JSON.stringify([
        { ProcessId: 100, ParentProcessId: 1, Name: "cmd.exe" },
        { ProcessId: 101, ParentProcessId: 100, Name: "C:\\Tools\\lazygit.exe" },
        { ProcessId: 102, ParentProcessId: 101, Name: "git.exe" },
        { ProcessId: 200, ParentProcessId: 1, Name: "nvim.exe" },
      ]),
    )
    expect(terminalProcessTitle(100, tree)).toBe("lazygit")
    expect(terminalProcessTitle(100, tree.slice(0, 1))).toBe("cmd")
  })

  test.each([
    ["node /opt/@openai/codex/bin/codex.js", "codex"],
    ["node /opt/@anthropic-ai/claude-code/cli.js", "claude"],
    ["node /opt/@google/gemini-cli/index.js", "gemini"],
    ["bun /opt/opencode/bin/opencode.js", "opencode"],
  ])("names the agent behind %s instead of its runtime", (command, expected) => {
    for (const executable of ["MainThread", "node", "node.exe"]) {
      const tree = parsePosixProcesses(
        `100 1 Ss zsh zsh\n101 100 S+ ${executable} ${command}\n102 101 S+ git git status\n`,
      )
      expect(terminalProcessTitle(100, tree)).toBe(expected)
    }
  })

  test("uses configured agent entry points without treating arbitrary arguments as names", () => {
    const agent: ProcessIdentity = {
      pid: 101,
      parentPid: 100,
      executable: "MainThread",
      command: "python3 -m private.bot",
      foreground: true,
    }
    expect(terminalProcessTitle(100, [agent], ["private.bot"])).toBe("private.bot")
    expect(terminalProcessTitle(100, [agent])).toBe("MainThread")
    expect(terminalProcessTitle(100, [{ ...agent, command: "node app.js --prompt codex" }])).toBe(
      "MainThread",
    )
    expect(terminalProcessTitle(100, [{ ...agent, command: "node -e codex" }])).toBe("MainThread")
    expect(terminalProcessTitle(100, [{ ...agent, foreground: false }], ["private.bot"])).toBeNull()
    expect(terminalProcessTitle(100, [{ ...agent, stopped: true }], ["private.bot"])).toBeNull()
  })

  test("an agent child cannot replace the name of another foreground tool", () => {
    const tree = parsePosixProcesses(
      "100 1 Ss zsh zsh\n101 100 S+ lazygit lazygit\n102 101 S+ MainThread node /opt/@openai/codex/bin/codex.js\n",
    )
    expect(terminalProcessTitle(100, tree)).toBe("lazygit")
    expect(terminalProcessSnapshot(100, tree)).toEqual({
      title: "lazygit",
      busy: true,
      agent: { key: "102:/opt/@openai/codex/bin/codex.js", label: "Codex", profile: "codex" },
    })
  })

  test("supports incomplete snapshots, nested shells and cyclic parent links", () => {
    const process = (pid: number, parentPid: number, executable: string): ProcessIdentity => ({
      pid,
      parentPid,
      executable,
      command: executable,
      foreground: true,
    })
    expect(terminalProcessTitle(100, [])).toBeNull()
    expect(terminalProcessTitle(100, [process(101, 100, "lazygit")])).toBe("lazygit")
    expect(
      terminalProcessTitle(100, [process(100, 101, "-zsh"), process(101, 100, "/bin/bash")]),
    ).toBe("bash")
    expect(terminalProcessTitle(100, [{ ...process(100, 1, "zsh"), stopped: true }])).toBeNull()
    expect(terminalProcessTitle(100, [process(100, 1, "/tmp/tool\u202e\n")])).toBe("tool")
    expect(terminalProcessTitle(100, [process(100, 1, `界${"👩‍💻".repeat(90)}`)])).toBe(
      `界${"👩‍💻".repeat(79)}`,
    )
  })
})
