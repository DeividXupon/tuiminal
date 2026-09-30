import type {
  AgentMessageFileChange,
  AgentMessageHistoryEntry,
} from "../model/agent-message-history"
import type { OpenCodeHydration } from "./opencode-api"
import {
  openCodeObject as object,
  openCodeMessageHistory,
  parseOpenCodeFileDiffs,
  parseOpenCodeSessions,
} from "./opencode-api"
import { type OpenCodeServerProtocol, readOpenCodeJsonResponse } from "./opencode-protocol"

export function openCodeApiUrl(
  baseUrl: string,
  pathname: string,
  directory: string | undefined,
  query = {},
) {
  const url = new URL(pathname, baseUrl)
  if (directory) url.searchParams.set("directory", directory)
  for (const [key, value] of Object.entries(query))
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value))
  return url
}

export async function fetchOpenCodeJson(
  baseUrl: string,
  pathname: string,
  directory: string | undefined,
  signal: AbortSignal,
  query: Record<string, string | number | undefined> = {},
  authorization?: string,
) {
  const timeout = AbortSignal.timeout(15_000)
  const boundedSignal = AbortSignal.any([signal, timeout])
  try {
    const response = await fetch(openCodeApiUrl(baseUrl, pathname, directory, query), {
      ...(authorization ? { headers: { authorization } } : {}),
      signal: boundedSignal,
    })
    return await readOpenCodeJsonResponse(response)
  } catch (error) {
    if (!signal.aborted && timeout.aborted)
      throw new Error("A consulta à API do OpenCode excedeu o tempo limite.")
    throw error
  }
}

export async function listOpenCodeSessions(
  baseUrl: string,
  directory: string | undefined,
  signal: AbortSignal,
  protocol: OpenCodeServerProtocol = "v1",
  authorization?: string,
) {
  const pathname = protocol === "v2" ? "/api/session" : "/session"
  return parseOpenCodeSessions(
    await fetchOpenCodeJson(
      baseUrl,
      pathname,
      directory,
      signal,
      protocol === "v2"
        ? { parentID: "null", limit: 100, order: "desc" }
        : { roots: "true", limit: 100 },
      authorization,
    ),
  )
}

function openCodeMessagePageUrl(
  baseUrl: string,
  directory: string,
  sessionId: string,
  protocol: OpenCodeServerProtocol,
  cursor: string | undefined,
) {
  const query = cursor ? { cursor } : protocol === "v2" ? { order: "asc" } : {}
  return openCodeApiUrl(
    baseUrl,
    `${protocol === "v2" ? "/api" : ""}/session/${encodeURIComponent(sessionId)}/message`,
    protocol === "v2" ? undefined : directory,
    query,
  )
}

export async function openCodeSessionMessages(
  baseUrl: string,
  directory: string,
  sessionId: string,
  signal: AbortSignal,
  protocol: OpenCodeServerProtocol,
  authorization?: string,
) {
  const messages: unknown[] = []
  let cursor: string | undefined
  for (let page = 0; page < 20; page++) {
    const response = await fetch(
      openCodeMessagePageUrl(baseUrl, directory, sessionId, protocol, cursor),
      {
        ...(authorization ? { headers: { authorization } } : {}),
        signal,
      },
    )
    const value = await readOpenCodeJsonResponse(response)
    const record = object(value)
    const data = Array.isArray(record?.data) ? record.data : Array.isArray(value) ? value : []
    messages.push(...data)
    const next = response.headers.get("x-next-cursor") ?? object(record?.cursor)?.next
    if (typeof next !== "string" || !next) break
    cursor = next
  }
  return messages
}

export async function openCodeMessageDiffs(
  baseUrl: string,
  directory: string,
  sessionId: string,
  messages: readonly unknown[],
  signal: AbortSignal,
  protocol: OpenCodeServerProtocol,
  previous: ReadonlyMap<string, readonly AgentMessageFileChange[]> = new Map(),
  authorization?: string,
) {
  const users = messages.flatMap((value): string[] => {
    const record = object(value)
    const info = object(record?.info) ?? record
    return info?.role === "user" && typeof info.id === "string" ? [info.id] : []
  })
  const diffs = new Map(previous)
  if (protocol === "v2") {
    for (const value of messages) {
      const record = object(value)
      const info = object(record?.info) ?? record
      if (info?.role !== "user" || typeof info.id !== "string") continue
      const summary = object(info.summary)
      if (!Array.isArray(summary?.diffs)) continue
      diffs.set(info.id, parseOpenCodeFileDiffs(summary.diffs, info.id))
    }
    return diffs
  }
  const pending = users.filter((messageId) => !diffs.has(messageId))
  for (let offset = 0; offset < pending.length; offset += 8) {
    await Promise.all(
      pending.slice(offset, offset + 8).map(async (messageId) => {
        signal.throwIfAborted()
        try {
          const value = await fetchOpenCodeJson(
            baseUrl,
            `/session/${encodeURIComponent(sessionId)}/diff`,
            directory,
            signal,
            { messageID: messageId },
            authorization,
          )
          diffs.set(messageId, parseOpenCodeFileDiffs(value, messageId))
        } catch {
          // Diff support varies by OpenCode version; transcript hydration remains useful.
        }
      }),
    )
  }
  return diffs
}

export function openCodeStatusState(value: unknown, sessionId: string) {
  const response = object(value)
  const statuses = object(response?.data) ?? response
  const status = object(statuses?.[sessionId])
  if (!status) return null
  return status?.type === "busy" || status?.type === "retry" || status?.type === "running"
    ? ("working" as const)
    : ("idle" as const)
}

export function hydratedOpenCodeState(
  current: OpenCodeHydration["state"],
  observed: "working" | "idle",
  waitingOnApproval: boolean,
  latestStatus: AgentMessageHistoryEntry["status"] | undefined,
) {
  if (waitingOnApproval) return "blocked" as const
  if (observed === "working") return "working" as const
  if (latestStatus === "completed") return "done" as const
  if (latestStatus === "failed" || latestStatus === "interrupted") return "unknown" as const
  if (current === "done" || current === "unknown") return current
  return "idle" as const
}

export { openCodeMessageHistory }
