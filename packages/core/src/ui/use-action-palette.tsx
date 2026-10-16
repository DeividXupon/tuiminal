import type { Renderable } from "@opentui/core"
import { useRenderer, useTerminalDimensions } from "@opentui/react"
import { type ComponentProps, useEffect, useRef, useState } from "react"
import { ActionPalette } from "./ActionPalette"
import { type ActionPaletteAction, orderActionPaletteActions } from "./action-palette"

export type RunnablePaletteAction = ActionPaletteAction & { run: () => void }

/** Features supply availability and callbacks; no keyboard or side effects are inferred. */
export function paletteAction(
  id: string,
  shortcut: string,
  label: string,
  description: string,
  tag: string,
  run: () => void,
  disabledReason?: string | false | null,
): RunnablePaletteAction {
  return {
    id,
    shortcut,
    label,
    description,
    tags: [tag],
    run,
    disabledReason: disabledReason || null,
  }
}

/** Shared modal lifecycle; the feature still owns its opening key and fallback focus. */
export function useActionPalette({
  id,
  active,
  restoreFocus,
}: {
  id: string
  active: boolean
  restoreFocus: () => void
}) {
  const renderer = useRenderer()
  const [isOpen, setOpen] = useState(false)
  const previousFocus = useRef<Renderable | null>(null)
  const pending = useRef<{ run?: () => void } | null>(null)
  const fallback = useRef(restoreFocus)
  fallback.current = restoreFocus

  useEffect(() => {
    if (!active) {
      pending.current = null
      previousFocus.current = null
      setOpen(false)
      return
    }
    if (isOpen || !pending.current) return
    const next = pending.current
    pending.current = null
    const previous = previousFocus.current
    previousFocus.current = null
    if (previous && !previous.isDestroyed) previous.focus()
    else fallback.current()
    next.run?.()
  }, [active, isOpen])

  const open = () => {
    if (!active || isOpen) return
    const focused = renderer.currentFocusedRenderable
    previousFocus.current = focused?.id === `${id}-open` ? null : focused
    focused?.blur()
    setOpen(true)
  }
  const close = (run?: () => void) => {
    pending.current = run ? { run } : {}
    setOpen(false)
  }
  const render = ({
    title,
    accent,
    actions,
  }: {
    title: string
    accent: string
    actions: readonly RunnablePaletteAction[]
  }) =>
    isOpen && active ? (
      <PaletteDialog
        id={id}
        title={title}
        accent={accent}
        actions={orderActionPaletteActions(actions)}
        tags={Object.fromEntries(
          actions.flatMap((action) =>
            action.tags.map((tag) => [tag, { label: tag, color: accent }]),
          ),
        )}
        onClose={() => close()}
        onRun={(actionId) => {
          const action = actions.find((candidate) => candidate.id === actionId)
          if (action && !action.disabledReason) close(action.run)
        }}
      />
    ) : null

  return { isOpen, open, render }
}

function PaletteDialog(props: Omit<ComponentProps<typeof ActionPalette>, "width" | "height">) {
  const terminal = useTerminalDimensions()
  return <ActionPalette {...props} width={terminal.width} height={terminal.height} />
}
