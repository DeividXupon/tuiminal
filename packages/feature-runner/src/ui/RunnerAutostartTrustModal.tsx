import type { BoxRenderable, ScrollBoxRenderable } from "@opentui/core"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import { displayWidth, translateUi } from "@xupon/tuiminal-core/i18n/index"
import { useEffect, useMemo, useRef } from "react"
import type { RunnerAutostartReview } from "../storage/autostart-trust"
import { RunnerAutostartTrustView } from "./RunnerAutostartTrustView"

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
  const contentRows = content
    .split("\n")
    .reduce(
      (rows, line) => rows + Math.max(1, Math.ceil(displayWidth(line) / Math.max(1, width - 5))),
      0,
    )
  const height = Math.max(1, Math.min(24, terminal.height - 2, 8 + contentRows))

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
    <RunnerAutostartTrustView
      {...{ dialogRef, width, height, onClose, scrollRef, content, onApprove }}
    />
  )
}
