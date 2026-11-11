import { useRenderer } from "@opentui/react"
import { useCallback, useEffect, useRef, useState } from "react"
import { agentFilePrompt } from "../model/agent-file-drop"
import { isRemoteAgentSession, type RemoteServerProfile } from "../model/sessions"
import { type AgentDroppedFile, inspectAgentFileDrop } from "../services/agent-file-drop"
import { uploadRemoteAgentFile } from "../services/remote-agent-upload"
import { useAgentFilePaste } from "./use-agent-file-paste"
import type { useTerminalSessions } from "./use-terminal-sessions"

type Terminal = Pick<
  ReturnType<typeof useTerminalSessions>,
  | "sessionsRef"
  | "activeSessionRef"
  | "processHandles"
  | "terminalRefs"
  | "focusTerminal"
  | "terminalInput"
  | "activateSession"
>

export type RemoteAgentFilesState = {
  profile: RemoteServerProfile
  files: readonly AgentDroppedFile[]
  completed: readonly AgentDroppedFile[]
  phase: "checking" | "confirm" | "uploading" | "error"
  transferred: number
  error?: string | undefined
}
type Owner = {
  abort: AbortController
  id: string
  startedAt: number
  handle: NonNullable<ReturnType<Terminal["processHandles"]["current"]["get"]>>
  view: NonNullable<ReturnType<Terminal["terminalRefs"]["current"]["get"]>>
  state: RemoteAgentFilesState
}

export function useRemoteAgentFiles(terminal: Terminal, active: boolean) {
  const renderer = useRenderer()
  const latest = useRef({ terminal, active })
  latest.current = { terminal, active }
  const [state, setState] = useState<RemoteAgentFilesState | null>(null)
  const operation = useRef<Owner | null>(null)
  const eligible = (id: string | null) => {
    if (!latest.current.active) return undefined
    return latest.current.terminal.sessionsRef.current.find(
      (session) =>
        session.id === id && session.status === "running" && isRemoteAgentSession(session),
    )
  }
  const focused = () => {
    const session = eligible(latest.current.terminal.activeSessionRef.current)
    return renderer.currentFocusedRenderable?.id === `term-agents-${session?.id}`
      ? session
      : undefined
  }
  const valid = (owner: Owner) => {
    const { terminal, active } = latest.current
    return (
      active &&
      operation.current === owner &&
      !owner.abort.signal.aborted &&
      terminal.activeSessionRef.current === owner.id &&
      terminal.processHandles.current.get(owner.id) === owner.handle &&
      terminal.terminalRefs.current.get(owner.id) === owner.view &&
      eligible(owner.id)?.startedAt === owner.startedAt
    )
  }
  const publish = (owner: Owner, update: Partial<RemoteAgentFilesState>) => {
    owner.state = { ...owner.state, ...update }
    setState(owner.state)
  }
  const close = (restore = true) => {
    const owner = operation.current
    if (!owner) return
    operation.current = null
    owner.abort.abort()
    setState(null)
    if (
      restore &&
      latest.current.active &&
      latest.current.terminal.activeSessionRef.current === owner.id
    )
      latest.current.terminal.focusTerminal(owner.id)
  }
  const begin = (id: string | null) => {
    if (operation.current) return null
    const session = eligible(id)
    if (!session) return null
    const { terminal } = latest.current
    const handle = terminal.processHandles.current.get(session.id)
    const view = terminal.terminalRefs.current.get(session.id)
    const profile = session.agentLaunch?.remote?.profile
    if (!handle || !view || !profile) return null
    const owner: Owner = {
      abort: new AbortController(),
      id: session.id,
      startedAt: session.startedAt,
      handle,
      view,
      state: { profile, files: [], completed: [], phase: "confirm", transferred: 0 },
    }
    operation.current = owner
    return owner
  }
  const busy = () => ["checking", "uploading"].includes(operation.current?.state.phase ?? "")
  const add = async (text: string, replay = false) => {
    const owner = operation.current
    if (!owner || busy()) return
    publish(owner, { phase: "checking", error: undefined })
    const files = await inspectAgentFileDrop(text)
    if (!valid(owner)) return
    if (!files && replay) {
      owner.handle.write(owner.view.encodePaste(Buffer.from(text)))
      close()
      return
    }
    if (!files) {
      publish(owner, {
        phase: "error",
        error: "Escolha arquivos locais válidos ou cole seus caminhos completos.",
      })
      return
    }
    const unique = new Map(owner.state.files.map((file) => [file.path, file]))
    for (const file of files) unique.set(file.path, file)
    if (unique.size + owner.state.completed.length > 20) {
      publish(owner, { phase: "error", error: "Selecione até 20 arquivos por envio." })
      return
    }
    publish(owner, { files: [...unique.values()], phase: "confirm", transferred: 0 })
  }
  const openCurrent = (id?: string) => {
    const owner = begin(id ?? latest.current.terminal.activeSessionRef.current)
    if (!owner) return
    latest.current.terminal.activateSession(owner.id)
    // Session activation queues PTY focus; mount the modal after that handoff.
    queueMicrotask(() => {
      if (valid(owner)) setState(owner.state)
    })
  }
  const openRef = useRef(openCurrent)
  openRef.current = openCurrent
  const open = useCallback((id?: string) => openRef.current(id), [])
  useAgentFilePaste({
    enabled: () =>
      Boolean(focused()) ||
      Boolean(
        operation.current &&
          renderer.currentFocusedRenderable?.id.startsWith("terminal-agent-files-") &&
          renderer.currentFocusedRenderable.id !== "terminal-agent-files-path",
      ),
    busy,
    paste: (text) => {
      if (operation.current) {
        void add(text)
        return
      }
      const session = focused()
      if (session && begin(session.id)) void add(text, true)
    },
    replay: (keys) => {
      const session = focused()
      if (!session) return
      const view = terminal.terminalRefs.current.get(session.id)
      if (view) for (const key of keys) terminal.terminalInput(session.id, view.encodeKey(key))
    },
  })
  const confirm = async () => {
    const owner = operation.current
    if (!owner || busy() || !owner.state.files.length || !valid(owner)) return
    publish(owner, { phase: "uploading", error: undefined, transferred: 0 })
    try {
      for (const file of owner.state.files) {
        const path = await uploadRemoteAgentFile(owner.state.profile, file, owner.abort.signal, {
          onProgress: (bytes) => {
            if (valid(owner)) publish(owner, { transferred: bytes })
          },
        })
        if (!valid(owner)) return
        owner.handle.write(owner.view.encodePaste(Buffer.from(agentFilePrompt([path]))))
        publish(owner, {
          files: owner.state.files.slice(1),
          completed: [...owner.state.completed, file],
          transferred: 0,
        })
      }
      close()
    } catch (error) {
      if (valid(owner))
        publish(owner, {
          phase: "error",
          transferred: 0,
          error:
            error instanceof Error
              ? error.message
              : "Não foi possível enviar o arquivo ao servidor.",
        })
    }
  }
  const remove = (path: string) => {
    const owner = operation.current
    if (!owner || busy()) return
    publish(owner, {
      files: owner.state.files.filter((file) => file.path !== path),
      phase: "confirm",
      error: undefined,
    })
  }
  useEffect(() => {
    const owner = operation.current
    if (owner && !valid(owner)) close(false)
  })
  useEffect(
    () => () => {
      operation.current?.abort.abort()
      operation.current = null
    },
    [],
  )
  return {
    state,
    open,
    canOpen: (id: string | null) => Boolean(eligible(id)),
    busy: () => Boolean(operation.current),
    confirm: () => {
      void confirm()
    },
    cancel: () => close(),
    add: (text: string) => {
      void add(text)
    },
    remove,
  }
}
