import { describe, expect, test } from "bun:test"
import {
  agentIdentity,
  descendantProcesses,
  identifyAgent,
  identifyProcessAgent,
  parsePosixProcesses,
  parseWindowsProcesses,
  processIsAgent,
} from "../packages/feature-terminal/src/model/agent-detection"

describe("terminal agent detection", () => {
  test("recognizes native agents, runtime modules and provider independent names", () => {
    for (const name of [
      "codex",
      "claude",
      "gemini",
      "aider",
      "opencode",
      "cursor-agent",
      "copilot.exe",
      "qwen",
      "pi",
      "kimi",
      "kimi_cli",
      "/opt/node_modules/@mariozechner/pi-coding-agent/dist/cli.js",
      "/opt/node_modules/@earendil-works/pi-coding-agent/dist/cli.js",
      "my-ai-agent.py",
    ]) {
      expect(agentIdentity(name)).toBe(true)
    }
    expect(
      processIsAgent({
        pid: 2,
        parentPid: 1,
        executable: "node",
        command: "node /opt/@anthropic-ai/claude-code/cli.js",
      }),
    ).toBe(true)
    expect(
      processIsAgent({
        pid: 2,
        parentPid: 1,
        executable: "python3",
        command: "python3 -m team_ai_agent",
      }),
    ).toBe(true)
  })
  test("recognizes agents when Node reports MainThread instead of its executable name", () => {
    expect(
      processIsAgent({
        pid: 3,
        parentPid: 1,
        executable: "MainThread",
        command: "node /tmp/demo-ai-agent.js",
      }),
    ).toBe(true)
  })
  test.each(["mariozechner", "earendil-works"])("Pi's @%s module keeps its agent name", (scope) => {
    expect(
      identifyProcessAgent({
        pid: 3,
        parentPid: 1,
        executable: "node",
        command: `node /opt/node_modules/@${scope}/pi-coding-agent/dist/cli.js`,
      }),
    ).toMatchObject({ profile: "pi", label: "Pi" })
  })
  test.each([
    ["@github/copilot", "copilot"],
    ["@qwen-code/qwen-code", "qwen"],
  ] as const)("runtime module %s selects the %s profile", (module, profile) => {
    expect(
      identifyProcessAgent({
        pid: 3,
        parentPid: 1,
        executable: "node",
        command: `node /opt/node_modules/${module}/dist/index.js`,
      }),
    ).toMatchObject({ profile })
  })
  test.each([
    ["amp-local", "amp", "Amp"],
    ["agy", "antigravity", "Antigravity"],
    ["cline", "cline", "Cline"],
    ["ghcs", "copilot", "GitHub Copilot"],
    ["cursor-agent", "cursor", "Cursor Agent"],
    ["devin-cli", "devin", "Devin"],
    ["droid", "droid", "Droid"],
    ["grok-build", "grok", "Grok"],
    ["hermes-agent", "hermes", "Hermes Agent"],
    ["kilo-code", "kilo", "Kilo Code"],
    ["kimi_cli", "kimi", "Kimi Code"],
    ["kiro-cli", "kiro", "Kiro CLI"],
    ["letta-code", "letta", "Letta Code"],
    ["maki", "maki", "Maki"],
    ["mastracode", "mastracode", "MastraCode"],
    ["muse-cli", "muse", "Muse"],
    ["open-code", "opencode", "OpenCode"],
    ["omp", "omp", "OMP"],
    ["qodercli", "qodercli", "Qoder CLI"],
    ["qwen-code", "qwen", "Qwen Code"],
  ] as const)("%s receives its own %s identity", (executable, profile, label) => {
    expect(
      identifyProcessAgent({ pid: 4, parentPid: 1, executable, command: executable }),
    ).toMatchObject({
      profile,
      label,
    })
  })
  test("configured identities recognize an arbitrary private agent without matching prompt arguments", () => {
    const process = {
      pid: 2,
      parentPid: 1,
      executable: "python3",
      command: "python3 -m team.assistant",
    }
    expect(agentIdentity("C:\\tools\\private.exe", ["private.exe"])).toBe(true)
    expect(processIsAgent(process)).toBe(false)
    expect(processIsAgent(process, ["team.assistant"])).toBe(true)
    expect(
      processIsAgent({ ...process, command: "python3 other.py team.assistant" }, [
        "team.assistant",
      ]),
    ).toBe(false)
  })
  test("does not infer agents from arbitrary arguments, source files or shell text", () => {
    for (const [executable, command] of [
      ["cat", "cat codex"],
      ["echo", "echo AI agent"],
      ["sh", "sh -c claude"],
      ["node", "node app.js --prompt codex"],
      ["node", "node -e claude"],
      ["node", "node --require codex ordinary.js"],
    ]) {
      expect(
        processIsAgent({ pid: 2, parentPid: 1, executable: executable!, command: command! }),
      ).toBe(false)
    }
    expect(agentIdentity("my-codex-notes.txt")).toBe(false)
  })
  test("follows only the owned shell tree and tolerates cycles", () => {
    const processes = parsePosixProcesses(
      " 100 1 Ss sh /bin/sh\n101 100 S+ node node /opt/@openai/codex/bin/codex.js\n200 1 S+ claude claude\n",
    )
    expect(descendantProcesses(100, processes).map((process) => process.pid)).toEqual([100, 101])
    expect(descendantProcesses(99, processes)).toEqual([])
    expect(
      descendantProcesses(1, [
        { pid: 1, parentPid: 2, executable: "sh", command: "sh" },
        { pid: 2, parentPid: 1, executable: "sh", command: "sh" },
      ]),
    ).toHaveLength(2)
  })
  test("parses Windows singleton, array, BOM and inaccessible command lines", () => {
    expect(
      parseWindowsProcesses(
        '\uFEFF{"ProcessId":1,"ParentProcessId":0,"Name":"claude.exe","CommandLine":null}',
      ),
    ).toEqual([{ pid: 1, parentPid: 0, executable: "claude.exe", command: "" }])
    expect(parseWindowsProcesses('[null, {"ProcessId":"wrong"}]')).toEqual([])
  })
  test("prefers a live foreground agent and excludes background, stopped and foreign jobs", () => {
    const processes = parsePosixProcesses(
      "100 1 Ss sh sh\n101 100 S node node /opt/@openai/codex/bin/codex.js\n102 100 T+ claude claude\n103 100 Sl+ node node /opt/@google/gemini-cli/index.js\n200 1 S+ opencode opencode\n",
    )
    expect(identifyAgent(100, processes)).toEqual({
      key: "103:/opt/@google/gemini-cli/index.js",
      label: "Gemini",
      profile: "gemini",
    })
    expect(
      identifyAgent(
        100,
        processes.filter((process) => process.pid !== 103),
      ),
    ).toBeNull()
    expect(
      identifyAgent(
        100,
        [{ pid: 101, parentPid: 100, executable: "python", command: "python -m private.bot" }],
        ["private.bot"],
      ),
    ).toMatchObject({ profile: "generic", label: "private.bot" })
  })
})
