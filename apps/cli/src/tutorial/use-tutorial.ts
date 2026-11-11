import { useCallback, useMemo, useState } from "react"
import { loadedFeature } from "../features/registry"
import type { ToolId } from "../tool-catalog"
import { getTutorialSteps } from "./TutorialOverlay"

export function useTutorial(screen: ToolId, closeSettings: () => void) {
  const [tutorialOpen, setOpen] = useState(false)
  const [tutorialTargetId, setTutorialTargetId] = useState<string | null>(null)
  const feature = loadedFeature(screen)
  // A feature may finish loading without a tool change. Read its metadata then.
  const tutorialSteps = useMemo(() => (feature ? getTutorialSteps(screen) : []), [screen, feature])
  const startTutorial = useCallback(() => {
    closeSettings()
    setTutorialTargetId(null)
    setOpen(true)
  }, [closeSettings])
  const closeTutorial = useCallback(() => {
    setOpen(false)
    setTutorialTargetId(null)
  }, [])
  const runnerTutorial = tutorialOpen && screen === "runner" ? { targetId: tutorialTargetId } : null
  return {
    tutorialOpen,
    tutorialTargetId,
    setTutorialTargetId,
    tutorialSteps,
    startTutorial,
    closeTutorial,
    runnerTutorial,
  }
}
