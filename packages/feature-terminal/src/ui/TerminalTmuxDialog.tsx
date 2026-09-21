import type { BoxRenderable, ScrollBoxRenderable } from "@opentui/core"
import { useKeyboard, useTerminalDimensions } from "@opentui/react"
import { Button } from "@tuiparts/react/button"
import { useEffect, useRef, useState } from "react"
import { translateUi, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { ModalSurface } from "@xupon/tuiminal-core/ui/ModalSurface"
import { cleanTerminalName } from "../model/sessions"
import { tmuxPaneKey, tmuxPaneLabel, type TmuxPaneInfo } from "../model/tmux"
import { discoverTmuxPanes } from "../services/tmux-discovery"

export function TerminalTmuxDialog({
  onSelect,
  onClose,
}: {
  onSelect: (session: TmuxPaneInfo) => void
  onClose: () => void
}) {
  const dimensions = useTerminalDimensions()
  const dialogRef = useRef<BoxRenderable | null>(null)
  const scrollRef = useRef<ScrollBoxRenderable | null>(null)
  const [panes, setPanes] = useState<TmuxPaneInfo[]>([])
  const [index, setIndex] = useState(0)
  const [revision, setRevision] = useState(0)
  const [message, setMessage] = useState("Buscando painéis tmux…")
  useEffect(() => {
    void revision
    const controller = new AbortController()
    dialogRef.current?.focus()
    setMessage("Buscando painéis tmux…")
    setPanes([])
    void discoverTmuxPanes(controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return
        setPanes(result.panes)
        setIndex(0)
        setMessage(
          !result.available
            ? "Sem tmux: novos terminais continuam disponíveis no modo nativo."
            : result.panes.length
              ? ""
              : "Nenhum painel tmux externo encontrado.",
        )
      })
      .catch(() => {
        if (!controller.signal.aborted) setMessage("Não foi possível listar os painéis tmux.")
      })
    return () => controller.abort()
  }, [revision])
  useEffect(() => {
    scrollRef.current?.scrollChildIntoView(`terminal-dialog-tmux-${index}`)
  }, [index])
  const select = () => {
    const session = panes[index]
    if (session) onSelect(session)
  }
  useKeyboard((key) => {
    key.preventDefault()
    key.stopPropagation()
    if (key.name === "escape") onClose()
    else if (key.name === "r") setRevision((value) => value + 1)
    else if (key.name === "enter" || key.name === "return") select()
    else if (panes.length && ["up", "k", "down", "j"].includes(key.name))
      setIndex(
        (value) =>
          (value + (["up", "k"].includes(key.name) ? -1 : 1) + panes.length) % panes.length,
      )
  })
  const width = Math.max(1, Math.min(84, dimensions.width - 2))
  return (
    <ModalSurface
      dialogRef={dialogRef}
      id="terminal-dialog-tmux"
      width={width}
      height={Math.min(dimensions.height, 18)}
      borderColor={COLORS.terminal}
      zIndex={800}
      onBackdropPress={onClose}
    >
      <text
        content={translateUi("Espelhar painel tmux")}
        style={{ height: 1, fg: COLORS.terminal }}
      />
      <text
        content={translateUi(
          "Escolha o painel com seu agente. A tela e o teclado serão compartilhados.",
        )}
        style={{ fg: COLORS.muted, flexShrink: 0 }}
      />
      <text
        content={translateUi("Terminais externos fora do tmux ainda não podem ser espelhados.")}
        style={{ fg: COLORS.muted, flexShrink: 0 }}
      />
      <text
        content={translateUi(
          "O tamanho original se ajusta ao espelho e é restaurado ao desconectar.",
        )}
        style={{ fg: COLORS.muted, flexShrink: 0 }}
      />
      <scrollbox ref={scrollRef} scrollY style={{ flexGrow: 1 }}>
        {message && <text content={translateUi(message)} style={{ fg: COLORS.muted }} />}
        {panes.map((session, cursor) => (
          <Button
            key={tmuxPaneKey(session)}
            id={`terminal-dialog-tmux-${cursor}`}
            height={2}
            onPress={() => onSelect(session)}
          >
            <box style={{ height: 2 }}>
              <text
                content={truncateDisplay(cleanTerminalName(tmuxPaneLabel(session)), width - 6)}
                style={{ fg: index === cursor ? COLORS.terminal : COLORS.text, height: 1 }}
              />
              <text
                content={truncateDisplay(session.cwd.replace(/[\p{Cc}\p{Cf}]/gu, ""), width - 6)}
                style={{ fg: COLORS.muted, height: 1 }}
              />
            </box>
          </Button>
        ))}
      </scrollbox>
      <box style={{ flexDirection: "row", height: 1, flexShrink: 0 }}>
        <InlineButton compact label="[Enter] Espelhar" disabled={!panes.length} onPress={select} />
        <InlineButton
          compact
          label="[R] Atualizar"
          onPress={() => setRevision((value) => value + 1)}
        />
        <InlineButton compact label="[Esc] Cancelar" onPress={onClose} />
      </box>
    </ModalSurface>
  )
}
