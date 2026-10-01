import type { BoxRenderable } from "@opentui/core"
import { useKeyboard, useTerminalDimensions } from "@opentui/react"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { ModalSurface } from "@xupon/tuiminal-core/ui/ModalSurface"
import { useEffect, useRef, useState } from "react"
import { AGENT_PROVIDERS, type AgentProviderId } from "../model/agent-provider"
import { AgentProviderWordmark } from "./AgentProviderWordmark"
import { TerminalShortcutText } from "./TerminalShortcut"

export function AgentProviderPicker({
  inactive = false,
  onSelect,
  onClose,
}: {
  inactive?: boolean
  onSelect: (id: AgentProviderId) => void
  onClose: () => void
}) {
  const dimensions = useTerminalDimensions()
  const dialog = useRef<BoxRenderable | null>(null)
  const [selected, setSelected] = useState(0)
  const choose = (index: number) => {
    const provider = AGENT_PROVIDERS[index]
    if (provider?.availability === "available") onSelect(provider.id)
  }
  useEffect(() => {
    if (!inactive) dialog.current?.focus()
  }, [inactive])
  useKeyboard((key) => {
    if (inactive || !["escape", "up", "down", "enter", "return"].includes(key.name)) return
    key.preventDefault()
    key.stopPropagation()
    if (key.name === "escape") onClose()
    else if (key.name === "up" || key.name === "down")
      setSelected(
        (value) =>
          (value + (key.name === "up" ? -1 : 1) + AGENT_PROVIDERS.length) % AGENT_PROVIDERS.length,
      )
    else choose(selected)
  })
  return (
    <ModalSurface
      dialogRef={dialog}
      id="terminal-dialog-agent-provider"
      width={Math.max(1, Math.min(64, dimensions.width - 2))}
      height={Math.max(1, Math.min(11, dimensions.height - 2))}
      zIndex={810}
      borderColor={COLORS.terminal}
      onBackdropPress={onClose}
    >
      <text
        content={translateUi("Escolha um agente")}
        style={{ height: 1, flexShrink: 0, fg: COLORS.terminal }}
      />
      <box style={{ flexGrow: 1, minHeight: 0 }}>
        {AGENT_PROVIDERS.map((provider, index) => {
          const disabled = provider.availability !== "available"
          return (
            // biome-ignore lint/a11y/noStaticElementInteractions: keyboard selection is owned by this modal.
            <box
              key={provider.id}
              id={`terminal-dialog-agent-provider-${provider.id}`}
              onMouseDown={() => {
                setSelected(index)
                choose(index)
              }}
              style={{
                height: 2,
                flexShrink: 0,
                backgroundColor: selected === index ? COLORS.panelRaised : COLORS.panel,
              }}
            >
              <text>
                <span
                  fg={disabled ? COLORS.muted : selected === index ? COLORS.focus : COLORS.text}
                >
                  {`${selected === index ? "›" : " "} `}
                </span>
                <AgentProviderWordmark providerId={provider.id} label={provider.label} />
              </text>
              <text
                content={`  ${disabled ? translateUi("Em breve") : translateUi("Disponível")}`}
                style={{ fg: disabled ? COLORS.muted : COLORS.success }}
              />
            </box>
          )
        })}
      </box>
      <TerminalShortcutText
        content={translateUi("[↑/↓] navegar · [Enter] selecionar · [Esc] cancelar")}
        style={{ height: 1, flexShrink: 0, fg: COLORS.muted }}
      />
    </ModalSurface>
  )
}
