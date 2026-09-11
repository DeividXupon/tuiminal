import type { BoxRenderable, ScrollBoxRenderable } from "@opentui/core"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import { Button } from "@tuiparts/react/button"
import { useEffect, useMemo, useRef } from "react"
import { COLORS } from "../../../core/settings/theme"
import { translateUi } from "../../../shared/i18n/index"
import { InlineButton } from "../../../shared/ui/InlineButton"
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
  for (const [index, command] of review.commands.entries()) {
    lines.push(
      "",
      `${translateUi("COMANDO")} ${index + 1} · ${command.label}`,
      command.command,
      `${translateUi("DIRETÓRIO")}  ${command.cwd}`,
      `${translateUi("VARIÁVEIS")}  ${command.environmentNames.join(", ") || translateUi("nenhuma")}`,
      `${translateUi("ARQUIVO DE AMBIENTE")}  ${command.environmentFile ?? translateUi("nenhuma")}`,
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
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          zIndex: 981,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <box
          ref={dialogRef}
          id="runner-autostart-trust-modal"
          focusable
          style={{
            width,
            height,
            border: true,
            borderStyle: "rounded",
            borderColor: COLORS.warning,
            backgroundColor: COLORS.canvas,
            paddingLeft: 1,
            paddingRight: 1,
          }}
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
        </box>
      </box>
    </>
  )
}
