import type { AgentIdentity } from "./agent-state"

const MARKERS = /^(?:[\s\u2800-\u28ff◐-◓✳✢✻✽✶✦◇⏲✋●○✓!*]|\ufe0e|\ufe0f)+/u
const ANSI_SEQUENCE = new RegExp(`${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`, "g")
const STATUS =
  /^(?:working|thinking|ready|idle|done|running|action required|needs input|waiting for (?:input|approval)|generating (?:a )?title)(?:…|\.{3})?$/i
const APPLICATION =
  /^(?:codex|claude(?: code)?|gemini(?: cli)?|opencode|oc|qwen(?: code)?|pi|π|kimi(?: cli)?|aider|goose|amp|cline|(?:github )?copilot|cursor(?: agent)?|auggie|kiro(?: cli)?|openhands|swe-agent|plandex|roo(?: code)?|continue|cn)(?: v?\d[\w.+-]*)?$/i
const SHELL =
  /^(?:-?(?:ba|z|fi|da|a|k|tc|c)?sh|nu|cmd(?:\.exe)?|powershell|pwsh|node|MainThread|terminal)$/i
const PATH = /^(?:[~/.\\]|[a-z]:[/\\]|[^\s@]+@[^\s:]+(?::|$))/i
const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" })

/** Display text only: never a command, activity signal or replacement terminal name. */
export function cleanAgentTaskTitle(value: string) {
  const text = value
    .replace(ANSI_SEQUENCE, "")
    .replace(/\s+/gu, " ")
    .replace(/[\p{Cc}\u00ad\u061c\u200b\u200e\u200f\u202a-\u202e\u2060-\u206f\ufeff]/gu, "")
    .trim()
  let result = ""
  let count = 0
  for (const { segment } of graphemes.segment(text)) {
    if (count++ === 160) break
    result += segment
  }
  return result
}

function withoutMarker(value: string) {
  return value
    .replace(/^\[\s*[!.]\s*\]\s*/u, "")
    .replace(MARKERS, "")
    .replace(/\s+[\u2800-\u28ff]\s*$/u, "")
    .trim()
}

function providerTitle(identity: AgentIdentity, title: string) {
  // Gemini's dynamic title exposes the current public thought subject, with cwd
  // in parentheses. Static titles and status-only titles contain no task summary.
  if (identity.profile === "gemini") {
    if (/^Gemini CLI\s*\(/i.test(title)) return null
    title = title.replace(/\s+\([^()]*\)$/, "")
  }
  // Pi includes the directory after the session name; Qwen's unnamed fallback
  // contains only its directory. Neither directory is a task title.
  if (/^(?:pi|π)\s+-\s+/i.test(title)) {
    const parts = title.split(/\s+-\s+/)
    if (parts.length < 3) return null
    title = parts.slice(1, -1).join(" - ")
  }
  if (/^qwen(?: code)?\s+-\s+/i.test(title)) return null
  return title
}

function withoutAppPrefix(identity: AgentIdentity, title: string) {
  for (const separator of [" - ", ": ", " — "]) {
    const index = title.indexOf(separator)
    if (index < 0) continue
    const prefix = title.slice(0, index)
    if (APPLICATION.test(prefix) || prefix.toLowerCase() === identity.label.toLowerCase()) {
      title = title.slice(index + separator.length)
      break
    }
  }
  return title
}

/** null clears a session title; undefined is a transient/status-only observation. */
export function agentTaskTitle(identity: AgentIdentity, raw: string): string | null | undefined {
  const clean = cleanAgentTaskTitle(raw)
  if (!clean) return null
  const plain = withoutMarker(clean)
  if (!plain) return undefined
  if (APPLICATION.test(plain) || plain.toLowerCase() === identity.label.toLowerCase()) return null
  if (SHELL.test(plain) || PATH.test(plain)) return undefined
  let title = providerTitle(identity, plain)
  if (title === null) return null

  // Keep unknown components: Codex title items are user-configurable and have
  // no typed wire format. Generic/configured agents use the same OSC transport.
  title = title
    .split(/\s+\|\s+/)
    .map(withoutMarker)
    .filter(
      (part) =>
        part &&
        !STATUS.test(part) &&
        !APPLICATION.test(part) &&
        !SHELL.test(part) &&
        !PATH.test(part),
    )
    .join(" | ")
  title = withoutAppPrefix(identity, title)
  if (!title || STATUS.test(title) || SHELL.test(title) || PATH.test(title)) return undefined
  return title
}

/** Keep a useful title through spinner/status updates without re-parsing every screen tick. */
export class AgentTaskTitle {
  value: string | null = null
  private revision: number

  constructor(
    private identity: AgentIdentity,
    ignoredRevision = -1,
  ) {
    this.revision = ignoredRevision
  }

  observe(title: string, revision: number) {
    if (revision === this.revision) return this.value
    this.revision = revision
    const next = agentTaskTitle(this.identity, title)
    if (next !== undefined) this.value = next
    return this.value
  }
}
