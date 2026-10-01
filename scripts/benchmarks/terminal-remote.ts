import { chmodSync, mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { type BenchmarkCase, defineBenchmark } from "./harness"

export async function terminalRemoteBenchmarks(root: string): Promise<BenchmarkCase[]> {
  const { parseClaudeBackgroundSessions } = await import(
    "../../packages/feature-terminal/src/services/claude-background"
  )
  const { parseProjectDirectoryOutput, projectDirectorySshCommand } = await import(
    "../../packages/feature-terminal/src/services/agent-project-ssh"
  )
  const { CodexProxyFrameDecoder, codexProxyClientFrame } = await import(
    "../../packages/feature-terminal/src/services/codex-proxy-websocket"
  )
  const { compatibleCodexVersions, handshakeRemoteCodex, preflightRemoteCodex } = await import(
    "../../packages/feature-terminal/src/services/remote-codex-handshake"
  )
  const { REMOTE_CODEX_PREFLIGHT_MARKER, createRemoteCodexAppServerLaunch, remoteCodexTuiCommand } =
    await import("../../packages/feature-terminal/src/services/remote-codex-connection")
  const { remoteCodexCompatibility, remoteCodexCompatibilityReport } = await import(
    "../../packages/feature-terminal/src/services/remote-codex-compatibility"
  )
  const {
    parseClaudeVersion,
    remoteClaudeAgentsCommand,
    remoteClaudeTerminalCommand,
    supportedClaudeBackgroundSessions,
  } = await import("../../packages/feature-terminal/src/services/remote-claude-connection")
  const { compatibleRemoteOpenCode, openCodeCliProtocol, openCodeVersion } = await import(
    "../../packages/feature-terminal/src/services/opencode-protocol"
  )
  const { remoteOpenCodeServerCommand, remoteOpenCodeServerKey, remoteOpenCodeTunnelCommand } =
    await import("../../packages/feature-terminal/src/services/remote-opencode-connection")
  const { RemoteLiveDiffProtocol } = await import(
    "../../packages/feature-terminal/src/services/remote-live-diff-protocol"
  )
  const { createRemoteTerminalContextSource } = await import(
    "../../packages/feature-terminal/src/services/remote-terminal-context"
  )
  const { checkRemoteServerReadiness, remoteServerBarrierCheckCommand } = await import(
    "../../packages/feature-terminal/src/services/remote-server-readiness"
  )
  const { listSshConfigProfiles } = await import(
    "../../packages/feature-terminal/src/services/ssh-config"
  )

  const profile = { id: "benchmark", name: "Benchmark", host: "benchmark" }
  const fixtureRoot = join(dirname(root), "terminal-remote-benchmarks")
  const home = join(fixtureRoot, "home")
  const ssh = join(home, ".ssh")
  const includes = join(ssh, "hosts")
  mkdirSync(includes, { recursive: true })
  writeFileSync(join(ssh, "config"), "Include hosts/*.conf\nHost *\n  ServerAliveInterval 30\n")
  for (let file = 0; file < 4; file += 1)
    writeFileSync(
      join(includes, `${file}.conf`),
      `${Array.from({ length: 16 }, (_, index) => `Host benchmark-${file * 16 + index}`).join("\n")}\n`,
    )

  const readinessFixture = join(fixtureRoot, "readiness-fixture.ts")
  writeFileSync(
    readinessFixture,
    `const input = process.argv.slice(2).join(" ")
const barrier = input.includes(":githubSsh:") ? "githubSsh" : "codex"
process.stdout.write(\`TUIMINAL_REMOTE_READY:\${barrier}:ready\\n\`)
`,
  )
  const liveDiffFixture = join(fixtureRoot, "live-diff-fixture.ts")
  writeFileSync(
    liveDiffFixture,
    `const encode = (value) => [...Buffer.from(value)].map((byte) => byte.toString(8).padStart(3, "0")).join("")
let buffered = ""
process.stdin.setEncoding("utf8")
process.stdin.on("data", (chunk) => {
  buffered += chunk
  let newline = buffered.indexOf("\\n")
  while (newline >= 0) {
    const line = buffered.slice(0, newline)
    buffered = buffered.slice(newline + 1)
    const [id, operation] = line.split("|")
    const output = operation === "context" ? "/srv/project\\0main\\0dirty" : "ok"
    process.stdout.write(\`TUIMINAL_LIVE_DIFF|\${id}\`)
    process.stdout.write(\`|0|\${encode(output)}|\\n\`)
    newline = buffered.indexOf("\\n")
  }
})
`,
  )
  if (process.platform !== "win32") {
    chmodSync(readinessFixture, 0o700)
    chmodSync(liveDiffFixture, 0o700)
  }
  const projectDirectoryOutput = `TUIMINAL_PROJECTS\0/srv/project\0${Array.from(
    { length: 2_000 },
    (_, index) => `/srv/project/folder-${index}\0`,
  ).join("")}TRUNCATED\0`
  const proxyFixture = join(import.meta.dir, "../../tests/fixtures/codex-proxy-fixture.ts")
  const proxyResponse = JSON.stringify({ result: { userAgent: "codex_cli_rs/0.157.1" } })
  const localVersionCommand = [
    process.execPath,
    "-e",
    'process.stdout.write("codex-cli 0.157.1\\n")',
  ]
  const remoteProbeCommand = [
    process.execPath,
    "-e",
    `process.stdout.write(${JSON.stringify(
      `${REMOTE_CODEX_PREFLIGHT_MARKER}\nVERSION\ncodex-cli 0.157.1\nDAEMON=1\nPROXY=1\nAUTH=1\n`,
    )})`,
  ]
  const daemonStartCommand = [
    process.execPath,
    "-e",
    `process.stdout.write(${JSON.stringify(
      JSON.stringify({ status: "alreadyRunning", appServerVersion: "0.157.1" }),
    )})`,
  ]

  return [
    defineBenchmark({
      id: "terminal.ssh_config_discovery",
      tool: "terminal",
      description: "Discover 64 explicit SSH aliases through bounded Include files",
      run: () => listSshConfigProfiles({ homeDirectory: home }),
      verify: (result) => {
        if (result.length !== 64 || result[63]?.host !== "benchmark-63")
          throw new Error("SSH alias discovery lost an explicit profile")
      },
    }),
    defineBenchmark({
      id: "terminal.remote_directory_parse",
      tool: "terminal",
      description: "Parse and sort a bounded 2,000-row remote directory response",
      run: () => parseProjectDirectoryOutput(projectDirectoryOutput),
      verify: (result) => {
        if (result.directories.length !== 2_000 || !result.truncated)
          throw new Error("Remote directory parsing lost its bounded result")
      },
    }),
    defineBenchmark({
      id: "terminal.remote_commands",
      tool: "terminal",
      description: "Build 9,000 bounded Codex, Claude, OpenCode, SSH and readiness commands",
      operationsPerSample: 9_000,
      run: () => {
        let result: readonly string[] = []
        for (let index = 0; index < 1_000; index += 1) {
          const directory = `/srv/project-${index}`
          const codex = createRemoteCodexAppServerLaunch(profile, directory)
          result = codex.daemonStartCommand
          result = codex.proxyCommand
          result = remoteCodexTuiCommand("ws://127.0.0.1:4500", directory, `thread-${index}`)
          result = remoteClaudeTerminalCommand(
            profile,
            directory,
            "{}",
            "11111111-1111-4111-8111-111111111111",
          )
          result = remoteClaudeAgentsCommand(profile, directory)
          const key = remoteOpenCodeServerKey(directory, "2.0.20")
          result = remoteOpenCodeServerCommand(profile, directory, key)
          result = remoteOpenCodeTunnelCommand(profile, 45_000 + (index % 100), 46_000)
          result = remoteServerBarrierCheckCommand(profile, "codex")
          result = projectDirectorySshCommand(profile, directory, "/srv", true)
        }
        return result
      },
      verify: (result) => {
        if (!result.includes("benchmark") || !result.at(-1)?.includes("/srv/project-999"))
          throw new Error("Remote command construction lost its profile or path")
      },
    }),
    defineBenchmark({
      id: "terminal.remote_compatibility",
      tool: "terminal",
      description: "Classify 10,000 Codex, Claude and OpenCode version reports",
      operationsPerSample: 10_000,
      run: () => {
        let compatible = false
        for (let index = 0; index < 10_000; index += 1) {
          const remote = remoteCodexCompatibility(
            `${REMOTE_CODEX_PREFLIGHT_MARKER}\nVERSION\ncodex-cli 0.157.1\nDAEMON=1\nPROXY=1\n`,
          )
          const codex = remoteCodexCompatibilityReport({ version: "0.157.1", reason: null }, remote)
          const claude = parseClaudeVersion("Claude Code 2.1.285")
          const openCodeVersionValue = openCodeVersion("opencode v2.0.20")
          compatible = Boolean(
            codex.compatible &&
              compatibleCodexVersions("0.157.1", "0.157.1") &&
              claude &&
              supportedClaudeBackgroundSessions(claude.join(".")) &&
              openCodeCliProtocol(`opencode v${openCodeVersionValue}`) === "v2" &&
              compatibleRemoteOpenCode(
                { protocol: "v2", version: openCodeVersionValue },
                { protocol: "v2", version: "2.0.20" },
              ),
          )
        }
        return compatible
      },
      verify: (result) => {
        if (!result) throw new Error("Compatible remote provider versions were rejected")
      },
    }),
    defineBenchmark({
      id: "terminal.codex_proxy_frames",
      tool: "terminal",
      description: "Encode and incrementally decode 1,000 masked Codex WebSocket frames",
      operationsPerSample: 1_000,
      run: () => {
        const decoder = new CodexProxyFrameDecoder()
        let decoded = 0
        let last = ""
        for (let index = 0; index < 1_000; index += 1) {
          const frame = codexProxyClientFrame(
            JSON.stringify({ id: index, method: "item/agentMessage/delta" }),
            1,
            new Uint8Array([1, 2, 3, 4]),
          )
          const middle = Math.floor(frame.length / 2)
          decoded += decoder.push(frame.subarray(0, middle)).length
          const frames = decoder.push(frame.subarray(middle))
          decoded += frames.length
          const payload = frames.at(-1)?.payload
          if (payload) last = new TextDecoder().decode(payload)
        }
        return { decoded, last }
      },
      verify: ({ decoded, last }) => {
        if (decoded !== 1_000 || !last.includes('"id":999'))
          throw new Error("Codex proxy frame decoding lost a message")
      },
    }),
    defineBenchmark({
      id: "terminal.remote_readiness",
      tool: "terminal",
      description: "Run both remote server readiness barriers through isolated fixture processes",
      run: () =>
        checkRemoteServerReadiness(profile, new AbortController().signal, {
          executable: [process.execPath, readinessFixture],
          timeoutMs: 1_000,
        }),
      verify: (result) => {
        if (!result.githubSsh.ready || !result.codex.ready)
          throw new Error("Remote readiness fixtures did not pass both barriers")
      },
    }),
    defineBenchmark({
      id: "terminal.remote_codex_handshake",
      tool: "terminal",
      description: "Complete an isolated Codex WebSocket initialize handshake",
      run: () =>
        handshakeRemoteCodex(profile, "/srv/project", new AbortController().signal, {
          remoteCommand: [process.execPath, proxyFixture, "handshake", proxyResponse],
          localVersionCommand,
          timeoutMs: 2_000,
        }),
      verify: (result) => {
        if (result.localVersion !== "0.157.1" || result.remoteVersion !== "0.157.1")
          throw new Error("Remote Codex handshake lost a version")
      },
    }),
    defineBenchmark({
      id: "terminal.remote_codex_preflight",
      tool: "terminal",
      description: "Probe versions, daemon lifecycle and initialize for remote Codex",
      run: () =>
        preflightRemoteCodex(profile, "/srv/project", new AbortController().signal, {
          localVersionCommand,
          remoteProbeCommand,
          daemonStartCommand,
          proxyCommand: [process.execPath, proxyFixture, "handshake", proxyResponse],
          timeoutMs: 2_000,
        }),
      verify: (result) => {
        if (!result.compatible || result.remoteUserAgent !== "codex_cli_rs/0.157.1")
          throw new Error("Remote Codex preflight did not validate its initialized server")
      },
    }),
    defineBenchmark({
      id: "terminal.remote_live_diff_protocol",
      tool: "terminal",
      description: "Exchange 100 requests over one isolated remote Live Diff helper channel",
      operationsPerSample: 100,
      run: async () => {
        const protocol = new RemoteLiveDiffProtocol([process.execPath, liveDiffFixture], 1_000)
        try {
          return await Promise.all(
            Array.from({ length: 100 }, (_, index) =>
              protocol.request("root", [`/srv/project-${index}`], new AbortController().signal),
            ),
          )
        } finally {
          protocol.close()
        }
      },
      verify: (result) => {
        if (result.length !== 100 || result.some((entry) => entry.stdout !== "ok"))
          throw new Error("Remote Live Diff protocol lost a response")
      },
    }),
    defineBenchmark({
      id: "terminal.remote_context",
      tool: "terminal",
      description: "Read repository context through an isolated remote helper channel",
      run: async () => {
        const source = createRemoteTerminalContextSource(
          { profile, workingDirectory: "/srv/project" },
          { command: [process.execPath, liveDiffFixture], requestTimeoutMs: 1_000 },
        )
        try {
          return await source.read(new AbortController().signal)
        } finally {
          source.close()
        }
      },
      verify: (result) => {
        if (
          result.projectName !== "project" ||
          result.branch !== "main" ||
          result.state !== "dirty"
        )
          throw new Error("Remote repository context was not projected")
      },
    }),
    defineBenchmark({
      id: "terminal.claude_background_parse",
      tool: "terminal",
      description: "Reject malformed rows while parsing a mixed Claude background roster",
      run: () =>
        parseClaudeBackgroundSessions(
          JSON.stringify([
            {
              kind: "background",
              id: "benchmark-agent",
              sessionId: "11111111-1111-4111-8111-111111111111",
              cwd: "/srv/project",
              name: "Benchmark",
              startedAt: 1_780_000_000_000,
              state: "working",
              status: "busy",
            },
            { kind: "foreground", id: "ignored" },
          ]),
        ),
      verify: (result) => {
        if (result.length !== 1 || result[0]?.state !== "working")
          throw new Error("Claude background roster accepted an invalid row")
      },
    }),
  ]
}
