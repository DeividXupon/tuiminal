import { useCallback, useRef, useState, type RefObject } from "react"
import { shutdownTools } from "../feature-registry"
import type { ToolId } from "../tool-catalog"

type ExitRenderer = { destroy: () => void }
type ExitKey = { name: string; preventDefault: () => void; stopPropagation: () => void }

export function useApplicationExit(renderer: ExitRenderer, visitedTabs: RefObject<Set<ToolId>>) {
  const [open, setOpen] = useState(false)
  const openRef = useRef(false)
  const httpUnsavedChanges = useRef(false)
  const track = useCallback((dirty: boolean) => {
    httpUnsavedChanges.current = dirty
  }, [])
  const quit = useCallback(
    async (force = false) => {
      if (httpUnsavedChanges.current && !force) {
        openRef.current = true
        setOpen(true)
        return
      }
      await shutdownTools(visitedTabs.current)
      renderer.destroy()
    },
    [renderer, visitedTabs],
  )
  const close = useCallback(() => {
    setOpen(false)
    setTimeout(() => {
      openRef.current = false
    }, 0)
  }, [])
  const guardKey = useCallback(
    (key: ExitKey) => {
      if (!openRef.current) return
      key.preventDefault()
      key.stopPropagation()
      const name = key.name.toLowerCase()
      if (name === "escape") close()
      else if (name === "q") void quit(true)
    },
    [close, quit],
  )
  return { open, close, track, quit, guardKey }
}
