import { descendantProcesses, identifyProcessAgent, type ProcessIdentity } from "./agent-detection"
import { cleanTerminalName } from "./sessions"

function executableName(value: string) {
  return cleanTerminalName(
    value
      .replace(/\\/g, "/")
      .split("/")
      .at(-1)!
      .replace(/^-+|\.exe$/gi, ""),
  )
}

function isShell(name: string) {
  return /^(?:sh|bash|zsh|fish|dash|ash|ksh|csh|tcsh|nu|cmd|powershell|pwsh)$/i.test(name)
}

function processTitle(
  process: ProcessIdentity | undefined,
  configured: readonly string[],
): { title?: string; shell?: string } {
  if (!process || process.stopped || process.foreground === false) return {}
  const agent = identifyProcessAgent(process, configured)
  if (agent)
    return {
      title: agent.profile === "generic" ? cleanTerminalName(agent.label) : agent.profile,
    }
  const name = executableName(process.executable)
  if (!name) return {}
  return isShell(name) ? { shell: name } : { title: name }
}

function fallbackShell(process: ProcessIdentity | undefined) {
  if (!process || process.stopped) return null
  const name = executableName(process.executable)
  return isShell(name) ? name : null
}

/** Prefer the foreground tool over its shell and its short-lived helper processes. */
export function terminalProcessTitle(
  root: number,
  processes: readonly ProcessIdentity[],
  configured: readonly string[] = [],
) {
  const tree = descendantProcesses(root, processes)
  const byPid = new Map(tree.map((process) => [process.pid, process]))
  const children = new Map<number, number[]>()
  for (const process of tree) {
    const siblings = children.get(process.parentPid) ?? []
    siblings.push(process.pid)
    children.set(process.parentPid, siblings)
  }
  const pending = [root]
  const visited = new Set<number>()
  let shell: string | null = null
  for (let index = 0; index < pending.length; index++) {
    const pid = pending[index]!
    if (visited.has(pid)) continue
    visited.add(pid)
    pending.push(...(children.get(pid) ?? []))
    const candidate = processTitle(byPid.get(pid), configured)
    if (candidate.title) return candidate.title
    if (candidate.shell) shell = candidate.shell
  }
  return shell ?? fallbackShell(byPid.get(root))
}

export function terminalProcessPresentation(
  root: number,
  processes: readonly ProcessIdentity[],
  configured: readonly string[] = [],
) {
  const title = terminalProcessTitle(root, processes, configured)
  return { title, busy: Boolean(title && !isShell(title)) }
}
