import { useCallback, useMemo, useState } from "react"
import type { LiveDiffFile } from "../model/live-diff"

export function useLiveDiffProjects(roots: readonly string[], files: readonly LiveDiffFile[]) {
  const [hiddenRoots, setHiddenRoots] = useState<string[]>([])
  const [projectCursor, setProjectCursor] = useState<string | null>(null)
  const visibleFiles = useMemo(
    () => files.filter((file) => !hiddenRoots.includes(file.root)),
    [files, hiddenRoots],
  )
  const selectedProject = roots.includes(projectCursor ?? "") ? projectCursor : (roots[0] ?? null)
  const toggleProject = useCallback(() => {
    if (!selectedProject) return
    setHiddenRoots((previous) =>
      previous.includes(selectedProject)
        ? previous.filter((root) => root !== selectedProject)
        : [...previous, selectedProject],
    )
  }, [selectedProject])
  const selectProjectRelative = useCallback(
    (delta: number) => {
      if (!roots.length) return
      const index = Math.max(0, roots.indexOf(selectedProject ?? ""))
      setProjectCursor(roots[(index + delta + roots.length) % roots.length] ?? null)
    },
    [roots, selectedProject],
  )
  return {
    hiddenRoots,
    visibleFiles,
    selectedProject,
    selectProject: setProjectCursor,
    toggleProject,
    selectProjectRelative,
  }
}
