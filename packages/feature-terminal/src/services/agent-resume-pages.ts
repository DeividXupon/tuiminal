import type { TerminalRemoteCodexProfile } from "@xupon/tuiminal-core/settings/theme"
import type { AgentProviderId } from "../model/agent-provider"
import { AGENT_RESUME_PAGE_SIZE } from "../model/agent-resume-thread"
import { loadRemoteClaudeResumeThreadsPage } from "./claude-background"
import { loadLocalClaudeResumeThreadsPage } from "./claude-local-resume"
import { loadClaudeResumeThreadsPage } from "./claude-resume-store"
import { loadCodexResumeThreadsPage, loadRemoteCodexResumeThreadsPage } from "./codex-app-server"
import {
  loadOpenCodeResumeThreadsPage,
  loadRemoteOpenCodeResumeThreadsPage,
} from "./opencode-server"
import { TERM_AGENTS_WORKING_DIRECTORY } from "./terminal"

type Origin = "local" | "remote"
export type SourceKey = `${AgentProviderId}:${Origin}`
export type SourcePage = { cursor: string | null; hasMore: boolean; failed?: boolean }
export type SourcePages = Record<SourceKey, SourcePage>
type UpdateSource = (key: SourceKey, next: Partial<SourcePage>) => void

export function initialLimits(limit = AGENT_RESUME_PAGE_SIZE) {
  return {
    codex: limit,
    claude: limit,
    opencode: limit,
  }
}

export function initialSources(): SourcePages {
  return {
    "codex:local": { cursor: null, hasMore: true },
    "codex:remote": { cursor: null, hasMore: true },
    "claude:local": { cursor: null, hasMore: true },
    "claude:remote": { cursor: null, hasMore: true },
    "opencode:local": { cursor: null, hasMore: true },
    "opencode:remote": { cursor: null, hasMore: true },
  }
}

export function codexLoadMoreTasks(
  pages: SourcePages,
  profile: TerminalRemoteCodexProfile | undefined,
  signal: AbortSignal,
  update: UpdateSource,
) {
  const tasks: Promise<void>[] = []
  const local = pages["codex:local"]
  if (local.hasMore)
    tasks.push(
      loadCodexResumeThreadsPage(TERM_AGENTS_WORKING_DIRECTORY, signal, {
        append: true,
        cursor: local.cursor,
      }).then((page) => update("codex:local", { cursor: page.nextCursor, hasMore: page.hasMore })),
    )
  const remote = pages["codex:remote"]
  if (profile && remote.hasMore)
    tasks.push(
      loadRemoteCodexResumeThreadsPage(profile, signal, {
        append: true,
        cursor: remote.cursor,
      }).then((page) => update("codex:remote", { cursor: page.nextCursor, hasMore: page.hasMore })),
    )
  return tasks
}

export function openCodeLoadMoreTasks(
  pages: SourcePages,
  profile: TerminalRemoteCodexProfile | undefined,
  signal: AbortSignal,
  target: number,
  update: UpdateSource,
) {
  const tasks: Promise<void>[] = []
  if (pages["opencode:local"].hasMore)
    tasks.push(
      loadOpenCodeResumeThreadsPage(TERM_AGENTS_WORKING_DIRECTORY, signal, target).then((page) =>
        update("opencode:local", { hasMore: page.hasMore }),
      ),
    )
  if (profile && pages["opencode:remote"].hasMore)
    tasks.push(
      loadRemoteOpenCodeResumeThreadsPage(profile, signal, target).then((page) =>
        update("opencode:remote", { hasMore: page.hasMore }),
      ),
    )
  return tasks
}

export function claudeLoadMoreTasks(
  pages: SourcePages,
  profile: TerminalRemoteCodexProfile | undefined,
  signal: AbortSignal,
  target: number,
  update: UpdateSource,
  officialLocal = false,
) {
  const tasks: Promise<void>[] = []
  if (pages["claude:local"].hasMore)
    tasks.push(
      (officialLocal
        ? loadLocalClaudeResumeThreadsPage(signal, target)
        : Promise.resolve(loadClaudeResumeThreadsPage(target))
      ).then((page) => update("claude:local", { hasMore: page.hasMore })),
    )
  if (profile && pages["claude:remote"].hasMore)
    tasks.push(
      loadRemoteClaudeResumeThreadsPage(profile, signal, target).then((page) =>
        update("claude:remote", { hasMore: page.hasMore }),
      ),
    )
  return tasks
}
