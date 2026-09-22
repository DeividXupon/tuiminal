import type { AgentActivity, AgentProfile, AgentSignal } from "./agent-state"

const UNKNOWN: AgentSignal = { state: "unknown" }
const IDLE: AgentSignal = { state: "idle", source: "screen" }
const BLOCKED: AgentSignal = { state: "blocked", source: "screen" }

function activity(label: string): AgentActivity | null {
  if (/\b(?:reading|viewing|opening)\b/i.test(label)) return "reading"
  if (/\b(?:searching|finding|browsing|exploring)\b/i.test(label)) return "searching"
  if (/\b(?:thinking|reasoning|planning)\b/i.test(label)) return "thinking"
  if (/\b(?:writing|editing|patching|updating)\b/i.test(label)) return "writing"
  if (/\b(?:running|executing|testing)\b/i.test(label)) return "running"
  return null
}

function working(label = ""): AgentSignal {
  return { state: "working", activity: activity(label), source: "screen" }
}

function paired(text: string, first: RegExp, second: RegExp) {
  return first.test(text) && second.test(text)
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Each agent has independent, ordered live-control evidence; combining them would make unrelated profiles share authority.
export function detectExtendedAgentScreen(profile: AgentProfile, lines: string[]): AgentSignal {
  const text = lines.slice(-24).join("\n")
  const bottom = lines.slice(-8).join("\n")
  const last = lines.at(-1) ?? ""
  switch (profile) {
    case "amp":
      if (
        /waiting for approval|invoke tool|run this command\?|allow (?:editing|creating) file:|confirm tool call/i.test(
          bottom,
        ) ||
        paired(text, /approve/i, /allow all for|allow file for|deny with feedback/i)
      )
        return BLOCKED
      if (/^╰\s+\S+\s+(?:thinking|streaming|running tools|waiting)\s+─/im.test(bottom))
        return working(bottom)
      if (/esc to cancel/i.test(bottom)) return working(bottom)
      return UNKNOWN
    case "antigravity":
      if (
        paired(
          text,
          /requesting permission for:/i,
          /do you want to proceed\?|tab amend|edit command/i,
        )
      )
        return BLOCKED
      if (/^[\u2800-\u28ff]+\s+\p{Alphabetic}+\w*ing\b/imu.test(bottom)) return working(bottom)
      if (/·\s*[1-9]\d*\s+tasks?\b/i.test(bottom)) return working(bottom)
      return UNKNOWN
    case "cline":
      if (
        /let cline use this tool|cline needs permission/i.test(text) ||
        paired(
          text,
          /execute command\?|use this tool\?|approve tool call\?/i,
          /\byes\b|\[y\] approve/i,
        ) ||
        paired(text, /cline is asking a question/i, /\(tab\).*shift\+tab/is)
      )
        return BLOCKED
      if (
        /^[\u2801-\u28ff]\s+\S/im.test(bottom) ||
        /thinking\.\.\. \(esc to cancel\)/i.test(bottom)
      )
        return working(bottom)
      if (paired(bottom, /^❯(?:\s.*)?$/m, /\(tab\).*shift\+tab/is)) return IDLE
      return UNKNOWN
    case "copilot":
      if (paired(text, /esc(?: to)? cancel/i, /enter (?:to )?(?:select|confirm|submit|accept)/i))
        return BLOCKED
      if (/^◎\s+waiting for background agents(?:\s|·|$)/im.test(bottom)) return working(bottom)
      if (/esc(?: again)?(?: to)? (?:cancel|interrupt)/i.test(bottom)) return working(bottom)
      return UNKNOWN
    case "cursor":
      if (
        paired(
          bottom,
          /write to this file\?|waiting for approval|run this command\?/i,
          /proceed \(y\)|run \(once\) \(y\)|skip \(esc or n\)/i,
        ) ||
        /^(?:→\s*)?(?:allow|run) .*\(y\)/im.test(bottom)
      )
        return BLOCKED
      if (/ctrl\+c to stop|\b[1-9]\d*\s+background tasks?\b/i.test(bottom)) return working(bottom)
      if (/^(?:⬡|⬢|[\u2800-\u28ff]+)\s+\p{Alphabetic}+\w*ing\b/imu.test(bottom))
        return working(bottom)
      return UNKNOWN
    case "devin":
      if (
        paired(bottom, /do you trust the authors of this directory\?/i, /yes, trust/i) ||
        paired(bottom, /approve once/i, /select|confirm|esc cancel/i)
      )
        return BLOCKED
      if (
        /running tools.*esc to interrupt|guide devin while it works|reading shell .*timeout:/is.test(
          bottom,
        )
      )
        return working(bottom)
      if (/^❭\s*ask devin to build/im.test(bottom) || paired(bottom, /^❭/m, /context:/i))
        return IDLE
      return UNKNOWN
    case "droid":
      if (
        paired(text, /enter to select|enter select/i, /esc to cancel|esc cancel/i) &&
        /yes, allow|no, cancel|navigate/i.test(text)
      )
        return BLOCKED
      if (/esc to stop/i.test(bottom)) return working(bottom)
      return UNKNOWN
    case "grok":
      if (
        /^(?:┃\s*)?[0-9a-z]+\s+\([●○]\)\s/im.test(text) ||
        paired(bottom, /:select/i, /ctrl\+o:yolo|shift\+x:dismiss/i)
      )
        return BLOCKED
      if (/^[\u2801-\u28ff]\s.*\[stop\]\s*$/imu.test(text)) return working(bottom)
      if (paired(bottom, /ctrl\+\.:shortcuts/i, /esc:cancel|ctrl\+c:cancel/i))
        return working(bottom)
      if (/^[○◎◉]\s+[1-9]\d*\s+.*still running/im.test(text)) return working(bottom)
      if (/ctrl\+\.:shortcuts/i.test(bottom)) return IDLE
      return UNKNOWN
    case "hermes":
      if (
        /sudo password|skill setup/i.test(bottom) ||
        paired(
          bottom,
          /dangerous|approval|hermes needs your|type your answer|approve once/i,
          /enter(?: to)? confirm|enter send|press enter|↑\/↓|deny|cancel/i,
        )
      )
        return BLOCKED
      if (/msg=interrupt|ctrl\+c to interrupt|ctrl\+c cancel/i.test(bottom)) return working(bottom)
      return UNKNOWN
    case "kilo":
      if (
        /^△\s*Permission required\s*$/im.test(text) ||
        (paired(text, /esc dismiss/i, /enter (?:confirm|submit|toggle)/i) &&
          /↑↓ select|⇆ tab/u.test(text))
      )
        return BLOCKED
      if (/esc(?: again)?(?: to)? interrupt/i.test(bottom)) return working(bottom)
      return UNKNOWN
    case "kimi":
      if (
        paired(
          text,
          /↵ confirm/i,
          /run this command\?|write this file\?|apply these edits\?|stop this task\?|ready to build with this plan\?/i,
        ) ||
        paired(text, /↑↓ select.*esc cancel/is, /^\s*(?:question|\?\s)/im) ||
        paired(text, /requesting approval/i, /approve once|approve for this session/i)
      )
        return BLOCKED
      if (/^(?:🌕|🌖|🌗|🌘|🌑|🌒|🌓|🌔)$/mu.test(bottom)) return working()
      if (/^[\u2800-\u28ff]+\s*(?:thinking\.\.\.|working\.\.\.|using )/imu.test(bottom))
        return working(bottom)
      if (/\bkimi[-\w.]*\s+thinking\b.*\[[1-9]\d*\s+agents?\s+running\]/i.test(bottom))
        return working(bottom)
      return UNKNOWN
    case "kiro":
      if (
        /tool approval.*approve all pending|requires approval.*modify request/is.test(text) ||
        paired(bottom, /esc to close/i, /allow|always allow|deny|single permission|entire tool/i) ||
        paired(bottom, /to navigate/i, /to submit.*esc to cancel/is)
      )
        return BLOCKED
      if (paired(bottom, /kiro is working/i, /type to steer.*ctrl\+s to queue/is))
        return working(bottom)
      if (/^[>›]\s*ask a question or describe a task(?:\s+(?:enter|↵))?\s*$/i.test(last))
        return IDLE
      return UNKNOWN
    case "letta":
      if (paired(text, /run this command\?/i, /enter to select.*esc to cancel/is)) return BLOCKED
      if (
        /^(?:\S+\s+)+is(?: \S+)*… \((?:esc to interrupt(?: · .*)?|interrupting)\)$/im.test(bottom)
      )
        return working(bottom)
      if (/^(?:└\s*)?running\.\.\.(?:\s*\(.*\))?$/im.test(bottom)) return working(bottom)
      if (/^›\s*$/m.test(bottom) || /^›\s+Try\s+"/m.test(bottom)) return IDLE
      return UNKNOWN
    case "maki":
      if (
        paired(
          text,
          /permission required/i,
          /allow.*deny|confirm allow|enter deny.*esc cancel/is,
        ) ||
        paired(text, /plan complete/i, /enter confirm/i)
      )
        return BLOCKED
      if (/^(?:[\u2800-\u28ff]\s*){1,2}\[(?:build|plan|bash)\]/i.test(last)) return working(last)
      if (/^\[(?:build|plan|bash)\]/i.test(last)) return IDLE
      if (/^❯\s/u.test(last) && !/queue another prompt/i.test(bottom)) return IDLE
      return UNKNOWN
    case "muse":
      if (
        paired(bottom, /do you trust this workspace\?/i, /trust and continue|use up\/down/i) ||
        /enter to (?:select.*tab for an optional note|toggle.*esc to interrupt)/is.test(bottom) ||
        /allow this stage once.*always allow in this workspace|allow once.*allow for this session|yes, proceed.*yes, don't ask again this session/is.test(
          bottom,
        )
      )
        return BLOCKED
      if (/enter (?:confirm|save).*esc go back|space toggle.*esc close.*type filter/is.test(bottom))
        return { state: "unknown", skip: true }
      if (/esc to interrupt/i.test(bottom)) return working(bottom)
      if (
        /^⟩(?:\s+\S.*)?$/mu.test(bottom) ||
        /^\S+ · (?:none|minimal|low|medium|high|xhigh|ultra) · /im.test(bottom)
      )
        return IDLE
      return UNKNOWN
    case "pi":
      if (/^working\.\.\.$/im.test(bottom) || /^── [⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏] working ─+$/imu.test(bottom))
        return working("working")
      return UNKNOWN
    case "omp":
      return UNKNOWN
    case "qodercli":
      if (
        /permission required|allow once or always\?|asking user|enter your response|review your answers:|shell awaiting input/i.test(
          text,
        ) ||
        paired(text, /waiting for user confirmation|awaiting approval/i, /yes|no|allow|reject/i)
      )
        return BLOCKED
      if (/\(esc to cancel,/i.test(bottom) || /^[\u2800-\u28ff]\s+.*\p{Alphabetic}/imu.test(bottom))
        return working(bottom)
      return UNKNOWN
    case "qwen":
      if (
        /^[⠁-⣿]\s+.*(?:waiting for user confirmation|aguardando confirmação do usuário)\.\.\.$/imu.test(
          text,
        ) ||
        paired(
          text,
          /yes, allow once/i,
          /apply this change\?|allow execution|do you want to proceed\?|shell command execution/i,
        ) ||
        paired(text, /do you trust this folder\?/i, /trust folder.*don't trust/is) ||
        paired(text, /^[❯›]\s*(?:\[(?: |✓)\]\s*)?\d+\./m, /↑\/↓.*(?:enter|return)/is)
      )
        return BLOCKED
      if (
        /^(?:[⠁-⣿]|\.{1,2})\s+.*\(\d+(?:m(?:\s+\d+s)?|s).*·\s*esc to cancel\)\s*$/imu.test(bottom)
      )
        return working(bottom)
      if (paired(text, /^>\s*(?:type\s*)?.*$/im, /type your message|@path\/to\/file/i)) return IDLE
      return UNKNOWN
    case "mastracode":
    case "generic":
    case "codex":
    case "claude":
    case "gemini":
    case "opencode":
      return UNKNOWN
  }
}
