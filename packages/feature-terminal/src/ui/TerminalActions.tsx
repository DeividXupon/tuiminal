import type { BoxRenderable } from "@opentui/core"
import { useEffect, useRef } from "react"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { ShortcutText } from "@xupon/tuiminal-core/ui/ShortcutText"

export const TERMINAL_ACTIONS = [
  ["n", "[N] Novo terminal"],
  ["c", "[C] Nova seção"],
  ["/", "[/] Comando"],
  ["v", "[V] Dividir lado"],
  ["s", "[S] Dividir abaixo"],
  ["1", "[1] Primeiro terminal"],
  ["2", "[2] Segundo terminal"],
  ["m", "[M] Ampliar / restaurar"],
  ["b", "[B] Fixar / soltar barra"],
  ["l", "[L] Focar barra lateral"],
  ["e", "[E] Renomear terminal"],
  ["d", "[D] Live Diff"],
  ["r", "[R] Reiniciar terminal"],
  ["x", "[X] Fechar terminal"],
  ["g", "[G] Liberar atalhos globais"],
  ["escape", "[Esc] Cancelar"],
] as const

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
        content="Master Key · escolha uma ação · [Esc] cancelar"
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
