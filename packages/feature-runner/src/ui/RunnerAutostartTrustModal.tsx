import type { BoxRenderable, ScrollBoxRenderable } from "@opentui/core"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import { useEffect, useMemo, useRef } from "react"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { ModalSurface } from "@xupon/tuiminal-core/ui/ModalSurface"
import type { RunnerAutostartReview } from "../storage/autostart-trust"

function reviewText(review: RunnerAutostartReview) {
  const lines = [
    `${translateUi("PROJETO")}  ${review.root}`,
    `${translateUi("PERFIL")}  ${review.profile?.label ?? translateUi("sem perfil adicional")}`,
  ]
  if (review.profile) {
    lines.push(
      `${translateUi("VARIÁVEIS")}  ${review.profile.environmentNames.join(", ") || translateUi("nenhuma")}`,
      `${translateUi("ARQUIVO DE AMBIENTE")}  ${review.profile.environmentFile ?? translateUi("nenhuma")}`,
    )
  }
  for (const flow of review.flows) lines.push(`${flow.label}: ${JSON.stringify(flow.stages)}`)
  for (const [index, command] of review.commands.entries()) {
    lines.push(
      "",
      `${translateUi("COMANDO")} ${index + 1} · ${command.label}`,
      command.command,
      `${translateUi("DIRETÓRIO")}  ${command.cwd}`,
      `${translateUi("VARIÁVEIS")}  ${command.environmentNames.join(", ") || translateUi("nenhuma")}`,
      `${translateUi("ARQUIVO DE AMBIENTE")}  ${command.environmentFile ?? translateUi("nenhuma")}`,
      command.policy,
      `${translateUi("ARQUIVO DE AMBIENTE")} ${command.profileEnvironmentFile ?? "—"}`,
      `${translateUi("PERFIL")} ${command.profile ?? "—"}`,
      `${translateUi("PTY interativo")}  ${command.interactive ? "✓" : "—"}`,
    )
  }
  return lines.join("\n")
}

export function RunnerAutostartTrustModal({
  review,
  onApprove,
  onClose,
}: {
  review: RunnerAutostartReview
  onApprove: () => void
  onClose: () => void
}) {
  const renderer = useRenderer()
  const terminal = useTerminalDimensions()
  const dialogRef = useRef<BoxRenderable | null>(null)
  const scrollRef = useRef<ScrollBoxRenderable | null>(null)
  const content = useMemo(() => reviewText(review), [review])
  const width = Math.max(30, Math.min(100, terminal.width - 4))
  const height = Math.max(12, Math.min(24, terminal.height - 2))

  useEffect(() => {
    renderer.currentFocusedRenderable?.blur()
    const timeout = setTimeout(() => dialogRef.current?.focus(), 0)
    return () => clearTimeout(timeout)
  }, [renderer])

  useKeyboard((key) => {
    key.preventDefault()
    key.stopPropagation()
    if (key.repeated || key.eventType !== "press" || key.ctrl || key.meta || key.option) return
    if (key.name === "escape" || key.name === "n") onClose()
    else if (key.name === "y" || key.name === "enter" || key.name === "return") onApprove()
    else if (key.name === "up" || key.name === "down") {
      scrollRef.current?.scrollBy(key.name === "up" ? -1 : 1)
    }
  })

  return (
    <ModalSurface
      id="runner-autostart-trust-modal"
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
