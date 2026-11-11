import { COLORS, LAYOUT } from "@xupon/tuiminal-core/settings/theme"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import type { ReactNode } from "react"

export function RunnerSurface({ id, children }: { id: string; children: ReactNode }) {
  return (
    <box
      id={id}
      style={{
        flexGrow: 1,
        backgroundColor: LAYOUT.workspaceBackground,
        paddingTop: 0,
        paddingLeft: LAYOUT.outerPadding,
        paddingRight: LAYOUT.outerPadding,
        paddingBottom: 0,
      }}
    >
      {children}
    </box>
  )
}

export function RunnerPanels({
  narrow,
  pane,
  focusCommands,
  focusLog,
  children,
}: {
  narrow: boolean
  pane: "commands" | "log"
  focusCommands: () => void
  focusLog: () => void
  children: ReactNode
}) {
  return (
    <box
      style={{
        flexGrow: 1,
        flexDirection: narrow ? "column" : "row",
        gap: narrow ? 0 : LAYOUT.gap,
      }}
    >
      {narrow && (
        <box
          style={{
            height: 1,
            flexShrink: 0,
            flexDirection: "row",
            backgroundColor: COLORS.panel,
            marginBottom: LAYOUT.headerSpacing,
          }}
        >
          <InlineButton
            label="[Tab] Comandos"
            accent={COLORS.runner}
            active={pane === "commands"}
            onPress={focusCommands}
          />
          <InlineButton
            label="[Tab] Log"
            accent={COLORS.runner}
            active={pane === "log"}
            onPress={focusLog}
          />
          <text content=" · um painel por vez" fg={COLORS.muted} />
        </box>
      )}
      {children}
    </box>
  )
}

export function RunnerCommandColumn({
  narrow,
  width,
  children,
}: {
  narrow: boolean
  width: number
  children: ReactNode
}) {
  return (
    <box
      style={{
        width: narrow ? "100%" : width,
        flexGrow: narrow ? 1 : 0,
        flexShrink: narrow ? 1 : 0,
      }}
    >
      {children}
    </box>
  )
}
