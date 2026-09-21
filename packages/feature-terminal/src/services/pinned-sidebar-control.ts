import { chmod, unlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createConnection, createServer } from "node:net"
import { isTerminalMasterKey } from "@xupon/tuiminal-core/settings/theme"
import type { PinnedTerminalSelection, PinnedTerminalSidebarReplica } from "../model/pinned-sidebar"

const MAX_MESSAGE_BYTES = 4096

function validTarget(value: unknown): value is PinnedTerminalSelection {
  if (!value || typeof value !== "object") return false
  const target = value as Partial<PinnedTerminalSelection> & {
    socket?: string
    paneId?: string
    sessionId?: string
    folderId?: string
    action?: string
  }
  const validId = (id: string | undefined) =>
    Boolean(id && id.length <= 200 && !/[\p{Cc}\u202a-\u202e\u2066-\u2069]/u.test(id))
  return Boolean(
    (target.socket?.startsWith("/") && /^%\d+$/.test(target.paneId ?? "")) ||
      validId(target.sessionId) ||
      validId(target.folderId) ||
      validId(target.action),
  )
}

function respondToSidebarRequest(
  socket: { end: (data: string) => void },
  source: string,
  onTarget: (target: PinnedTerminalSelection) => void,
  snapshot: () => PinnedTerminalSidebarReplica | null,
) {
  try {
    const message: unknown = JSON.parse(source)
    if (!message || typeof message !== "object") throw new Error("Invalid sidebar message")
    const request = message as { type?: unknown; target?: unknown }
    if (request.type === "ping") return socket.end(`${JSON.stringify({ ok: true })}\n`)
    if (request.type === "snapshot")
      return socket.end(`${JSON.stringify({ ok: true, snapshot: snapshot() })}\n`)
    if (request.type !== "activate" || !validTarget(request.target))
      throw new Error("Invalid terminal target")
    onTarget(request.target)
    socket.end(`${JSON.stringify({ ok: true })}\n`)
  } catch {
    socket.end("error\n")
  }
}

export async function openPinnedSidebarControl(
  onTarget: (target: PinnedTerminalSelection) => void,
  snapshot: () => PinnedTerminalSidebarReplica | null,
) {
  if (process.platform === "win32") return null
  const endpoint = join(tmpdir(), `tuiminal-sidebar-${process.pid}.sock`)
  await unlink(endpoint).catch(() => undefined)
  const server = createServer((socket) => {
    let source = ""
    let handled = false
    socket.setEncoding("utf8")
    socket.on("data", (chunk) => {
      if (handled) return
      source += chunk
      if (Buffer.byteLength(source) > MAX_MESSAGE_BYTES) {
        handled = true
        socket.destroy()
        return
      }
      const newline = source.indexOf("\n")
      if (newline < 0) return
      handled = true
      respondToSidebarRequest(socket, source.slice(0, newline), onTarget, snapshot)
    })
  })
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject)
      server.listen(endpoint, () => {
        server.off("error", reject)
        resolve()
      })
    })
    await chmod(endpoint, 0o600)
  } catch (error) {
    try {
      server.close()
    } catch {
      // The listen failure can leave the server unopened.
    }
    await unlink(endpoint).catch(() => undefined)
    throw error
  }
  server.on("error", () => undefined)
  let closed = false
  return {
    endpoint,
    async close() {
      if (closed) return
      closed = true
      await new Promise<void>((resolve) => server.close(() => resolve()))
      await unlink(endpoint).catch(() => undefined)
    },
  }
}

function requestControl(endpoint: string, request: object) {
  return new Promise<unknown>((resolve) => {
    let settled = false
    let source = ""
    const finish = (response: unknown) => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve(response)
    }
    const socket = createConnection(endpoint)
    socket.setEncoding("utf8")
    socket.setTimeout(600)
    socket.once("connect", () => socket.write(`${JSON.stringify(request)}\n`))
    socket.on("data", (data) => {
      source += data
      if (Buffer.byteLength(source) > 1024 * 1024) return finish(null)
      const newline = source.indexOf("\n")
      if (newline < 0) return
      try {
        finish(JSON.parse(source.slice(0, newline)))
      } catch {
        finish(null)
      }
    })
    socket.once("timeout", () => finish(null))
    socket.once("error", () => finish(null))
    socket.once("close", () => finish(null))
  })
}

export async function sendPinnedSidebarTarget(endpoint: string, target: PinnedTerminalSelection) {
  const response = (await requestControl(endpoint, { type: "activate", target })) as {
    ok?: unknown
  } | null
  return response?.ok === true
}

export async function requestPinnedSidebarSnapshot(endpoint: string) {
  const response = (await requestControl(endpoint, { type: "snapshot" })) as {
    ok?: unknown
    snapshot?: unknown
  } | null
  if (response?.ok !== true || !response.snapshot || typeof response.snapshot !== "object")
    return null
  const snapshot = response.snapshot as Partial<PinnedTerminalSidebarReplica>
  if (
    !Array.isArray(snapshot.sessions) ||
    !Array.isArray(snapshot.folders) ||
    !Array.isArray(snapshot.collapsedFolderIds) ||
    !snapshot.collapsedFolderIds.every((id) => typeof id === "string") ||
    typeof snapshot.selectedFolder !== "string" ||
    (snapshot.activeSessionId !== null && typeof snapshot.activeSessionId !== "string") ||
    !isTerminalMasterKey(snapshot.masterKey) ||
    !snapshot.theme ||
    typeof snapshot.theme !== "object" ||
    !Object.values(snapshot.theme).every((value) => typeof value === "string") ||
    typeof snapshot.language !== "string"
  )
    return null
  return snapshot as PinnedTerminalSidebarReplica
}

export async function pinnedSidebarControlAvailable(endpoint: string) {
  const response = (await requestControl(endpoint, { type: "ping" })) as {
    ok?: unknown
  } | null
  return response?.ok === true
}
