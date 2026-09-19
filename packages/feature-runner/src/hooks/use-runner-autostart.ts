import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import type { RunnerFlow } from "../model/plan"
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
  flows,
  profiles,
  runFlow,
  runTargets,
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
  flows: RunnerFlow[]
  profiles: RunnerEnvironmentProfile[]
  runFlow: (flow: RunnerFlow) => void
  runTargets: (commands: RunnerCommand[]) => void
  notify: RunnerNotifier
  setRunnerNotice: (notice: string) => void
  focusCommands: () => void
}) {
  const autostartedRef = useRef(new Set<string>())
  const dismissedRef = useRef(new Set<string>())
  const [pendingReview, setPendingReview] = useState<RunnerAutostartReview | null>(null)
  const [, setTrustRevision] = useState(0)
  const { review, error } = useMemo(() => {
    try {
      return {
        review: createRunnerAutostartReview(
          projectRoot,
          commands,
          selectedProfile,
          flows,
          profiles,
        ),
        error: "",
      }
    } catch (failure) {
      return {
        review: null,
        error: failure instanceof Error ? failure.message : "Configuração inválida.",
      }
    }
  }, [commands, projectRoot, selectedProfile, flows, profiles])
  useEffect(() => {
    if (error && active && !loading) setRunnerNotice(translateUi(error))
  }, [active, error, loading, setRunnerNotice])
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
    const key = `${review.root}
${review.fingerprint}`
    if (autostartedRef.current.has(key)) return
    autostartedRef.current.add(key)
    runTargets(commands.filter((command) => command.autostart))
    for (const flow of flows) if (flow.autostart) runFlow(flow)
  }, [
    active,
    commands,
    discoveredProjectRoot,
    pendingReview,
    projectRoot,
    review,
    runTargets,
    runFlow,
    flows,
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
