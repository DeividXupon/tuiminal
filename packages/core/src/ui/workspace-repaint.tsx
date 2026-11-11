import { useRenderer } from "@opentui/react"
import { createContext, type ReactNode, useContext, useLayoutEffect } from "react"
import { requestWorkspaceRepaint } from "./workspace-repaint-coordinator"

const WorkspaceVisibility = createContext(true)

export function useWorkspaceVisibility() {
  return useContext(WorkspaceVisibility)
}

/**
 * Report visual identity, never text, cursor, scroll or progress. Visibility is
 * whether the surface paints, independent of keyboard focus/modal blocking.
 */
export function useWorkspaceRepaint(transitionKey: string, visible = true) {
  const renderer = useRenderer()
  const parentVisible = useContext(WorkspaceVisibility)
  const painted = parentVisible && visible
  // biome-ignore lint/correctness/useExhaustiveDependencies: Visual identity changes request recovery even when the surface remains mounted.
  useLayoutEffect(() => {
    if (!painted) return
    requestWorkspaceRepaint(renderer)
    // Hiding/unmounting also exposes cells previously covered by this surface.
    return () => requestWorkspaceRepaint(renderer)
  }, [renderer, painted, transitionKey])
}

/** No native wrapper: retained panels keep their geometry, refs and focus. */
export function WorkspaceRepaintBoundary({
  transitionKey,
  visible = true,
  children,
}: {
  transitionKey: string
  visible?: boolean
  children: ReactNode
}) {
  const parentVisible = useContext(WorkspaceVisibility)
  useWorkspaceRepaint(transitionKey, visible)
  return (
    <WorkspaceVisibility.Provider value={parentVisible && visible}>
      {children}
    </WorkspaceVisibility.Provider>
  )
}
