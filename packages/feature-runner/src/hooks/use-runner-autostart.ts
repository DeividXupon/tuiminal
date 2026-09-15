import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import type { RunnerCommand } from "../services/runner"
import type { RunnerEnvironmentProfile } from "../storage/runner-config"
import {
  approveRunnerAutostart,
  createRunnerAutostartReview,
  isRunnerAutostartTrusted,
  type RunnerAutostartReview,
} from "../storage/autostart-trust"

type RunnerNotifier = (notice: { source: "Runner"; kind: "error"; message: string }) => void

export function useRunnerAutostart({
  active,
  loading,
  projectRoot,
  discoveredProjectRoot,
  commands,
  selectedProfile,
  runCommand,
  notify,
  setRunnerNotice,
  focusCommands,
}: {
  active: boolean
  loading: boolean
  projectRoot: string
  discoveredProjectRoot: string | null
  commands: RunnerCommand[]
  selectedProfile: RunnerEnvironmentProfile | undefined
  runCommand: (command: RunnerCommand) => void
  notify: RunnerNotifier
  setRunnerNotice: (notice: string) => void
  focusCommands: () => void
}) {
  const autostartedRef = useRef(new Set<string>())
  const dismissedRef = useRef(new Set<string>())
  const [pendingReview, setPendingReview] = useState<RunnerAutostartReview | null>(null)
  const [, setTrustRevision] = useState(0)
  const review = useMemo(
    () => createRunnerAutostartReview(projectRoot, commands, selectedProfile),
    [commands, projectRoot, selectedProfile],
  )
  const trusted = review ? isRunnerAutostartTrusted(review) : false

  useEffect(() => {
    if (!active || loading || discoveredProjectRoot !== projectRoot) return
    if (!review || trusted) {
      setPendingReview(null)
      return
    }
    const key = `${review.root}\n${review.fingerprint}`
    setPendingReview(dismissedRef.current.has(key) ? null : review)
  }, [active, discoveredProjectRoot, loading, projectRoot, review, trusted])

  useEffect(() => {
    if (!active || !review || !trusted || pendingReview || discoveredProjectRoot !== projectRoot) {
      return
    }
    for (const command of commands) {
      if (!command.autostart) continue
      const key = `${projectRoot}\n${command.id}\n${review.fingerprint}`
      if (autostartedRef.current.has(key)) continue
      autostartedRef.current.add(key)
      runCommand(command)
    }
  }, [
    active,
    commands,
    discoveredProjectRoot,
    pendingReview,
    projectRoot,
    review,
    runCommand,
    trusted,
  ])

  const approve = useCallback(() => {
    if (!pendingReview) return
    try {
      approveRunnerAutostart(pendingReview)
      setPendingReview(null)
      setTrustRevision((current) => current + 1)
      setRunnerNotice(translateUi("Autostart autorizado para esta configuração."))
      setTimeout(focusCommands, 0)
    } catch (error) {
      notify({
        source: "Runner",
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : translateUi("Não foi possível salvar a confiança do autostart."),
      })
    }
  }, [focusCommands, notify, pendingReview, setRunnerNotice])

  const dismiss = useCallback(() => {
    if (!pendingReview) return
    dismissedRef.current.add(`${pendingReview.root}\n${pendingReview.fingerprint}`)
    setPendingReview(null)
    setRunnerNotice(translateUi("Autostart não executado."))
    setTimeout(focusCommands, 0)
  }, [focusCommands, pendingReview, setRunnerNotice])

  return { pendingReview, approve, dismiss }
}
