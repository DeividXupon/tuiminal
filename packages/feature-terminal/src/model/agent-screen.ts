import type { AgentActivity, AgentProfile, AgentSignal } from "./agent-state"
import { detectExtendedAgentScreen } from "./agent-screen-extended"

// Small, local profiles informed by Herdr's detector. See docs/design/terminal-agents.md.
// Match live controls and activity rows, never arbitrary words in a transcript.
const UNKNOWN: AgentSignal = { state: "unknown" }
const IDLE: AgentSignal = { state: "idle", source: "screen" }
const BLOCKED: AgentSignal = { state: "blocked", source: "screen" }
const RULE = /^[─━═╌-]{8,}$/u
const CODEX_BUSY =
  /^(?:[•◦]\s+)?(.+?)\s+\((?:\d+[hm]\s+)*\d+s\s*[•·]\s*esc to interrupt\)(?:\s*·.*)?$/i
const CLAUDE_BUSY = /^[*·✢✳✶✻✽]\s+(.+?)(?:…|\.\.\.)(?:\s+\(.*)?$/u
const OPENCODE_BUSY =
  /^(?:(?:[⬥◆⬩⬪■⬝⋯…\u2800-\u28ff]+|\[⋯\])\s+)?esc(?:\s+again)?(?:\s+to)?\s+interrupt\b/iu
const OPENCODE_BUSY_SUFFIX = /(?:esc(?:\s+again)?|ctrl\+c)(?:\s+to)?\s+interrupt\s*$/i
const OPENCODE_IDLE = /\b(?:ctrl|alt|shift|cmd|meta)\+\S+\s+commands\b/i

function activity(label: string): AgentActivity | null {
  if (/\b(?:reading|viewing|opening)\b/i.test(label)) return "reading"
  if (/\b(?:searching|finding|browsing|exploring)\b/i.test(label)) return "searching"
  if (/\b(?:thinking|reasoning|planning)\b/i.test(label)) return "thinking"
  if (/\b(?:writing|editing|patching|updating)\b/i.test(label)) return "writing"
  if (/\b(?:running|executing|testing)\b/i.test(label)) return "running"
  return null
}

function working(label = "", source: "screen" | "title" = "screen"): AgentSignal {
  return { state: "working", activity: activity(label), source }
}

function lastPrompt(lines: string[], marker: RegExp) {
  return lines.findLastIndex((line) => marker.test(line))
}

function codex(lines: string[]): AgentSignal {
  const prompt = lastPrompt(lines, /^›(?:\s|$)/u)
  const after = lines.slice(prompt + 1).join("\n")
  if (
    /^(?:press )?enter to (?:confirm or esc to cancel|submit (?:answer|all))\.?$/im.test(after) ||
    /^allow command\?$/im.test(after) ||
    (/do you trust the contents of this directory\?/i.test(after) && /^> You are in /m.test(after))
  )
    return BLOCKED
  const before = prompt < 0 ? lines : lines.slice(0, prompt)
  // Later response/completion rows invalidate a historical spinner above the prompt.
  const boundary = before.findLastIndex((line) => /^[•◦■✗✓]/u.test(line))
  const tail = before.slice(Math.max(0, boundary))
  for (const line of tail) {
    const match = CODEX_BUSY.exec(line)
    if (match) return working(match[1])
  }
  if (prompt >= 0 && lines.length - prompt <= 5) return IDLE
  return UNKNOWN
}

function claude(lines: string[]): AgentSignal {
  const bottom = lines.slice(-12)
  const rule = lines.findLastIndex((line) => RULE.test(line))
  const previousRule = lines.slice(0, rule).findLastIndex((line) => RULE.test(line))
  const promptBox =
    previousRule >= 0 &&
    rule >= lines.length - 4 &&
    lines.slice(previousRule + 1, rule).some((line) => /^❯(?:\s|$)/u.test(line))
  const controls = lines.slice(rule + 1).join("\n")
  if (
    /(?:^|\s)esc to cancel\s*$/im.test(controls) &&
    /(?:enter to (?:confirm|select)|MCP server .+ requests your input)/i.test(
      lines.slice(-16).join("\n"),
    )
  )
    return BLOCKED
  const text = bottom.join("\n")
  if (
    !promptBox &&
    /do you want to proceed\?/i.test(text) &&
    /^❯?\s*\d\.\s*(?:Yes|No)\b/im.test(text)
  )
    return BLOCKED
  const activityLines = promptBox
    ? lines.slice(Math.max(0, previousRule - 1), previousRule)
    : bottom.slice(bottom.findLastIndex((line) => /^⏺/u.test(line)) + 1)
  for (const line of activityLines) {
    const match = CLAUDE_BUSY.exec(line)
    if (match) return working(match[1])
    if (/^[⏸⏵].*esc to interrupt/i.test(line)) return working()
  }
  // The input must be inside the last horizontal-rule pair, not an old transcript prompt.
  if (promptBox) return IDLE
  return UNKNOWN
}

function gemini(lines: string[]): AgentSignal {
  const text = lines.slice(-12).join("\n")
  if (
    /^(?:Apply this change|Allow execution)\b/im.test(text) ||
    (/do you want to proceed\?/i.test(text) && /^❯?\s*(?:\d[.)]\s*)?(?:Yes|Allow)\b/im.test(text))
  )
    return BLOCKED
  const busy = lines
    .slice(-5)
    .findLast(
      (line) =>
        !/^[>❯›]/u.test(line) && /(?:^|[\s(])(?:esc to cancel|esc to interrupt)\)?\s*$/i.test(line),
    )
  if (busy) return working(busy)
  if (lines.slice(-5).some((line) => /^>\s*(?:Type your message(?:\.\.\.|…)?\s*)?$/i.test(line)))
    return IDLE
  return UNKNOWN
}

function opencodeActivity(lines: string[]): AgentActivity | null {
  for (const line of lines.slice(-12).reverse()) {
    if (OPENCODE_BUSY.test(line) || OPENCODE_BUSY_SUFFIX.test(line) || OPENCODE_IDLE.test(line))
      continue
    const label = line.replace(/^(?:\[⋯\]|[⬥◆⬩⬪■⬝⋯…\u2800-\u28ff~→←✱%◈$│✓✗#]+)\s*/u, "")
    if (/^(?:Read\b|Reading file\b|Loaded\b|Loading skill\b)/i.test(label)) return "reading"
    if (
      /^(?:Glob\b|Grep\b|Finding files\b|Searching (?:content|web)\b|WebFetch\b|Fetching from the web\b)/i.test(
        label,
      )
    )
      return "searching"
    if (
      /^(?:Write\b|Edit\b|Patch\b|Preparing (?:write|edit|patch)\b|Updating todos\b|Wrote\b|Patched\b|Created\b|Deleted\b|Moved\b)/i.test(
        label,
      )
    )
      return "writing"
    if (/^Thinking\b/i.test(label)) return "thinking"
    if (/^(?:Writing command\b|Running\b|execute\b|Task\b)/i.test(label)) return "running"
    if (/^(?:\[⋯\]|[⬥◆⬩⬪■⬝⋯…\u2800-\u28ff]+)/u.test(line)) return "running"
  }
  return null
}

function opencode(lines: string[]): AgentSignal {
  const text = lines.slice(-12).join("\n")
  if (
    /^△\s*Permission required\s*$/im.test(text) ||
    (/esc dismiss/i.test(text) &&
      /enter (?:confirm|submit|toggle)/i.test(text) &&
      /(?:↑↓ select|⇆ tab)/u.test(text))
  )
    return BLOCKED
  const busy = lines
    .slice(-8)
    .findLast(
      (line) =>
        !/^[>❯›]/u.test(line) && (OPENCODE_BUSY.test(line) || OPENCODE_BUSY_SUFFIX.test(line)),
    )
  if (busy)
    return {
      state: "working",
      activity: opencodeActivity(lines) ?? activity(busy),
      source: "screen",
    }
  if (
    lines
      .slice(-8)
      .some(
        (line) =>
          /^>\s*Ask anything(?:\.\.\.|…)?(?:\s+".*")?\s*$/i.test(line) || OPENCODE_IDLE.test(line),
      )
  )
    return IDLE
  return UNKNOWN
}

function isViewer(footer: string) {
  return (
    /showing detailed transcript/i.test(footer) ||
    (/q to quit/i.test(footer) && /(?:to scroll|to jump)/i.test(footer)) ||
    (/select model/i.test(footer) && /esc to cancel/i.test(footer))
  )
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Title markers are intentionally scoped by agent and ordered by blocked/working/idle priority.
export function detectAgentTitle(
  profile: AgentProfile,
  title: string,
  titleFinished = false,
): AgentSignal {
  if (
    (profile === "codex" &&
      /(?:^|\s[|—]\s)(?:\[\s*[!.]\s*\]\s*)?Action Required(?:$|\s[|—]\s)/i.test(title)) ||
    (profile === "amp" && /plugin confirmation needed/i.test(title)) ||
    (profile === "grok" && /action required/i.test(title)) ||
    (profile === "hermes" && /^⚠[︎️]?(?:\s|$)/u.test(title)) ||
    (profile === "letta" && /^\[\s*[!.]\s*\]\s*Action Required(?:\s*\||$)/i.test(title)) ||
    (profile === "qwen" && /^✳︎?\s/u.test(title))
  ) {
    return { state: "blocked", source: "title" }
  }
  if (
    (profile === "codex" && /(?:^|\s)[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏](?:\s|$)/u.test(title)) ||
    (profile === "claude" && /^[\u2800-\u28ff◐-◓]\s/u.test(title)) ||
    (profile === "amp" && /^[\u2800-\u28ff]\s/u.test(title)) ||
    (profile === "grok" && /(?:^|\s)[\u2801-\u28ff](?:\s|$)/u.test(title)) ||
    (profile === "hermes" && /^⏳[︎️]?(?:\s|$)/u.test(title)) ||
    (profile === "kiro" && /^[◐◓◑◒/|\\-]\s+kiro:/i.test(title)) ||
    (profile === "letta" && /(?:^|\s)[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏](?:\s|$)/u.test(title)) ||
    (profile === "qwen" && /^◐︎?\s/u.test(title))
  )
    return working("", "title")
  if (
    (profile === "claude" && /^✳\s/u.test(title)) ||
    (profile === "codex" && titleFinished && title.trim()) ||
    (profile === "amp" && / - amp - /i.test(title)) ||
    (profile === "grok" && /(?:^| - )grok$/i.test(title) && !/[\u2800-\u28ff]/u.test(title)) ||
    (profile === "hermes" && /^✓[︎️]?(?:\s|$)/u.test(title))
  )
    return { state: "idle", source: "title" }
  return UNKNOWN
}

const PROFILES: Record<AgentProfile, (lines: string[]) => AgentSignal> = {
  amp: (lines) => detectExtendedAgentScreen("amp", lines),
  antigravity: (lines) => detectExtendedAgentScreen("antigravity", lines),
  codex,
  claude,
  cline: (lines) => detectExtendedAgentScreen("cline", lines),
  copilot: (lines) => detectExtendedAgentScreen("copilot", lines),
  cursor: (lines) => detectExtendedAgentScreen("cursor", lines),
  devin: (lines) => detectExtendedAgentScreen("devin", lines),
  droid: (lines) => detectExtendedAgentScreen("droid", lines),
  gemini,
  grok: (lines) => detectExtendedAgentScreen("grok", lines),
  hermes: (lines) => detectExtendedAgentScreen("hermes", lines),
  kilo: (lines) => detectExtendedAgentScreen("kilo", lines),
  kimi: (lines) => detectExtendedAgentScreen("kimi", lines),
  kiro: (lines) => detectExtendedAgentScreen("kiro", lines),
  letta: (lines) => detectExtendedAgentScreen("letta", lines),
  maki: (lines) => detectExtendedAgentScreen("maki", lines),
  mastracode: (lines) => detectExtendedAgentScreen("mastracode", lines),
  muse: (lines) => detectExtendedAgentScreen("muse", lines),
  omp: (lines) => detectExtendedAgentScreen("omp", lines),
  opencode,
  pi: (lines) => detectExtendedAgentScreen("pi", lines),
  qodercli: (lines) => detectExtendedAgentScreen("qodercli", lines),
  qwen: (lines) => detectExtendedAgentScreen("qwen", lines),
  generic: () => UNKNOWN,
}

export function detectAgentScreen(
  profile: AgentProfile,
  screen: string,
  title = "",
  titleFinished = false,
): AgentSignal {
  const lines = screen
    .slice(-32_000)
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^[│┃]\s*|\s*[│┃]$/gu, ""))
    .filter(Boolean)
    .slice(-30)
  if (isViewer(lines.slice(-5).join("\n"))) return { state: "unknown", skip: true }
  const screenSignal = PROFILES[profile](lines)
  const titleSignal = detectAgentTitle(profile, title, titleFinished)
  if (screenSignal.state === "blocked") return screenSignal
  if (titleSignal.state === "blocked") return titleSignal
  if (screenSignal.state === "working") return screenSignal
  return titleSignal.state === "unknown" ? screenSignal : titleSignal
}
