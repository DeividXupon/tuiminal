import { CliRenderEvents, type Renderable } from "@opentui/core"
import { useEffect, useRef } from "react"
import { useRenderer } from "@opentui/react"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { useActionPalette } from "@xupon/tuiminal-core/ui/use-action-palette"
import type { HttpKeyboardCommand } from "../model/keyboard-types"
import type { HttpPane, HttpDocumentState } from "../model/types"
import type { HttpSourceMode } from "../model/source-mode"
import { httpWorkspaceActions } from "../ui/http-workspace-actions"
import { useHttpBoxSelection } from "./use-http-box-selection"

export function useHttpWorkspaceActions({
  active,
  document,
  environment = false,
  requestPaneId,
  pane,
  sourceMode,
  focusPane,
  run,
}: {
  active: boolean
  document: HttpDocumentState | undefined
  requestPaneId?: string | undefined
  environment?: boolean
  pane: HttpPane
  sourceMode: HttpSourceMode
  focusPane: (pane: HttpPane) => void
  run: (command: HttpKeyboardCommand) => void
}) {
  const renderer = useRenderer()
  const ids = {
    url: "http-url-pane",
    navigation: "http-navigation-pane",
    request:
      requestPaneId ??
      (environment ? "http-environment-pane" : `http-request-pane-${document?.request.id}`),
    response: `http-response-pane-${document?.request.id}`,
  }
  const targetId = ids[pane]
  const lastControl = useRef<{ targetId: string; node: Renderable } | null>(null)
  useEffect(() => {
    if (!active) return
    const remember = (node: Renderable | null) => {
      if (node && isInside(node, targetId)) lastControl.current = { targetId, node }
    }
    remember(renderer.currentFocusedRenderable)
    renderer.on(CliRenderEvents.FOCUSED_RENDERABLE, remember)
    return () => {
      renderer.off(CliRenderEvents.FOCUSED_RENDERABLE, remember)
    }
  }, [active, renderer, targetId])
  const restoreControl = () => {
    const previous = lastControl.current
    if (previous?.targetId === targetId && !previous.node.isDestroyed) previous.node.focus()
    else focusPane(pane)
  }
  const palette = useActionPalette({
    id: "http-action-palette",
    active,
    restoreFocus: restoreControl,
  })
  const boxes = useHttpBoxSelection({
    active: active && !palette.isOpen,
    current: ids[pane],
    targets: (Object.keys(ids) as HttpPane[]).map((target) => ({
      id: ids[target],
      onFocus: () => focusPane(target),
    })),
  })
  return {
    blocked: palette.isOpen || boxes.open,
    openPalette: palette.open,
    openBoxes: () => {
      if (active && !palette.isOpen) {
        if (renderer.currentFocusedRenderable?.id === "http-jump-button") restoreControl()
        boxes.openSelection()
      }
    },
    boxOverlay: boxes.overlay,
    content: (
      <>
        {boxes.focusNode}
        {palette.isOpen
          ? palette.render({
              title: "HTTP",
              accent: COLORS.http,
              actions: httpWorkspaceActions(document, sourceMode, (command) => {
                if (command.kind === "choose-box") boxes.openSelection()
                else {
                  renderer.currentFocusedRenderable?.blur()
                  run(command)
                }
              }),
            })
          : null}
      </>
    ),
  }
}

function isInside(node: Renderable | null, id: string): boolean {
  while (node) {
    if (node.id === id) return true
    node = node.parent
  }
  return false
}
