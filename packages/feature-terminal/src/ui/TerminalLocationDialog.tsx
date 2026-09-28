import type { BoxRenderable, KeyEvent } from "@opentui/core"
import { useKeyboard, useTerminalDimensions } from "@opentui/react"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import type { TerminalRemoteCodexProfile } from "@xupon/tuiminal-core/settings/theme"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { ModalSurface } from "@xupon/tuiminal-core/ui/ModalSurface"
import { useEffect, useRef, useState } from "react"
import { TerminalShortcutText } from "./TerminalShortcut"

function consume(key: KeyEvent) {
  key.preventDefault()
  key.stopPropagation()
}

export function TerminalLocationDialog({
  profile,
  onLocal,
  onRemote,
  onClose,
}: {
  profile: TerminalRemoteCodexProfile
  onLocal: () => void
  onRemote: () => void
  onClose: () => void
}) {
  const dialog = useRef<BoxRenderable | null>(null)
  const dimensions = useTerminalDimensions()
  const [selected, setSelected] = useState<"local" | "remote">("local")
  useEffect(() => dialog.current?.focus(), [])
  useKeyboard((key) => {
    if (key.name === "escape") {
      consume(key)
      onClose()
      return
    }
    if (["up", "down", "left", "right", "j", "k"].includes(key.name.toLowerCase())) {
      consume(key)
      setSelected((current) => (current === "local" ? "remote" : "local"))
      return
    }
    if (key.name === "enter" || key.name === "return") {
      consume(key)
      if (selected === "local") onLocal()
      else onRemote()
    }
  })
  const row = (id: "local" | "remote", label: string, detail: string) => (
    // biome-ignore lint/a11y/noStaticElementInteractions: the same choices are keyboard-accessible through the focused modal.
    <box
      id={`terminal-location-${id}`}
      onMouseDown={() => {
        setSelected(id)
        if (id === "local") onLocal()
        else onRemote()
      }}
      style={{
        height: 2,
        flexShrink: 0,
        backgroundColor: selected === id ? COLORS.panelRaised : COLORS.panel,
      }}
    >
      <text
        content={`${selected === id ? "›" : " "} ${translateUi(label)}`}
        style={{ fg: selected === id ? COLORS.focus : COLORS.text }}
      />
      <text content={`  ${detail}`} style={{ fg: COLORS.muted }} />
    </box>
  )
  return (
    <ModalSurface
      dialogRef={dialog}
      id="terminal-location-dialog"
      width={Math.max(1, Math.min(64, dimensions.width - 2))}
      height={Math.max(1, Math.min(9, dimensions.height - 2))}
      zIndex={800}
      borderColor={COLORS.terminal}
      onBackdropPress={onClose}
    >
      <text
        content={`◆ ${translateUi("ONDE EXECUTAR O CODEX?")}`}
        style={{ height: 1, flexShrink: 0, fg: COLORS.terminal }}
      />
      <TerminalShortcutText
        content={translateUi("[↑/↓] navegar · [Enter] selecionar · [Esc] cancelar")}
        style={{ height: 1, flexShrink: 0, fg: COLORS.muted }}
      />
      {row("local", "Nesta máquina", translateUi("Escolha a pasta local antes de iniciar."))}
      {row("remote", "Servidor remoto", `${profile.name} · ~/.ssh/config`)}
    </ModalSurface>
  )
}
