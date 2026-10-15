import type { BoxRenderable, ScrollBoxRenderable } from "@opentui/core"
import { useKeyboard, useTerminalDimensions } from "@opentui/react"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { COLORS, type TerminalRemoteCodexProfile } from "@xupon/tuiminal-core/settings/theme"
import { ModalSurface } from "@xupon/tuiminal-core/ui/ModalSurface"
import { PlasmaLoadingOverlay } from "@xupon/tuiminal-core/ui/PlasmaLoadingOverlay"
import { useEffect, useRef, useState } from "react"
import type { AgentProjectTarget } from "../services/agent-project-directories"
import { TerminalShortcutText } from "./TerminalShortcut"

export function AgentProjectEnvironmentDialog({
  profiles,
  loading,
  error,
  onSelect,
  onClose,
  inactive = false,
}: {
  profiles: readonly TerminalRemoteCodexProfile[]
  loading: boolean
  error: string
  onSelect: (target: AgentProjectTarget) => void
  onClose: () => void
  /** Renders without taking focus or keyboard input, as in simulated tutorials. */
  inactive?: boolean
}) {
  const dimensions = useTerminalDimensions()
  const dialog = useRef<BoxRenderable | null>(null)
  const list = useRef<ScrollBoxRenderable | null>(null)
  const [selected, setSelected] = useState(0)
  const targets: AgentProjectTarget[] = [
    { kind: "local" },
    ...profiles.map((profile) => ({ kind: "remote" as const, profile })),
  ]
  const choose = (index: number) => {
    const target = targets[index]
    if (target) onSelect(target)
  }
  useEffect(() => {
    if (!inactive) dialog.current?.focus()
  }, [inactive])
  useEffect(() => {
    list.current?.scrollChildIntoView(`terminal-dialog-project-environment-${selected}`)
  }, [selected])
  useKeyboard((key) => {
    if (inactive || !["escape", "up", "down", "enter", "return"].includes(key.name)) return
    key.preventDefault()
    key.stopPropagation()
    if (key.name === "escape") onClose()
    else if (loading) return
    else if (key.name === "up" || key.name === "down")
      setSelected(
        (value) => (value + (key.name === "up" ? -1 : 1) + targets.length) % targets.length,
      )
    else choose(selected)
  })
  return (
    <ModalSurface
      dialogRef={dialog}
      id="terminal-dialog-project-environments"
      width={Math.max(1, Math.min(70, dimensions.width - 2))}
      height={Math.max(1, Math.min(18, dimensions.height - 2))}
      zIndex={830}
      borderColor={COLORS.terminal}
      onBackdropPress={onClose}
    >
      <text
        content={translateUi("Ambiente de execução")}
        style={{ height: 1, flexShrink: 0, fg: COLORS.terminal }}
      />
      <box style={{ position: "relative", flexGrow: 1, minHeight: 0 }}>
        <scrollbox ref={list} scrollY style={{ flexGrow: 1, minHeight: 0 }}>
          {targets.map((target, index) => (
            // biome-ignore lint/a11y/noStaticElementInteractions: keyboard selection is owned by this modal.
            <box
              key={target.kind === "local" ? "local" : target.profile.id}
              id={`terminal-dialog-project-environment-${index}`}
              onMouseDown={() => choose(index)}
              style={{
                height: 1,
                flexShrink: 0,
                backgroundColor: selected === index ? COLORS.panelRaised : COLORS.panel,
              }}
            >
              <text
                wrapMode="none"
                content={`${index === selected ? "›" : " "} ${target.kind === "local" ? translateUi("Local") : `${translateUi("Remoto")} · ${target.profile.name}`}`}
                style={{ fg: selected === index ? COLORS.focus : COLORS.text }}
              />
            </box>
          ))}
          {!loading && !profiles.length && (
            <text
              content={translateUi("Nenhum alias SSH encontrado.")}
              style={{ fg: COLORS.muted }}
            />
          )}
          {error && <text content={translateUi(error)} style={{ fg: COLORS.warning }} />}
        </scrollbox>
        <PlasmaLoadingOverlay
          id="terminal-environment-loader"
          active={loading}
          label="Carregando ~/.ssh/config…"
          accent={COLORS.terminal}
          background={COLORS.canvas}
        />
      </box>
      <TerminalShortcutText
        content={translateUi("[↑/↓] navegar · [Enter] selecionar · [Esc] cancelar")}
        style={{ height: 1, flexShrink: 0, fg: COLORS.muted }}
      />
    </ModalSurface>
  )
}
