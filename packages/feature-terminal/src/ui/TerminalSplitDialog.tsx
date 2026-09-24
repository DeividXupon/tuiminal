import type { BoxRenderable, ScrollBoxRenderable } from "@opentui/core"
import { useKeyboard, useTerminalDimensions } from "@opentui/react"
import { translateUi, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { ModalSurface } from "@xupon/tuiminal-core/ui/ModalSurface"
import { useEffect, useMemo, useRef, useState } from "react"
import type { TerminalSession } from "../model/sessions"
import { agentPresentation } from "../rendering/agent-presentation"
import { TerminalInlineButton, TerminalShortcutText } from "./TerminalShortcut"

type SplitOption = { kind: "new" } | { kind: "agent"; session: TerminalSession }

export function TerminalSplitDialog({
  down,
  agents,
  canCreateTerminal,
  onCreateTerminal,
  onSelectAgent,
  onClose,
}: {
  down: boolean
  agents: readonly TerminalSession[]
  canCreateTerminal: boolean
  onCreateTerminal: () => void
  onSelectAgent: (id: string) => void
  onClose: () => void
}) {
  const dimensions = useTerminalDimensions()
  const dialog = useRef<BoxRenderable | null>(null)
  const list = useRef<ScrollBoxRenderable | null>(null)
  const options = useMemo<SplitOption[]>(
    () => [
      ...(canCreateTerminal ? ([{ kind: "new" }] as const) : []),
      ...agents.map((session) => ({ kind: "agent" as const, session })),
    ],
    [agents, canCreateTerminal],
  )
  const [selected, setSelected] = useState(0)
  const choose = (option: SplitOption | undefined) => {
    if (option?.kind === "new") onCreateTerminal()
    else if (option?.kind === "agent") onSelectAgent(option.session.id)
  }

  useEffect(() => {
    dialog.current?.focus()
  }, [])
  useEffect(() => {
    setSelected((current) => Math.min(current, Math.max(0, options.length - 1)))
  }, [options.length])
  useEffect(() => {
    list.current?.scrollChildIntoView(`terminal-split-option-${selected}`)
  }, [selected])
  useKeyboard((key) => {
    key.preventDefault()
    key.stopPropagation()
    if (key.name === "escape") {
      onClose()
      return
    }
    if (key.name.toLowerCase() === "n" && canCreateTerminal) {
      onCreateTerminal()
      return
    }
    const direction =
      key.name === "up" || key.name.toLowerCase() === "k"
        ? -1
        : key.name === "down" || key.name.toLowerCase() === "j"
          ? 1
          : 0
    if (direction && options.length) {
      setSelected((current) => (current + direction + options.length) % options.length)
      return
    }
    if (key.name === "enter" || key.name === "return") choose(options[selected])
  })

  const width = Math.max(1, Math.min(64, dimensions.width - 2))
  const height = Math.max(1, Math.min(18, dimensions.height - 2, 8 + agents.length * 2))
  return (
    <ModalSurface
      dialogRef={dialog}
      id="terminal-split-dialog"
      width={width}
      height={height}
      borderColor={COLORS.terminal}
      zIndex={820}
      onBackdropPress={onClose}
    >
      <text
        content={translateUi(down ? "Dividir abaixo" : "Dividir à direita")}
        style={{ height: 1, flexShrink: 0, fg: COLORS.terminal }}
      />
      <text
        content={translateUi("O que deseja colocar no novo painel?")}
        style={{ height: 1, flexShrink: 0, fg: COLORS.text }}
      />
      <scrollbox ref={list} id="terminal-split-options" scrollY style={{ flexGrow: 1 }}>
        {canCreateTerminal && (
          // biome-ignore lint/a11y/noStaticElementInteractions: The row is also reachable with keyboard navigation.
          <box
            id="terminal-split-option-0"
            onMouseDown={() => choose({ kind: "new" })}
            style={{
              height: 2,
              flexShrink: 0,
              backgroundColor: selected === 0 ? COLORS.panelRaised : COLORS.canvas,
            }}
          >
            <TerminalShortcutText
              content={`${selected === 0 ? "›" : " "} [N] ${translateUi("Novo terminal")}`}
              style={{ fg: selected === 0 ? COLORS.focus : COLORS.text }}
            />
            <text
              content={`  ${translateUi("Inicia um novo shell nesta divisão.")}`}
              style={{ fg: COLORS.muted }}
            />
          </box>
        )}
        <text
          content={translateUi("AGENTES EXISTENTES")}
          style={{ height: 1, flexShrink: 0, fg: COLORS.muted }}
        />
        {agents.map((session, agentIndex) => {
          const index = agentIndex + (canCreateTerminal ? 1 : 0)
          const presentation = agentPresentation(
            session.agent?.state ?? "unknown",
            0,
            session.agent?.activity ?? null,
          )
          return (
            // biome-ignore lint/a11y/noStaticElementInteractions: The row is also reachable with keyboard navigation.
            <box
              key={session.id}
              id={`terminal-split-option-${index}`}
              onMouseDown={() => choose({ kind: "agent", session })}
              style={{
                height: 2,
                flexShrink: 0,
                backgroundColor: selected === index ? COLORS.panelRaised : COLORS.canvas,
              }}
            >
              <box style={{ height: 1, flexDirection: "row" }}>
                <text
                  content={`${selected === index ? "›" : " "} ${presentation.marker} `}
                  style={{ flexShrink: 0, fg: presentation.color }}
                />
                <text
                  content={truncateDisplay(
                    session.agent?.taskTitle || session.agent?.label || session.title,
                    Math.max(1, width - 20),
                  )}
                  style={{ flexGrow: 1, fg: selected === index ? COLORS.focus : COLORS.text }}
                />
                <text
                  content={presentation.shortLabel}
                  style={{ flexShrink: 0, fg: presentation.color }}
                />
              </box>
              <text
                content={`  ${truncateDisplay(session.title, Math.max(1, width - 6))}`}
                style={{ fg: COLORS.muted }}
              />
            </box>
          )
        })}
        {!agents.length && (
          <text
            content={`  ${translateUi("Nenhum agente disponível.")}`}
            style={{ fg: COLORS.muted }}
          />
        )}
      </scrollbox>
      <box style={{ height: 1, flexDirection: "row", flexShrink: 0 }}>
        <TerminalInlineButton
          compact
          label="[Enter] Selecionar"
          onPress={() => choose(options[selected])}
        />
        <TerminalInlineButton compact label="[Esc] Cancelar" onPress={onClose} />
      </box>
    </ModalSurface>
  )
}
