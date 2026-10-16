import type { Renderable } from "@opentui/core"
import { useRenderer, useTerminalDimensions } from "@opentui/react"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { ActionPalette } from "@xupon/tuiminal-core/ui/ActionPalette"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { GitRemotePaletteAction } from "../../model/remote-palette"
import { gitRemotePaletteTags } from "../../rendering/action-palette-tags"
import { type GitPaneBoxes, useGitPaneBoxSelection } from "./useGitPaneBoxSelection"

export const GIT_REMOTE_ACTION_PALETTE_ID = "git-action-palette"

/**
 * `[?]` palette for the GitHub tabs. Actions are built only while open; a chosen action runs
 * right after the previous focus returns, so it can open its own layer. With `boxes`, `[M]`
 * and the palette's `choose-box` row also choose the list or preview panel.
 */
export function useGitRemoteActionPalette<Id extends string>({
  active,
  title,
  buildActions,
  onRun,
  boxes,
}: {
  active: boolean
  /** Untranslated title. */
  title: string
  buildActions: () => readonly GitRemotePaletteAction<Id>[]
  onRun: (id: Id) => void
  boxes?: GitPaneBoxes | undefined
}) {
  const renderer = useRenderer()
  const terminal = useTerminalDimensions()
  const [open, setOpen] = useState(false)
  const previousFocus = useRef<Renderable | null>(null)
  const visible = open && active
  const box = useGitPaneBoxSelection({ active, paletteOpen: visible, boxes })
  const actions = visible ? buildActions() : []
  // Palette colors are read at open time so palette switches apply to the next opening.
  const tags = useMemo(() => {
    void visible
    return gitRemotePaletteTags(COLORS)
  }, [visible])

  useEffect(() => {
    if (active) return
    previousFocus.current = null
    setOpen(false)
  }, [active])

  const openPalette = useCallback(() => {
    const focused = renderer.currentFocusedRenderable
    previousFocus.current = focused
    focused?.blur()
    setOpen(true)
  }, [renderer])

  // Remote tabs keep focus in workspace state, so the chosen action can open its layer in
  // the same event, exactly like the shortcut would.
  const close = (then?: () => void) => {
    setOpen(false)
    const previous = previousFocus.current
    previousFocus.current = null
    if (previous && !previous.isDestroyed) previous.focus()
    then?.()
  }

  const palette = visible ? (
    <ActionPalette
      id={GIT_REMOTE_ACTION_PALETTE_ID}
      title={title}
      accent={COLORS.git}
      actions={actions}
      tags={tags}
      width={terminal.width}
      height={terminal.height}
      onRun={(id) => close(() => (id === "choose-box" ? box.openSelection() : onRun(id)))}
      onClose={() => close()}
    />
  ) : null

  return {
    /** The palette or box selection owns the keyboard. */
    open: visible || box.open,
    openPalette,
    palette,
    boxOverlay: box.overlay,
    boxFocusNode: box.focusNode,
  }
}
