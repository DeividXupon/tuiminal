import type { BoxRenderable } from "@opentui/core"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { ShortcutText } from "@xupon/tuiminal-core/ui/ShortcutText"
import { useEffect, useRef } from "react"

export const TERMINAL_ACTIONS = [
  ["n", "[N] Novo terminal"],
  ["c", "[C] Nova seção"],
  ["a", "[A] Novo Codex"],
  ["v", "[V] Dividir lado"],
  ["h", "[H] Dividir abaixo"],
  ["s", "[S] Mensagens enviadas"],
  ["alt+1", "[Alt+1] Banco"],
  ["alt+2", "[Alt+2] Git"],
  ["alt+3", "[Alt+3] Runner"],
  ["alt+4", "[Alt+4] HTTP"],
  ["alt+5", "[Alt+5] Free Terminal"],
  ["b", "[B] Fixar / soltar barra"],
  ["l", "[L] Focar barra lateral"],
  ["e", "[E] Renomear terminal"],
  ["d", "[D] Live Diff"],
  ["r", "[R] Reiniciar terminal"],
  ["x", "[X] Fechar terminal"],
  ["g", "[G] Liberar atalhos globais"],
  [",", "[,] Configurações"],
  ["q", "[Q] Sair do Tuiminal"],
  ["escape", "[Esc] Cancelar"],
] as const

export function terminalActionKey(key: {
  name: string
  sequence?: string
  raw?: string
  meta?: boolean
  option?: boolean
  ctrl?: boolean
  shift?: boolean
  super?: boolean
}) {
  if (key.meta || key.option) {
    if (key.ctrl || key.shift || key.super) return null
    const number = [key.name, key.sequence, key.raw].find((value) => /^[1-5]$/.test(value ?? ""))
    return number ? `alt+${number}` : null
  }
  if (key.ctrl || key.shift || key.super) return null
  return [key.name, key.sequence, key.raw].includes(",") ? "," : key.name
}

export function TerminalActions({
  width,
  height,
  onAction,
  disabled,
}: {
  width: number
  height: number
  onAction: (key: string) => void
  disabled: (key: string) => boolean
}) {
  const ref = useRef<BoxRenderable | null>(null)
  useEffect(() => {
    ref.current?.focus()
  }, [])
  const columns = Math.max(1, Math.floor(width / 29))
  const rows = Array.from({ length: Math.ceil(TERMINAL_ACTIONS.length / columns) }, (_, index) =>
    TERMINAL_ACTIONS.slice(index * columns, (index + 1) * columns),
  )
  return (
    <box
      id="terminal-actions"
      ref={ref}
      focusable
      style={{
        height: Math.min(height, rows.length + 1),
        flexShrink: 0,
        backgroundColor: COLORS.panelAlt,
      }}
    >
      <ShortcutText
        content="Master Key · [1–9] agente ou terminal · [Esc] cancelar"
        style={{ fg: COLORS.terminal, height: 1 }}
      />
      <scrollbox scrollY style={{ flexGrow: 1 }}>
        {rows.map((row) => (
          <box key={row[0]![0]} style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
            {row.map(([key, label]) => (
              <box key={key} style={{ width: `${100 / columns}%` }}>
                <InlineButton
                  compact
                  id={`terminal-action-${key}`}
                  label={label}
                  accent={COLORS.terminal}
                  disabled={disabled(key)}
                  onPress={() => onAction(key)}
                />
              </box>
            ))}
          </box>
        ))}
      </scrollbox>
    </box>
  )
}
