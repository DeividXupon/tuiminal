import { registerTerminalResource } from "./terminal-resources"

export type CodexActivity = "thinking" | "running" | "updating" | "coding"
export type CodexAgentState = "working" | "blocked" | "done" | "failed"

export type CodexAppServerEvents = {
  onActivity: (activity: CodexActivity) => void
  onState: (state: CodexAgentState) => void
  onOutput: (text: string) => void
  onError: (message: string) => void
  onExit: (code: number) => void
}

export type CodexAppServerHandle = {
  pid: number
  write: (data: string | Uint8Array) => void
  resize: (_columns: number, _rows: number) => void
  stop: () => Promise<void>
}

type JsonRecord = Record<string, unknown>
type PendingApproval = { id: number; method: string }

const encoder = new TextEncoder()
const decoder = new TextDecoder()

function object(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null
}

function text(value: unknown) {
  return typeof value === "string" ? value : ""
}

function notificationActivity(message: JsonRecord): CodexActivity | null {
  const method = text(message.method)
  if (method === "item/plan/delta") return "updating"
  if (method === "item/fileChange/patchUpdated") return "coding"
  if (method !== "item/started") return null
  const params = object(message.params)
  const item = object(params?.item)
  switch (text(item?.type)) {
    case "reasoning":
      return "thinking"
    case "commandExecution":
      return "running"
    case "fileChange":
      return "coding"
    case "plan":
      return "updating"
    default:
      return null
  }
}

function publicOutput(message: JsonRecord) {
  if (message.method === "item/agentMessage/delta") return text(object(message.params)?.delta)
  if (message.method !== "item/started") return ""
  const item = object(object(message.params)?.item)
  if (text(item?.type) === "commandExecution") {
    const command = text(item?.command)
    return command ? `\r\n›_ ${command}\r\n` : ""
  }
  if (text(item?.type) === "fileChange") return "\r\n{} Código atualizado\r\n"
  return ""
}

function approvalPrompt(message: JsonRecord) {
  const params = object(message.params)
  const command = text(params?.command)
  if (message.method === "item/commandExecution/requestApproval")
    return `\r\n! Aprovação necessária${command ? `: ${command}` : ""}\r\n[y] permitir uma vez · [n] recusar\r\n`
  if (message.method === "item/fileChange/requestApproval")
    return "\r\n! Aprovação necessária para alterar arquivos\r\n[y] permitir uma vez · [n] recusar\r\n"
  return "\r\n! O Codex precisa da sua resposta\r\n"
}

function approvalResponse(method: string, accepted: boolean) {
  if (
    method === "item/commandExecution/requestApproval" ||
    method === "item/fileChange/requestApproval"
  )
    return { decision: accepted ? "accept" : "decline" }
  if (method === "execCommandApproval")
    return accepted
      ? { decision: "approved" }
      : { decision: { denied: { rejection: "Recusado no Tuiminal." } } }
  if (method === "applyPatchApproval")
    return accepted
      ? { decision: "approved" }
      : { decision: { denied: { rejection: "Recusado no Tuiminal." } } }
  return { decision: "decline" }
}

/**
 * A deliberately small JSON-RPC client for the locally installed Codex
 * app-server. It forwards public tool and assistant events, never reasoning
 * text, and leaves every approval decision to the person at the terminal.
 */
export function startCodexAppServer(
  prompt: string,
  cwd: string,
  events: CodexAppServerEvents,
): CodexAppServerHandle {
  const subprocess = Bun.spawn(["codex", "app-server", "--stdio"], {
    cwd,
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  })
  let requestId = 0
  let initializeId: number | null = null
  let threadId: string | null = null
  let input = ""
  let pendingApproval: PendingApproval | null = null
  let stopped = false
  let released = false
  let buffer = ""

  const release = () => {
    if (released) return
    released = true
    unregister()
  }
  const send = (method: string, params: JsonRecord) => {
    const id = ++requestId
    return Promise.resolve(
      subprocess.stdin.write(encoder.encode(`${JSON.stringify({ method, id, params })}\n`)),
    ).then(() => id)
  }
  const sendResponse = (id: number, result: JsonRecord) =>
    Promise.resolve(subprocess.stdin.write(encoder.encode(`${JSON.stringify({ id, result })}\n`)))
  const startTurn = () => {
    const next = input.trim()
    input = ""
    if (!next || !threadId) return
    events.onActivity("thinking")
    events.onState("working")
    void send("turn/start", {
      threadId,
      input: [{ type: "text", text: next, text_elements: [] }],
    }).catch((error: unknown) => events.onError(String(error)))
  }
  const answerApproval = (accepted: boolean) => {
    const approval = pendingApproval
    if (!approval) return false
    pendingApproval = null
    events.onState("working")
    events.onActivity("thinking")
    void sendResponse(approval.id, approvalResponse(approval.method, accepted)).catch(
      (error: unknown) => events.onError(String(error)),
    )
    return true
  }
  const handleEvent = (message: JsonRecord) => {
    const method = text(message.method)
    if (method === "turn/completed") {
      const turn = object(object(message.params)?.turn)
      if (text(turn?.status) === "failed") {
        events.onState("failed")
        events.onError(text(object(turn?.error)?.message) || "O Codex não concluiu a tarefa.")
      } else events.onState("done")
      return
    }
    if (
      method.endsWith("requestApproval") ||
      method === "execCommandApproval" ||
      method === "applyPatchApproval"
    ) {
      if (typeof message.id === "number") {
        pendingApproval = { id: message.id, method }
        events.onState("blocked")
        events.onOutput(approvalPrompt(message))
      }
      return
    }
    const activity = notificationActivity(message)
    if (activity) {
      events.onState("working")
      events.onActivity(activity)
    }
    const output = publicOutput(message)
    if (output) events.onOutput(output)
  }
  const consumeLine = (line: string) => {
    let message: JsonRecord | null = null
    try {
      message = object(JSON.parse(line))
    } catch {
      return
    }
    if (!message) return
    const result = object(message.result)
    if (result && message.id === initializeId) {
      void send("thread/start", { cwd, approvalPolicy: "on-request" }).catch((error: unknown) =>
        events.onError(error instanceof Error ? error.message : String(error)),
      )
    }
    if (result && !threadId) {
      const thread = object(result.thread)
      if (thread && text(thread.id)) {
        threadId = text(thread.id)
        startTurn()
      }
    }
    handleEvent(message)
  }
  const read = async () => {
    const reader = subprocess.stdout.getReader()
    try {
      while (!stopped) {
        const next = await reader.read()
        if (next.done) break
        buffer += decoder.decode(next.value, { stream: true })
        let newline = buffer.indexOf("\n")
        while (newline >= 0) {
          consumeLine(buffer.slice(0, newline))
          buffer = buffer.slice(newline + 1)
          newline = buffer.indexOf("\n")
        }
      }
    } catch (error) {
      if (!stopped) events.onError(String(error))
    } finally {
      reader.releaseLock()
    }
  }
  const readErrors = async () => {
    const reader = subprocess.stderr.getReader()
    let errorOutput = ""
    try {
      while (!stopped) {
        const next = await reader.read()
        if (next.done) break
        errorOutput += decoder.decode(next.value, { stream: true })
      }
    } finally {
      reader.releaseLock()
      if (!stopped && errorOutput.trim()) events.onError(errorOutput.trim())
    }
  }
  const handle: CodexAppServerHandle = {
    pid: subprocess.pid,
    write(data) {
      const value = typeof data === "string" ? data : decoder.decode(data)
      for (const character of value) {
        if (character === "\r" || character === "\n") {
          events.onOutput("\r\n")
          if (pendingApproval && /^[yn]$/i.test(input.trim()))
            answerApproval(/^y$/i.test(input.trim()))
          else startTurn()
          continue
        }
        if (character === "\u0003") continue
        if (character === "\b" || character === "\u007f") {
          input = [...input].slice(0, -1).join("")
          events.onOutput("\b \b")
          continue
        }
        input += character
        events.onOutput(character)
      }
    },
    resize() {},
    async stop() {
      if (stopped) return
      stopped = true
      try {
        subprocess.kill()
        await subprocess.exited
      } finally {
        release()
      }
    },
  }
  const unregister = registerTerminalResource(handle)
  void read()
  void readErrors()
  void subprocess.exited.then((code) => {
    release()
    if (!stopped) {
      if (code !== 0) events.onError(`O app-server do Codex encerrou (código ${code}).`)
      events.onExit(code)
    }
  })
  events.onOutput("\u001bcCodex · app-server\r\n\r\n")
  events.onState("working")
  events.onActivity("thinking")
  void send("initialize", {
    clientInfo: { name: "tuiminal", title: "Tuiminal", version: "0.2.0" },
    capabilities: { experimentalApi: false, requestAttestation: false },
  })
    .then((id) => {
      initializeId = id
    })
    .catch((error: unknown) =>
      events.onError(error instanceof Error ? error.message : String(error)),
    )
  input = prompt
  return handle
}

export function codexAppServerActivity(message: unknown): CodexActivity | null {
  const parsed = object(message)
  return parsed ? notificationActivity(parsed) : null
}
