import { describe, expect, test } from "bun:test"
import { parsePosixProcesses } from "../packages/feature-terminal/src/model/agent-detection"
import {
  externalTerminalsFromProcesses,
  parsePosixTerminalGroups,
} from "../packages/feature-terminal/src/services/external-terminal-discovery"

describe("external terminal discovery", () => {
  test("groups foreign TTYs and excludes the current, owned and tmux terminals", () => {
    const groups = parsePosixTerminalGroups(
      [
        "500 1 500 500 pts/0",
        "200 10 200 201 pts/1",
        "201 200 201 201 pts/1",
        "300 1 300 -1 ?",
        "301 300 301 301 pts/2",
        "601 500 601 601 pts/3",
        "700 20 700 700 tty2",
      ].join("\n"),
    )
    const processes = parsePosixProcesses(
      [
        "500 1 S+ bun tuiminal",
        "200 10 Ss zsh zsh",
        "201 200 S+ lazygit lazygit",
        "300 1 Ss tmux: server tmux",
        "301 300 S+ zsh zsh",
        "601 500 S+ bash bash",
        "700 20 S+ zsh zsh",
      ].join("\n"),
    )

    expect(externalTerminalsFromProcesses(groups, processes, 500)).toEqual([
      { terminalId: "pts/1", pid: 200, title: "lazygit", busy: true, agent: null },
      { terminalId: "tty2", pid: 700, title: "zsh", busy: false, agent: null },
    ])
  })

  test("keeps only valid controlling terminals and follows configured agents", () => {
    const groups = parsePosixTerminalGroups(
      "100 1 100 101 pts/4\n101 100 101 101 pts/4\n102 1 102 -1 ?\ninvalid\n",
    )
    const processes = parsePosixProcesses(
      "100 1 Ss zsh zsh\n101 100 S+ MainThread python3 -m private.bot\n",
    )

    expect(externalTerminalsFromProcesses(groups, processes, 999, ["private.bot"])).toEqual([
      {
        terminalId: "pts/4",
        pid: 100,
        title: "private.bot",
        busy: true,
        agent: {
          key: "101:private.bot",
          label: "private.bot",
          profile: "generic",
        },
      },
    ])
  })
})
