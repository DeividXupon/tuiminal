import type { BoxRenderable } from "@opentui/core"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import { Button } from "@tuiparts/react/button"
import { useEffect, useRef, useState } from "react"
import { COLORS } from "../../../../core/settings/theme"
import { translateUi } from "../../../../shared/i18n"
import { InlineButton } from "../../../../shared/ui/InlineButton"
import { ShortcutText } from "../../../../shared/ui/ShortcutText"
import type { PullRequestActionAvailability, PullRequestActionKind } from "../../model/pr/actions"
import type { PullRequestSummary } from "../../model/pr/types"

export type PullRequestActionMenuItem = {
  kind: PullRequestActionKind
  label: string
  shortcut: string
  availability: PullRequestActionAvailability
}

export function ActionMenuModal({
  open,
  item,
  actions,
  onClose,
  onSelect,
}: {
  open: boolean
  item: PullRequestSummary
  actions: PullRequestActionMenuItem[]
  onClose: () => void
  onSelect: (kind: PullRequestActionKind) => void
}) {
  const renderer = useRenderer()
  const terminal = useTerminalDimensions()
  const dialogRef = useRef<BoxRenderable | null>(null)
  const [index, setIndex] = useState(0)
  useEffect(() => {
    if (!open) return
    renderer.currentFocusedRenderable?.blur()
    setIndex(0)
    setTimeout(() => dialogRef.current?.focus(), 0)
  }, [open, renderer])
  useKeyboard((key) => {
    if (!open) return
    if (key.name === "escape" || key.name === "?") {
      key.preventDefault()
      key.stopPropagation()
      onClose()
    } else if (key.name === "j" || key.name === "down") {
      setIndex((current) => Math.min(actions.length - 1, current + 1))
    } else if (key.name === "k" || key.name === "up") {
      setIndex((current) => Math.max(0, current - 1))
    } else if (key.name === "enter" || key.name === "return") {
      const action = actions[index]
      if (action?.availability.enabled) onSelect(action.kind)
    }
  })
  if (!open) return null
  const width = Math.max(48, Math.min(84, terminal.width - 4))
  return (
    <>
      <Button
        onPress={onClose}
        position="absolute"
        top={0}
        left={0}
        width="100%"
        height="100%"
        zIndex={980}
        backgroundColor="#030509"
        opacity={0.92}
      />
      <box
        position="absolute"
        top={0}
        left={0}
        width="100%"
        height="100%"
        zIndex={981}
        alignItems="center"
        justifyContent="center"
      >
        <box
          ref={dialogRef}
          id="git-pr-action-menu"
          focusable
          style={{
            width,
            height: Math.min(20, actions.length + 7),
            border: true,
            borderStyle: "rounded",
            borderColor: COLORS.git,
            backgroundColor: COLORS.canvas,
            paddingLeft: 1,
            paddingRight: 1,
          }}
        >
          <box
            style={{
              height: 2,
              flexShrink: 0,
              flexDirection: "row",
              justifyContent: "space-between",
              border: ["bottom"],
              borderColor: COLORS.border,
            }}
          >
            <text content={translateUi("◆ AÇÕES DO PULL REQUEST")} style={{ fg: COLORS.git }} />
            <InlineButton
              label={translateUi("[Esc] Fechar")}
              accent={COLORS.git}
              onPress={onClose}
            />
          </box>
          <text
            content={`${item.identity.owner}/${item.identity.repository} #${item.identity.number} · ${item.title}`}
            style={{ fg: COLORS.text }}
          />
          {actions.map((action, actionIndex) => {
            const selected = actionIndex === index
            const reason = action.availability.reason
              ? ` · ${translateUi(action.availability.reason)}`
              : ""
            return (
              <Button
                key={action.kind}
                height={1}
                disabled={!action.availability.enabled}
                onPress={() => onSelect(action.kind)}
              >
                <ShortcutText
                  content={`${selected ? "▶" : " "} ${action.shortcut} ${translateUi(action.label)}${reason}`}
                  style={{
                    fg: !action.availability.enabled
                      ? COLORS.border
                      : selected
                        ? COLORS.text
                        : COLORS.muted,
                    bg: selected ? COLORS.panelRaised : COLORS.canvas,
                  }}
                />
              </Button>
            )
          })}
          <ShortcutText
            content={translateUi("[J/K] Navegar  [Enter] Preparar  [Esc] Voltar")}
            style={{ marginTop: 1, fg: COLORS.muted }}
          />
        </box>
      </box>
    </>
  )
}
