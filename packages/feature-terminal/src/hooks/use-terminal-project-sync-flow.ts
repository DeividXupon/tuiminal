import { useState } from "react"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { useNotifications } from "@xupon/tuiminal-core/notifications/index"
import type { TerminalSession } from "../model/sessions"
import type { RemoteProjectSyncReview } from "../model/remote-project-sync"
import {
  pathExists,
  RemoteProjectSyncCollisionError,
  remoteProjectSyncDestination,
} from "../services/remote-project-sync"
import type { RemoteProjectSyncFlowState } from "../ui/RemoteProjectSyncFlow"
import type { useTerminalSessions } from "./use-terminal-sessions"
import type { useRemoteProjectSync } from "./use-remote-project-sync"

export function useTerminalProjectSyncFlow({
  sessions,
  activeSessionRef,
  projectSync,
  restoreFocus,
}: Pick<ReturnType<typeof useTerminalSessions>, "sessions" | "activeSessionRef"> & {
  projectSync: ReturnType<typeof useRemoteProjectSync>
  restoreFocus: () => void
}) {
  const { notify } = useNotifications()
  const [projectSyncFlow, setProjectSyncFlow] = useState<RemoteProjectSyncFlowState | null>(null)
  const closeProjectSyncFlow = () => {
    if (projectSyncFlow?.kind === "progress") {
      const owner = sessions.find((session) => session.id === projectSyncFlow.sessionId)
      if (owner) projectSync.cancel(owner)
      return
    }
    if (projectSyncFlow?.kind === "preview") {
      const owner = sessions.find((session) => session.id === projectSyncFlow.sessionId)
      if (owner) projectSync.cancel(owner)
    }
    setProjectSyncFlow(null)
    restoreFocus()
  }
  const runProjectSync = (
    session: TerminalSession,
    localPath?: string,
    review?: RemoteProjectSyncReview,
  ) => {
    const destination = review?.localPath ?? localPath ?? projectSync.mappingFor(session)?.localPath
    if (destination)
      setProjectSyncFlow({ kind: "progress", sessionId: session.id, localPath: destination })
    void projectSync
      .synchronize(session, localPath, {
        ...(review ? { review } : {}),
      })
      .then((mapping) => {
        if (!mapping) return
        setProjectSyncFlow(null)
        queueMicrotask(restoreFocus)
        notify({
          source: `terminal-project-sync:${session.id}`,
          kind: "success",
          title: translateUi("Projeto sincronizado"),
          message: mapping.localPath,
        })
      })
      .catch((error) => {
        if (error instanceof RemoteProjectSyncCollisionError)
          setProjectSyncFlow({ kind: "browse", sessionId: session.id })
        else {
          setProjectSyncFlow(null)
          queueMicrotask(restoreFocus)
        }
        if (!(error instanceof Error && error.message === "Operação cancelada."))
          notify({
            source: `terminal-project-sync:${session.id}`,
            kind: "error",
            title: translateUi("Falha na sincronização"),
            message:
              error instanceof Error
                ? translateUi(error.message)
                : translateUi("Não foi possível sincronizar."),
          })
      })
  }
  const requestProjectSync = (session: TerminalSession) => {
    const mapping = projectSync.mappingFor(session)
    if (!mapping) {
      setProjectSyncFlow({ kind: "browse", sessionId: session.id })
      return
    }
    setProjectSyncFlow({ kind: "progress", sessionId: session.id, localPath: mapping.localPath })
    void projectSync
      .inspect(session)
      .then((review) => {
        if (!review) return
        if (activeSessionRef.current !== session.id) {
          projectSync.cancel(session)
          setProjectSyncFlow(null)
          return
        }
        if (!review.changeCount) {
          setProjectSyncFlow(null)
          queueMicrotask(restoreFocus)
          notify({
            source: `terminal-project-sync:${session.id}`,
            kind: "info",
            title: translateUi("Projeto já sincronizado"),
            message: translateUi("Nenhum arquivo pendente."),
          })
          return
        }
        setProjectSyncFlow({ kind: "preview", sessionId: session.id, review })
      })
      .catch((error) => {
        setProjectSyncFlow(null)
        queueMicrotask(restoreFocus)
        if (!(error instanceof Error && error.message === "Operação cancelada."))
          notify({
            source: `terminal-project-sync:${session.id}`,
            kind: "error",
            title: translateUi("Falha na sincronização"),
            message:
              error instanceof Error
                ? translateUi(error.message)
                : translateUi("Não foi possível verificar o projeto."),
          })
      })
  }
  const pageProjectSyncReview = (session: TerminalSession, offset: number) => {
    void projectSync.page(session, offset).then((page) => {
      if (!page) return
      setProjectSyncFlow((current) =>
        current?.kind === "preview" && current.sessionId === session.id
          ? { kind: "preview", sessionId: session.id, review: { ...current.review, ...page } }
          : current,
      )
    })
  }
  const toggleAutomaticProjectSync = (session: TerminalSession) => {
    try {
      projectSync.toggleAutomatic(session)
    } catch (error) {
      notify({
        source: `terminal-project-sync:${session.id}`,
        kind: "error",
        title: translateUi("Falha na sincronização automática"),
        message:
          error instanceof Error
            ? translateUi(error.message)
            : translateUi("Não foi possível salvar a preferência de sincronização automática."),
      })
    }
  }
  const chooseProjectSyncParent = async (session: TerminalSession, parent: string) => {
    const remote = session.agentLaunch?.remote
    if (!remote) return
    const localPath = remoteProjectSyncDestination(parent, remote.workingDirectory)
    if (await pathExists(localPath)) {
      notify({
        source: `terminal-project-sync:${session.id}`,
        kind: "warning",
        title: translateUi("Pasta de sincronização ocupada"),
        message: translateUi(
          "Escolha outra pasta; o Tuiminal não substitui uma pasta desconhecida.",
        ),
      })
      return
    }
    setProjectSyncFlow({ kind: "destination", sessionId: session.id, localPath })
  }
  return {
    projectSyncFlow,
    setProjectSyncFlow,
    closeProjectSyncFlow,
    runProjectSync,
    requestProjectSync,
    pageProjectSyncReview,
    toggleAutomaticProjectSync,
    chooseProjectSyncParent,
  }
}
