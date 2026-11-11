import type { BoxRenderable, ScrollBoxRenderable } from "@opentui/core"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { ModalSurface } from "@xupon/tuiminal-core/ui/ModalSurface"
import type * as React from "react"

export type RunnerAutostartTrustViewProps = {
  id?: string
  dialogRef: React.RefObject<BoxRenderable | null>
  width: number
  height: number
  onClose: () => void
  scrollRef: React.RefObject<ScrollBoxRenderable | null>
  content: string
  onApprove: () => void
}
export function RunnerAutostartTrustView({
  id,
  dialogRef,
  width,
  height,
  onClose,
  scrollRef,
  content,
  onApprove,
}: RunnerAutostartTrustViewProps) {
  return (
    <ModalSurface
      id={id ?? "runner-autostart-trust-modal"}
      dialogRef={dialogRef}
      width={width}
      height={height}
      zIndex={980}
      borderColor={COLORS.warning}
      onBackdropPress={onClose}
    >
      <text
        content={translateUi("◆ AUTOSTART DO RUNNER")}
        style={{ height: 1, flexShrink: 0, fg: COLORS.warning }}
      />
      <text
        content={translateUi("Este projeto pediu para iniciar comandos automaticamente.")}
        style={{ height: 1, flexShrink: 0, fg: COLORS.text }}
      />
      <text
        content={translateUi(
          "Revise o projeto, os comandos, diretórios e ambiente antes de confiar.",
        )}
        style={{ height: 1, flexShrink: 0, fg: COLORS.muted }}
      />
      <scrollbox ref={scrollRef} scrollY style={{ flexGrow: 1, marginTop: 1 }}>
        <text content={content} style={{ fg: COLORS.text }} />
      </scrollbox>
      <text
        content={translateUi("Uma mudança material pedirá aprovação novamente.")}
        style={{ height: 1, flexShrink: 0, fg: COLORS.warning }}
      />
      <box
        style={{
          height: 1,
          flexShrink: 0,
          flexDirection: "row",
          justifyContent: "space-between",
        }}
      >
        <InlineButton
          id="runner-autostart-trust-deny"
          label="[Esc] Não executar"
          accent={COLORS.runner}
          onPress={onClose}
        />
        <InlineButton
          id="runner-autostart-trust-approve"
          label="[Y/Enter] Confiar e executar"
          accent={COLORS.warning}
          onPress={onApprove}
        />
      </box>
    </ModalSurface>
  )
}
