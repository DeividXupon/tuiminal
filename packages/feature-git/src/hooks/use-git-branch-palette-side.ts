import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import type { ActionPaletteSideSection } from "@xupon/tuiminal-core/ui/action-palette"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { loadLocalGitTarget, switchLocalGitBranch } from "../services/local-target"

type BranchState =
  | { status: "loading" }
  | { status: "ready"; branch: string; branches: readonly string[] }
  | { status: "error"; message: string }

export type GitBranchSwitchCallbacks = {
  /** Runs once the palette has closed, so the switch never races its focus restore. */
  closeThen: (then: () => void) => void
  setBusy: (busy: boolean) => void
  recordCommand: (args: readonly string[]) => void
  recordResult: (text: string, success?: boolean) => void
  setMessage: (message: string) => void
  setError: (message: string) => void
  refresh: () => Promise<void>
}

function failureMessage(error: unknown) {
  return error instanceof Error && error.message
    ? error.message
    : translateUi("Não foi possível trocar a branch.")
}

/**
 * Local branches for the palette's one-third side list. Loads only while the palette is open
 * and ignores responses from an earlier opening or repository.
 */
export function useGitBranchPaletteSide({
  open,
  root,
  blockedReason,
  callbacks,
}: {
  open: boolean
  root: string | null | undefined
  blockedReason: string | null
  callbacks: GitBranchSwitchCallbacks
}): ActionPaletteSideSection | undefined {
  const [state, setState] = useState<BranchState>({ status: "loading" })
  const switching = useRef(false)

  useEffect(() => {
    if (!open || !root) return
    let current = true
    setState({ status: "loading" })
    loadLocalGitTarget(root)
      .then((target) => {
        if (!current) return
        setState({ status: "ready", branch: target.branch, branches: target.branches })
      })
      .catch((error: unknown) => {
        if (current) setState({ status: "error", message: failureMessage(error) })
      })
    return () => {
      current = false
    }
  }, [open, root])

  const switchBranch = useCallback(
    async (targetRoot: string, branch: string) => {
      if (switching.current) return
      switching.current = true
      callbacks.setBusy(true)
      callbacks.recordCommand(["switch", "--quiet", "--no-guess", branch])
      try {
        await switchLocalGitBranch(targetRoot, branch)
        callbacks.recordResult(translateUi("Branch local alterada."))
        callbacks.setMessage(translateUi("Branch local alterada."))
      } catch (error) {
        const message = failureMessage(error)
        callbacks.recordResult(message, false)
        callbacks.setError(message)
      } finally {
        switching.current = false
        callbacks.setBusy(false)
        await callbacks.refresh()
      }
    },
    [callbacks],
  )

  const items = useMemo(() => {
    if (state.status !== "ready") return []
    return state.branches.map((branch) => ({
      id: branch,
      label: branch,
      ...(branch === state.branch ? { detail: "atual" } : {}),
      disabledReason: branch === state.branch ? "Branch atual" : blockedReason,
    }))
  }, [blockedReason, state])

  if (!root) return undefined
  return {
    id: "branches",
    title: "BRANCH OBSERVADA",
    emptyText: "Nenhuma branch local encontrada.",
    loading: state.status === "loading",
    ...(state.status === "error" ? { error: state.message } : {}),
    items,
    onSelect: (branch: string) => callbacks.closeThen(() => void switchBranch(root, branch)),
  }
}
