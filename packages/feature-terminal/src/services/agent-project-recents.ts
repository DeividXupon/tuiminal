import { readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { atomicWriteFileSync, currentFileHash } from "@xupon/tuiminal-core/storage/atomic-file"
import type { CodexResumeThread } from "../model/codex-resume-threads"
import { type AgentProjectTarget, validProjectPath } from "./agent-project-directories"
import { terminalWorkspaceStateDirectory } from "./terminal-workspace-state"

export type RecentAgentProject = { source: string; path: string; usedAt: number }
export function projectSource(target: AgentProjectTarget) {
  return target.kind === "local" ? "local" : `ssh:${target.profile.id}`
}
export function projectName(path: string) {
  return (
    path
      .replace(/[\\/]+$/u, "")
      .split(/[\\/]/u)
      .at(-1) || path
  )
}
export function mergeRecentProjects(projects: readonly RecentAgentProject[]) {
  const unique = new Map<string, RecentAgentProject>()
  const counts = new Map<string, number>()
  for (const project of [...projects].sort((a, b) => b.usedAt - a.usedAt)) {
    if (
      !validProjectPath(project.path, project.source !== "local") ||
      !Number.isFinite(project.usedAt)
    )
      continue
    const key = JSON.stringify([project.source, project.path])
    if (!counts.has(project.source) && counts.size >= 65) continue
    const count = counts.get(project.source) ?? 0
    if (unique.has(key) || count >= 20) continue
    unique.set(key, project)
    counts.set(project.source, count + 1)
  }
  return [...unique.values()]
}
export function recentProjectsForTarget(
  target: AgentProjectTarget,
  saved: readonly RecentAgentProject[],
  threads: readonly CodexResumeThread[],
) {
  const source = projectSource(target)
  const fromThreads = threads.map((thread) => ({
    source: thread.remoteProfileId ? `ssh:${thread.remoteProfileId}` : "local",
    path: thread.cwd,
    usedAt: thread.updatedAt < 1e12 ? thread.updatedAt * 1000 : thread.updatedAt,
  }))
  return mergeRecentProjects(
    [...saved, ...fromThreads].filter((project) => project.source === source),
  )
}
export function agentProjectRecentsPath(environment: NodeJS.ProcessEnv = process.env) {
  return join(terminalWorkspaceStateDirectory(environment), "agent-projects.json")
}
export function loadRecentAgentProjects(
  environment: NodeJS.ProcessEnv = process.env,
): RecentAgentProject[] {
  if (environment.TUIMINAL_TERMINAL_WORKSPACE_STATE === "0") return []
  try {
    const path = agentProjectRecentsPath(environment)
    if (statSync(path).size > 8 * 1024 * 1024) return []
    const parsed = JSON.parse(readFileSync(path, "utf8"))
    if (parsed.version !== 1 || !Array.isArray(parsed.projects)) return []
    return mergeRecentProjects(
      parsed.projects.filter((entry: unknown): entry is RecentAgentProject => {
        if (!entry || typeof entry !== "object") return false
        const value = entry as RecentAgentProject
        return (
          typeof value.source === "string" &&
          (value.source === "local" || value.source.startsWith("ssh:")) &&
          typeof value.path === "string" &&
          typeof value.usedAt === "number"
        )
      }),
    )
  } catch {
    return []
  }
}
export function rememberAgentProject(
  target: AgentProjectTarget,
  path: string,
  environment: NodeJS.ProcessEnv = process.env,
) {
  if (environment.TUIMINAL_TERMINAL_WORKSPACE_STATE === "0") return
  const file = agentProjectRecentsPath(environment)
  for (let attempt = 0; attempt < 2; attempt++) {
    const expectedHash = currentFileHash(file)
    const projects = mergeRecentProjects([
      { source: projectSource(target), path, usedAt: Date.now() },
      ...loadRecentAgentProjects(environment),
    ])
    try {
      atomicWriteFileSync(file, `${JSON.stringify({ version: 1, projects })}\n`, {
        expectedHash,
        mode: 0o600,
      })
      return
    } catch (error) {
      if (attempt === 1) throw error
    }
  }
}
