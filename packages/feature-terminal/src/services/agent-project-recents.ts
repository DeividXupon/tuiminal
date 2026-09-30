import { readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { atomicWriteFileSync, currentFileHash } from "@xupon/tuiminal-core/storage/atomic-file"
import { isAgentProviderId, type AgentProviderId } from "../model/agent-provider"
import { type AgentProjectTarget, validProjectPath } from "./agent-project-directories"
import type { AgentResumeProject } from "./agent-provider-adapters"
import { terminalWorkspaceStateDirectory } from "./terminal-workspace-state"

export type RecentAgentProject = {
  providerId: AgentProviderId
  source: string
  path: string
  usedAt: number
}
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
    const scope = JSON.stringify([project.providerId, project.source])
    const key = JSON.stringify([project.providerId, project.source, project.path])
    if (!counts.has(scope) && counts.size >= 65) continue
    const count = counts.get(scope) ?? 0
    if (unique.has(key) || count >= 20) continue
    unique.set(key, project)
    counts.set(scope, count + 1)
  }
  return [...unique.values()]
}
export function recentProjectsForTarget(
  providerId: AgentProviderId,
  target: AgentProjectTarget,
  saved: readonly RecentAgentProject[],
  threads: readonly AgentResumeProject[],
) {
  const source = projectSource(target)
  const fromThreads = threads.map((thread) => ({
    providerId,
    source: thread.remoteProfileId ? `ssh:${thread.remoteProfileId}` : "local",
    path: thread.cwd,
    usedAt: thread.updatedAt < 1e12 ? thread.updatedAt * 1000 : thread.updatedAt,
  }))
  return mergeRecentProjects(
    [...saved, ...fromThreads].filter(
      (project) => project.providerId === providerId && project.source === source,
    ),
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
    if (![1, 2].includes(parsed.version) || !Array.isArray(parsed.projects)) return []
    return mergeRecentProjects(
      parsed.projects.flatMap((entry: unknown): RecentAgentProject[] => {
        if (!entry || typeof entry !== "object") return []
        const value = entry as Partial<RecentAgentProject>
        if (
          typeof value.source === "string" &&
          (value.source === "local" || value.source.startsWith("ssh:")) &&
          typeof value.path === "string" &&
          typeof value.usedAt === "number"
        ) {
          const providerId = parsed.version === 1 ? "codex" : value.providerId
          return isAgentProviderId(providerId)
            ? [{ providerId, source: value.source, path: value.path, usedAt: value.usedAt }]
            : []
        }
        return []
      }),
    )
  } catch {
    return []
  }
}
export function rememberAgentProject(
  providerId: AgentProviderId,
  target: AgentProjectTarget,
  path: string,
  environment: NodeJS.ProcessEnv = process.env,
) {
  if (environment.TUIMINAL_TERMINAL_WORKSPACE_STATE === "0") return
  const file = agentProjectRecentsPath(environment)
  for (let attempt = 0; attempt < 2; attempt++) {
    const expectedHash = currentFileHash(file)
    const projects = mergeRecentProjects([
      { providerId, source: projectSource(target), path, usedAt: Date.now() },
      ...loadRecentAgentProjects(environment),
    ])
    try {
      atomicWriteFileSync(file, `${JSON.stringify({ version: 2, projects })}\n`, {
        expectedHash,
        mode: 0o600,
      })
      return
    } catch (error) {
      if (attempt === 1) throw error
    }
  }
}
