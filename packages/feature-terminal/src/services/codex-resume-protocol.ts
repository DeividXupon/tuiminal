import {
  AGENT_RESUME_PAGE_SIZE,
  AGENT_RESUME_SOURCE_LIMIT,
  agentResumeTimestamp,
  compareAgentResumeThreads,
} from "../model/agent-resume-thread"
import type { CodexResumeThread } from "../model/codex-resume-threads"

type RecordValue = Record<string, unknown>

function object(value: unknown): RecordValue | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as RecordValue) : null
}

function cleanThreadText(value: unknown, limit: number) {
  if (typeof value !== "string") return ""
  return [
    ...value
      .replace(/[\p{Cc}\u202a-\u202e\u2066-\u2069]+/gu, " ")
      .replace(/\s+/g, " ")
      .trim(),
  ]
    .slice(0, limit)
    .join("")
}

function threadProjectName(cwd: string) {
  const path = cwd.replace(/[\\/]+$/g, "")
  if (!path) return cwd
  return path.slice(Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")) + 1)
}

function threadState(value: unknown): CodexResumeThread["state"] {
  const status = object(value)
  if (status?.type === "systemError") return "failed"
  if (status?.type !== "active") return "idle"
  return Array.isArray(status.activeFlags) && status.activeFlags.includes("waitingOnApproval")
    ? "blocked"
    : "working"
}

function responseFromItems(value: unknown) {
  if (!Array.isArray(value)) return ""
  const messages = value
    .map(object)
    .filter(
      (item): item is RecordValue =>
        item !== null && item.type === "agentMessage" && typeof item.text === "string",
    )
  const final = messages.filter((item) => item.phase === "final_answer").at(-1)
  return cleanThreadText((final ?? messages.at(-1))?.text, 1_000)
}

/** Extracts the latest public Codex response from newest-first full turns. */
export function codexResumeLastResponse(message: unknown) {
  const data = object(object(message)?.result)?.data
  if (!Array.isArray(data)) return ""
  for (const value of data) {
    const response = responseFromItems(object(value)?.items)
    if (response) return response
  }
  return ""
}

/** Parses the same public thread summaries used by the Codex `/resume` picker. */
export function codexResumeThreads(
  message: unknown,
  remoteProfileId?: string,
  remoteProfileName?: string,
): CodexResumeThread[] {
  const result = object(object(message)?.result)
  if (!Array.isArray(result?.data)) return []
  return result.data
    .flatMap((value): CodexResumeThread[] => {
      const thread = object(value)
      if (typeof thread?.id !== "string") return []
      const preview = cleanThreadText(thread.preview, 240)
      const name = cleanThreadText(thread.name, 120)
      const cwd =
        typeof thread.cwd === "string" &&
        thread.cwd.length <= 4_096 &&
        !/[\p{Cc}\p{Cf}]/u.test(thread.cwd)
          ? thread.cwd
          : ""
      const updatedAt =
        typeof thread.recencyAt === "number"
          ? agentResumeTimestamp(thread.recencyAt)
          : typeof thread.updatedAt === "number"
            ? agentResumeTimestamp(thread.updatedAt)
            : 0
      return [
        {
          id: thread.id,
          title: name || preview || "Codex",
          preview,
          lastResponse: "",
          cwd,
          projectName: threadProjectName(cwd),
          gitBranch: cleanThreadText(object(thread.gitInfo)?.branch, 160),
          updatedAt,
          state: threadState(thread.status),
          ...(remoteProfileId ? { remoteProfileId } : {}),
          ...(remoteProfileName ? { remoteProfileName } : {}),
        },
      ]
    })
    .sort(compareAgentResumeThreads)
    .slice(0, AGENT_RESUME_SOURCE_LIMIT)
}

export function codexResumeNextCursor(message: unknown) {
  const cursor = object(object(message)?.result)?.nextCursor
  return typeof cursor === "string" && cursor.length <= 4_096 ? cursor : null
}

export function resumeListFrame(
  id: string,
  options: { cursor?: string | null; limit?: number } = {},
) {
  return JSON.stringify({
    id,
    method: "thread/list",
    params: {
      cursor: options.cursor ?? null,
      limit: Math.max(
        1,
        Math.min(AGENT_RESUME_SOURCE_LIMIT, Math.floor(options.limit ?? AGENT_RESUME_PAGE_SIZE)),
      ),
      sortKey: "recency_at",
      sortDirection: "desc",
      sourceKinds: ["cli", "vscode", "appServer"],
    },
  })
}

export function resumeTurnsFrame(id: string, threadId: string) {
  return JSON.stringify({
    id,
    method: "thread/turns/list",
    params: {
      threadId,
      cursor: null,
      limit: 10,
      sortDirection: "desc",
      itemsView: "full",
    },
  })
}
