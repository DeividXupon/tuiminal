import type { AgentIdentity, AgentProfile } from "./agent-state"

export type ProcessIdentity = {
  pid: number
  parentPid: number
  executable: string
  command: string
  /** POSIX job-control flags; absent on Windows and restricted process snapshots. */
  foreground?: boolean
  stopped?: boolean
}
const AGENTS = new Set([
  "agy",
  "amp-local",
  "antigravity",
  "antigravity-cli",
  "codex",
  "claude",
  "claude-code",
  "gemini",
  "gemini-cli",
  "aider",
  "goose",
  "opencode",
  "open-code",
  "amp",
  "cline",
  "copilot",
  "github-copilot",
  "ghcs",
  "devin",
  "devin-cli",
  "droid",
  "cursor-agent",
  "cursor",
  "grok",
  "grok-build",
  "grok-cli",
  "hermes",
  "hermes-agent",
  "auggie",
  "qwen",
  "qwen-code",
  "qoder",
  "qodercn",
  "qodercli",
  "qoderclicn",
  "letta",
  "letta-code",
  "kilo",
  "kilo-code",
  "kiro-cli",
  "kiro",
  "maki",
  "mastra-code",
  "mastracode",
  "muse",
  "muse-cli",
  "muse-code",
  "omp",
  "openhands",
  "swe-agent",
  "plandex",
  "roo-code",
  "continue",
  "cn",
  "pi",
  "kimi",
  "kimi-code",
  "kimi-cli",
  "kimi_cli",
])
const RUNTIMES =
  /^(?:node|nodejs|bun|deno|python(?:\d+(?:\.\d+)?)?|ruby|java|npx|uvx|powershell|pwsh|dotnet)$/i
const GENERIC_AGENT =
  /(?:^|[-_. ])(?:ai[-_. ]?(?:agent|assistant)|coding[-_. ]agent|llm[-_. ]agent)(?:$|[-_. ])/i

export function agentIdentity(value: string, configured: readonly string[] = []) {
  const fileName = value.replace(/\\/g, "/").split("/").at(-1)!.toLowerCase()
  const name = fileName.replace(/\.(?:exe|cmd|bat|ps1|js|mjs|cjs|py)$/, "")
  return (
    configured.some(
      (command) => command === name || command === fileName || command === value.toLowerCase(),
    ) ||
    AGENTS.has(name) ||
    GENERIC_AGENT.test(name) ||
    /(?:^|[/\\])(?:@anthropic-ai[/\\]claude-code|@openai[/\\]codex|@google[/\\]gemini-cli|@github[/\\]copilot|@qwen-code[/\\]qwen-code|@(?:mariozechner|earendil-works)[/\\]pi-coding-agent)(?:[/\\]|$)/i.test(
      value,
    )
  )
}

function runtimeEntry(tokens: readonly string[]) {
  const inline = new Set(["-e", "--eval", "-p", "--print", "-c", "--command", "-command"])
  const withValue = new Set([
    "-r",
    "--require",
    "--loader",
    "--import",
    "--input-type",
    "--conditions",
    "-X",
    "-W",
    "--from",
  ])
  for (let index = 1; index < tokens.length; index++) {
    const token = tokens[index]!
    if (inline.has(token.toLowerCase()) || token.startsWith("--eval=")) return undefined
    if (withValue.has(token)) {
      index++
      continue
    }
    if (token === "--" || token === "-m" || token === "--module") return tokens[index + 1]
    if (!token.startsWith("-")) return token
  }
  return undefined
}

function processAgentCommand(process: ProcessIdentity, configured: readonly string[] = []) {
  if (agentIdentity(process.executable, configured)) return process.executable
  const tokens =
    process.command
      .match(/"[^"]*"|'[^']*'|[^\s]+/g)
      ?.map((token) => token.replace(/^["']|["']$/g, "")) ?? []
  const executable = process.executable
    .replace(/\\/g, "/")
    .split("/")
    .at(-1)!
    .replace(/\.exe$/i, "")
  // Some runtimes rename their OS thread (Node can report MainThread).
  // argv[0] still names the actual launcher, so inspect both identities.
  const launcher = (tokens[0] ?? "")
    .replace(/\\/g, "/")
    .split("/")
    .at(-1)!
    .replace(/\.exe$/i, "")
  if (agentIdentity(tokens[0] ?? "", configured)) return tokens[0]!
  if (!RUNTIMES.test(executable) && !RUNTIMES.test(launcher)) return null
  // Inspect the launched script/module, never prompts, filenames or arbitrary arguments.
  const script = runtimeEntry(tokens)
  return script !== undefined && agentIdentity(script, configured) ? script : null
}

export function processIsAgent(process: ProcessIdentity, configured: readonly string[] = []) {
  return processAgentCommand(process, configured) !== null
}

function profileFor(command: string): AgentProfile {
  const value = command.replace(/\\/g, "/").toLowerCase()
  const fileName = value
    .split("/")
    .at(-1)!
    .replace(/\.(?:exe|cmd|bat|ps1|js|mjs|cjs|py)$/, "")
  if (/(?:^|\/|@openai\/)codex(?:\.[cm]?js|\.exe)?(?:\/|$)/.test(value)) return "codex"
  if (/(?:^|\/)claude(?:-code)?(?:\.[cm]?js|\.exe)?(?:\/|$)/.test(value)) return "claude"
  if (/(?:^|\/)gemini(?:-cli)?(?:\.[cm]?js|\.exe)?(?:\/|$)/.test(value)) return "gemini"
  if (/(?:^|\/)opencode(?:\.[cm]?js|\.exe)?(?:\/|$)/.test(value)) return "opencode"
  if (/(?:^|\/)open-code(?:\.[cm]?js|\.exe)?(?:\/|$)/.test(value)) return "opencode"
  if (/(?:^|\/)@github\/copilot(?:\/|$)/.test(value)) return "copilot"
  if (/(?:^|\/)@qwen-code\/qwen-code(?:\/|$)/.test(value)) return "qwen"
  if (/(?:^|\/)@(?:mariozechner|earendil-works)\/pi-coding-agent(?:\/|$)/.test(value)) return "pi"
  const aliases: Partial<Record<string, AgentProfile>> = {
    agy: "antigravity",
    amp: "amp",
    "amp-local": "amp",
    antigravity: "antigravity",
    "antigravity-cli": "antigravity",
    cline: "cline",
    copilot: "copilot",
    "github-copilot": "copilot",
    ghcs: "copilot",
    cursor: "cursor",
    "cursor-agent": "cursor",
    devin: "devin",
    "devin-cli": "devin",
    droid: "droid",
    grok: "grok",
    "grok-build": "grok",
    "grok-cli": "grok",
    hermes: "hermes",
    "hermes-agent": "hermes",
    kilo: "kilo",
    "kilo-code": "kilo",
    kimi: "kimi",
    "kimi-cli": "kimi",
    kimi_cli: "kimi",
    "kimi-code": "kimi",
    kiro: "kiro",
    "kiro-cli": "kiro",
    letta: "letta",
    "letta-code": "letta",
    maki: "maki",
    "mastra-code": "mastracode",
    mastracode: "mastracode",
    muse: "muse",
    "muse-cli": "muse",
    "muse-code": "muse",
    omp: "omp",
    pi: "pi",
    qoder: "qodercli",
    qodercn: "qodercli",
    qodercli: "qodercli",
    qoderclicn: "qodercli",
    qwen: "qwen",
    "qwen-code": "qwen",
  }
  return aliases[fileName] ?? "generic"
}

function genericAgentLabel(command: string) {
  const path = command.replace(/\\/g, "/")
  if (/(?:^|\/)@(?:mariozechner|earendil-works)\/pi-coding-agent(?:\/|$)/i.test(path)) return "pi"
  return path
    .split("/")
    .at(-1)!
    .replace(/[\p{Cc}\u202a-\u202e\u2066-\u2069]/gu, "")
    .slice(0, 60)
}

export function identifyProcessAgent(
  process: ProcessIdentity,
  configured: readonly string[] = [],
): AgentIdentity | null {
  if (process.stopped || process.foreground === false) return null
  const command = processAgentCommand(process, configured)
  if (!command) return null
  const profile = profileFor(command)
  const label =
    profile === "generic"
      ? genericAgentLabel(command)
      : {
          amp: "Amp",
          antigravity: "Antigravity",
          claude: "Claude Code",
          cline: "Cline",
          codex: "Codex",
          copilot: "GitHub Copilot",
          cursor: "Cursor Agent",
          devin: "Devin",
          droid: "Droid",
          gemini: "Gemini",
          grok: "Grok",
          hermes: "Hermes Agent",
          kilo: "Kilo Code",
          kimi: "Kimi Code",
          kiro: "Kiro CLI",
          letta: "Letta Code",
          maki: "Maki",
          mastracode: "MastraCode",
          muse: "Muse",
          omp: "OMP",
          opencode: "OpenCode",
          pi: "Pi",
          qodercli: "Qoder CLI",
          qwen: "Qwen Code",
        }[profile]
  return { key: `${process.pid}:${command}`, label, profile }
}

export function identifyAgent(
  root: number,
  processes: readonly ProcessIdentity[],
  configured: readonly string[] = [],
): AgentIdentity | null {
  const children = new Map<number, ProcessIdentity[]>()
  const byPid = new Map<number, ProcessIdentity>()
  for (const process of processes) {
    byPid.set(process.pid, process)
    const siblings = children.get(process.parentPid)
    if (siblings) siblings.push(process)
    else children.set(process.parentPid, [process])
  }
  const visited = new Set<number>()
  const pending = [root]
  while (pending.length) {
    const pid = pending.pop()
    if (pid === undefined || visited.has(pid)) continue
    visited.add(pid)
    const process = byPid.get(pid)
    if (process) {
      const identity = identifyProcessAgent(process, configured)
      if (identity) return identity
    }
    const descendants = children.get(pid)
    if (descendants) {
      for (const child of descendants) pending.push(child.pid)
    }
  }
  return null
}

export function descendantProcesses(root: number, processes: readonly ProcessIdentity[]) {
  const children = new Map<number, ProcessIdentity[]>()
  for (const process of processes) {
    const siblings = children.get(process.parentPid) ?? []
    siblings.push(process)
    children.set(process.parentPid, siblings)
  }
  const byPid = new Map(processes.map((process) => [process.pid, process]))
  const found: ProcessIdentity[] = []
  const visited = new Set<number>()
  const pending = [root]
  while (pending.length) {
    const pid = pending.pop()!
    if (visited.has(pid)) continue
    visited.add(pid)
    const process = byPid.get(pid)
    if (process) found.push(process)
    for (const child of children.get(pid) ?? []) pending.push(child.pid)
  }
  return found
}

export function parsePosixProcesses(source: string): ProcessIdentity[] {
  return source.split("\n").flatMap((line) => {
    const match = /^\s*(\d+)\s+(\d+)\s+(\S+)\s+(\S+)\s+(.*)$/.exec(line)
    return match
      ? [
          {
            pid: Number(match[1]),
            parentPid: Number(match[2]),
            foreground: match[3]!.includes("+"),
            stopped: /[TZ]/.test(match[3]!),
            executable: match[4]!,
            command: match[5]!,
          },
        ]
      : []
  })
}

export function parseWindowsProcesses(source: string): ProcessIdentity[] {
  const parsed: unknown = JSON.parse(source.replace(/^\uFEFF/, ""))
  const rows = Array.isArray(parsed) ? parsed : [parsed]
  return rows.flatMap((row: unknown) => {
    if (!row || typeof row !== "object") return []
    const item = row as Record<string, unknown>
    if (
      typeof item.ProcessId !== "number" ||
      typeof item.ParentProcessId !== "number" ||
      typeof item.Name !== "string"
    )
      return []
    return [
      {
        pid: item.ProcessId,
        parentPid: item.ParentProcessId,
        executable: item.Name,
        command: typeof item.CommandLine === "string" ? item.CommandLine : "",
      },
    ]
  })
}
