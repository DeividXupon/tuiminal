import type { BoxRenderable } from "@opentui/core"
import { Button } from "@tuiparts/react/button"
import type { Ref } from "react"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { ModalSurface } from "@xupon/tuiminal-core/ui/ModalSurface"
import { ShortcutText } from "@xupon/tuiminal-core/ui/ShortcutText"

export type GitActionMenuItem<Kind extends string> = {
  kind: Kind
  label: string
  shortcut: string
  availability: { enabled: boolean; reason: string | null }
}

export function GitActionMenuView<Kind extends string>({
  id,
  title,
  subject,
  width,
  maxHeight,
  actions,
  selectedIndex,
  dialogRef,
  onClose,
  onSelect,
}: {
  id: string
  title: string
  subject: string
  width: number
  maxHeight: number
  actions: GitActionMenuItem<Kind>[]
  selectedIndex: number
  dialogRef: Ref<BoxRenderable>
  onClose: () => void
  onSelect: (kind: Kind) => void
}) {
  return (
    <ModalSurface
      id={id}
      dialogRef={dialogRef}
      width={width}
      height={Math.min(maxHeight, actions.length + 7)}
      zIndex={980}
      borderColor={COLORS.git}
      onBackdropPress={onClose}
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
        <text content={translateUi(title)} style={{ fg: COLORS.git }} />
        <InlineButton label="[Esc] Fechar" accent={COLORS.git} onPress={onClose} />
      </box>
      <text content={subject} style={{ fg: COLORS.text }} />
      {actions.map((action, actionIndex) => {
        const selected = actionIndex === selectedIndex
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
    </ModalSurface>
  )
}
