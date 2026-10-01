import { useCallback, useEffect, useRef, useState } from "react"
import type { RemoteCodexCompatibilityReport } from "../model/remote-codex"
import {
  DEFAULT_FOLDER,
  type FreeTerminalCommand,
  MAX_SESSIONS,
  type TerminalPlacement,
  type TerminalSession,
} from "../model/sessions"
import {
  preflightRemoteCodex,
  RemoteCodexCompatibilityError,
} from "../services/remote-codex-handshake"
import { preflightClaude } from "../services/claude-compatibility"
import { preflightLocalCodex } from "../services/local-codex-compatibility"
import {
  preflightLocalOpenCode,
  preflightRemoteOpenCode,
} from "../services/remote-opencode-compatibility"
import { createRemoteAgentUpdateCommands } from "../services/terminal"

export type RemoteCodexCompatibilityPrompt = {
  command: FreeTerminalCommand
  report: RemoteCodexCompatibilityReport
}

type UpdateFlow = RemoteCodexCompatibilityPrompt & {
  id: number
  sessionIds: readonly string[]
}

function originalAgentCommand(session: TerminalSession): FreeTerminalCommand {
  return {
    kind: session.kind,
    label: session.label,
    shortLabel: session.shortLabel,
    displayCommand: session.displayCommand,
    command: session.command,
    accent: session.accent,
    ...(session.workingDirectory ? { workingDirectory: session.workingDirectory } : {}),
    ...(session.agentLaunch ? { agentLaunch: session.agentLaunch } : {}),
  }
}

async function preflightAgentCommand(command: FreeTerminalCommand, signal: AbortSignal) {
  const integration = command.agentLaunch
  if (!integration) return
  const remote = integration.remote
  if (integration.providerId === "claude") {
    await preflightClaude(
      {
        cwd: remote?.workingDirectory ?? command.workingDirectory ?? process.cwd(),
        ...(remote ? { remote } : {}),
      },
      signal,
    )
  } else if (integration.providerId === "opencode") {
    if (remote) await preflightRemoteOpenCode(remote.profile, signal)
    else await preflightLocalOpenCode(signal)
  } else if (remote) {
    await preflightRemoteCodex(remote.profile, remote.workingDirectory, signal)
  } else {
    await preflightLocalCodex(signal)
  }
}

export function useRemoteCodexCompatibilityFlow({
  sessions,
  launchCommand,
  launchOriginal,
  closeSession,
  updateSession,
  setNotice,
  onGuideOpened,
  onCancelled,
}: {
  sessions: readonly TerminalSession[]
  launchCommand: (command: FreeTerminalCommand, placement: TerminalPlacement) => string | undefined
  launchOriginal: (command: FreeTerminalCommand) => string | undefined
  closeSession: (id: string) => void
  updateSession: (id: string, update: Partial<TerminalSession>) => void
  setNotice: (message: string) => void
  onGuideOpened: () => void
  onCancelled: (command: FreeTerminalCommand | undefined) => void
}) {
  const [prompt, setPrompt] = useState<RemoteCodexCompatibilityPrompt | null>(null)
  const [updateFlow, setUpdateFlow] = useState<UpdateFlow | null>(null)
  const handledSessions = useRef(new Set<string>())
  const sequence = useRef(0)
  const validation = useRef<AbortController | null>(null)

  const showCompatibility = useCallback(
    (command: FreeTerminalCommand, report: RemoteCodexCompatibilityReport, sessionId: string) => {
      if (handledSessions.current.has(sessionId)) return
      handledSessions.current.add(sessionId)
      closeSession(sessionId)
      setPrompt({ command, report })
    },
    [closeSession],
  )

  useEffect(() => {
    for (const session of sessions) {
      if (session.remoteCodexCompatibility && !handledSessions.current.has(session.id))
        showCompatibility(
          originalAgentCommand(session),
          session.remoteCodexCompatibility,
          session.id,
        )
    }
  }, [sessions, showCompatibility])

  useEffect(
    () => () => {
      validation.current?.abort()
    },
    [],
  )

  const cancelPrompt = useCallback(() => {
    const command = prompt?.command
    setPrompt(null)
    onCancelled(command)
  }, [onCancelled, prompt])

  const openGuide = useCallback(() => {
    if (!prompt) return
    const remote = prompt.command.agentLaunch?.remote
    const requiredSessions = remote ? 2 : 1
    if (sessions.length > MAX_SESSIONS - requiredSessions) {
      setNotice(
        remote
          ? "São necessários dois terminais livres para o guia de atualização."
          : "É necessário um terminal livre para o guia de atualização.",
      )
      return
    }
    sequence.current += 1
    const id = sequence.current
    const sectionId = `remote-codex-update-${Date.now()}-${id}`
    const requestedProvider =
      prompt.command.agentLaunch?.providerId ?? prompt.report.providerId ?? "codex"
    const commands = createRemoteAgentUpdateCommands(
      id,
      remote?.profile,
      prompt.report,
      requestedProvider,
    )
    const sessionIds = commands.flatMap((command, index) => {
      const sessionId = launchCommand(command, {
        sectionId,
        folderId: DEFAULT_FOLDER,
        row: 0,
        column: index === 0 ? 0 : 1,
      })
      return sessionId ? [sessionId] : []
    })
    if (sessionIds.length !== commands.length) {
      for (const sessionId of sessionIds) closeSession(sessionId)
      setNotice("Não foi possível abrir o guia de atualização.")
      return
    }
    setUpdateFlow({ ...prompt, id, sessionIds })
    setPrompt(null)
    onGuideOpened()
  }, [closeSession, launchCommand, onGuideOpened, prompt, sessions.length, setNotice])

  const updateGuides = useCallback(
    (flow: UpdateFlow, report: RemoteCodexCompatibilityReport, checking: boolean, error = "") => {
      for (const sessionId of flow.sessionIds) {
        const session = sessions.find((candidate) => candidate.id === sessionId)
        if (!session?.remoteCodexUpdate) continue
        updateSession(sessionId, {
          remoteCodexUpdate: { ...session.remoteCodexUpdate, report, checking, error },
        })
      }
    },
    [sessions, updateSession],
  )

  const retry = useCallback(
    async (flowId: number) => {
      const flow = updateFlow
      if (!flow || flow.id !== flowId || !flow.command.agentLaunch) return
      validation.current?.abort()
      const controller = new AbortController()
      validation.current = controller
      updateGuides(flow, flow.report, true)
      try {
        await preflightAgentCommand(flow.command, controller.signal)
        controller.signal.throwIfAborted()
        for (const sessionId of flow.sessionIds) closeSession(sessionId)
        setUpdateFlow(null)
        launchOriginal(flow.command)
      } catch (cause) {
        if (controller.signal.aborted) return
        const report = cause instanceof RemoteCodexCompatibilityError ? cause.report : flow.report
        const error = cause instanceof Error ? cause.message : "A revalidação falhou."
        updateGuides(flow, report, false, error)
        setUpdateFlow({ ...flow, report })
      } finally {
        if (validation.current === controller) validation.current = null
      }
    },
    [closeSession, launchOriginal, updateFlow, updateGuides],
  )

  return { prompt, updateFlow, showCompatibility, cancelPrompt, openGuide, retry }
}

export function useWorkspaceRemoteCodexCompatibilityFlow({
  agentLaunchOpen,
  setAgentLaunchStep,
  setSelectedFolder,
  restoreFocus,
  leaderRef,
  setLeaderActive,
  ...flow
}: Omit<Parameters<typeof useRemoteCodexCompatibilityFlow>[0], "onGuideOpened" | "onCancelled"> & {
  agentLaunchOpen: boolean
  setAgentLaunchStep: (value: null) => void
  setSelectedFolder: (value: string) => void
  restoreFocus: () => void
  leaderRef: { current: boolean }
  setLeaderActive: (value: boolean) => void
}) {
  return useRemoteCodexCompatibilityFlow({
    ...flow,
    onGuideOpened() {
      setAgentLaunchStep(null)
      setSelectedFolder(DEFAULT_FOLDER)
    },
    onCancelled(command) {
      if (agentLaunchOpen) return
      if (command?.agentLaunch?.resumeThreadId) {
        leaderRef.current = true
        setLeaderActive(true)
      } else restoreFocus()
    },
  })
}
