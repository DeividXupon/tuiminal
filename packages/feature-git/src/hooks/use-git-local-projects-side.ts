import { resolve } from "node:path"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import type { ActionPaletteSideSection } from "@xupon/tuiminal-core/ui/action-palette"
import { useEffect, useMemo, useRef, useState } from "react"
import { resolveGitProjectContext } from "../services/git"
import {
  discoverLocalGitProjects,
  type LocalGitProject,
  loadLocalGitTarget,
} from "../services/local-target"
import { updateGitDiffsTarget } from "../storage/local/config"

export type GitLocalProjectCallbacks = {
  /** Runs once the palette has closed, so the change never races its focus restore. */
  closeThen: (then: () => void) => void
  setMessage: (message: string) => void
  setError: (message: string) => void
}

/** Project names, falling back to the home-relative path when two names collide. */
export function gitLocalProjectLabels(projects: readonly LocalGitProject[]) {
  return projects.map((project) =>
    projects.filter((candidate) => candidate.name === project.name).length > 1
      ? project.displayPath
      : project.name,
  )
}

async function selectLocalProject(root: string) {
  const target = await loadLocalGitTarget(root)
  if (!target.isRepository) {
    throw new Error(translateUi("O projeto selecionado não é um repositório Git."))
  }
  const launch = await resolveGitProjectContext()
  updateGitDiffsTarget({ scope: launch.root, repositoryRoot: target.root })
}

/**
 * Upper block of the palette side column: the versioned projects offered by the
 * `[Ctrl+P]` local-project picker. Discovery reruns on each opening while earlier
 * results stay visible; shown only when an owner applies the change.
 */
export function useGitLocalProjectsSide({
  open,
  currentRoot,
  blockedReason,
  onProjectChanged,
  callbacks,
}: {
  open: boolean
  currentRoot: string | null | undefined
  blockedReason: string | null
  onProjectChanged?: (() => void) | undefined
  callbacks: GitLocalProjectCallbacks
}): ActionPaletteSideSection | undefined {
  const [projects, setProjects] = useState<readonly LocalGitProject[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const selecting = useRef(false)
  const enabled = Boolean(currentRoot && onProjectChanged)

  useEffect(() => {
    if (!open || !enabled || !currentRoot) return
    let current = true
    setLoading(true)
    discoverLocalGitProjects(currentRoot)
      .then((discovered) => {
        if (!current) return
        setProjects(discovered)
        setError("")
      })
      .catch((cause: unknown) => {
        if (current) setError(cause instanceof Error ? cause.message : String(cause))
      })
      .finally(() => {
        if (current) setLoading(false)
      })
    return () => {
      current = false
    }
  }, [currentRoot, enabled, open])

  const items = useMemo(() => {
    const current = currentRoot ? resolve(currentRoot) : null
    const labels = gitLocalProjectLabels(projects)
    return projects.map((project, index) => ({
      id: project.root,
      label: labels[index] ?? project.name,
      ...(project.root === current ? { detail: "atual" } : {}),
      disabledReason: project.root === current ? "Projeto atual" : blockedReason,
    }))
  }, [blockedReason, currentRoot, projects])

  if (!currentRoot || !onProjectChanged) return undefined
  const select = async (root: string) => {
    if (selecting.current) return
    selecting.current = true
    try {
      await selectLocalProject(root)
      callbacks.setMessage(translateUi("Projeto local dos Diffs salvo."))
      onProjectChanged()
    } catch (cause) {
      callbacks.setError(
        cause instanceof Error && cause.message
          ? cause.message
          : translateUi("Não foi possível trocar o projeto."),
      )
    } finally {
      selecting.current = false
    }
  }
  return {
    id: "projects",
    title: "PROJETOS VERSIONADOS",
    emptyText: "Nenhum projeto Git encontrado.",
    // Keep earlier results visible while a later discovery runs.
    loading: loading && projects.length === 0,
    ...(error ? { error } : {}),
    items,
    onSelect: (root: string) => callbacks.closeThen(() => void select(root)),
  }
}
