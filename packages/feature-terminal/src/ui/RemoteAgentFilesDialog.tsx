import { BorderChars, type BoxRenderable, type InputRenderable } from "@opentui/core"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import { translateUi, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { ModalSurface } from "@xupon/tuiminal-core/ui/ModalSurface"
import { useEffect, useRef, useState } from "react"
import type { RemoteAgentFilesState } from "../hooks/use-remote-agent-files"
import { REMOTE_AGENT_FILES_ROOT } from "../services/remote-agent-upload"
import { agentFileSize, RemoteAgentFileList } from "./RemoteAgentFileList"
import { RemoteAgentFilesFeedback } from "./RemoteAgentFilesFeedback"
import { TerminalInlineButton, TerminalShortcutText } from "./TerminalShortcut"

export function RemoteAgentFilesDialog({
  state,
  onConfirm,
  onClose,
  onAdd,
  onRemove,
}: {
  state: RemoteAgentFilesState
  onConfirm: () => void
  onClose: () => void
  onAdd: (text: string) => void
  onRemove: (path: string) => void
}) {
  const ref = useRef<BoxRenderable | null>(null)
  const input = useRef<InputRenderable | null>(null)
  const renderer = useRenderer()
  const dimensions = useTerminalDimensions()
  const width = Math.max(1, Math.min(88, dimensions.width - 2))
  const height = Math.max(1, Math.min(24, dimensions.height - 2))
  const compact = height < 17
  const [editing, setEditing] = useState(false)
  const [path, setPath] = useState("")
  const [cursor, setCursor] = useState(0)
  const selected = Math.min(cursor, Math.max(0, state.files.length - 1))
  const busy = state.phase === "checking" || state.phase === "uploading"
  const files = [...state.completed, ...state.files]
  const total = files.reduce((sum, file) => sum + file.size, 0)
  const focus = () => ref.current?.focus()
  const confirm = () => {
    focus()
    onConfirm()
  }
  useEffect(() => {
    ref.current?.focus()
  }, [])
  useEffect(() => {
    if (editing) input.current?.focus()
  }, [editing])
  const addPath = () => {
    if (!busy) setEditing(true)
  }
  const remove = () => {
    const file = state.files[selected]
    if (!busy && file) {
      onRemove(file.path)
      focus()
    }
  }
  useKeyboard((key) => {
    const id = renderer.currentFocusedRenderable?.id ?? ""
    if (!id.startsWith("terminal-agent-files-")) return
    if (id === "terminal-agent-files-path" && key.name !== "escape") return
    key.preventDefault()
    key.stopPropagation()
    if (key.name === "escape") {
      if (editing) {
        setEditing(false)
        focus()
      } else onClose()
      return
    }
    if (busy) return
    switch (key.name) {
      case "enter":
      case "return":
        if (state.files.length) confirm()
        else addPath()
        break
      case "a":
        addPath()
        break
      case "delete":
      case "backspace":
        remove()
        break
      case "up":
      case "k":
        setCursor(Math.max(0, selected - 1))
        break
      case "down":
      case "j":
        setCursor(Math.max(0, Math.min(state.files.length - 1, selected + 1)))
        break
    }
  })
  const status = {
    checking: "Verificando anexo…",
    uploading: "Enviando arquivos…",
    error: "Envio pendente",
    confirm: "Local → servidor",
  }[state.phase]
  return (
    <ModalSurface
      id="terminal-agent-files-dialog"
      dialogRef={ref}
      width={width}
      height={height}
      borderColor={COLORS.terminal}
      zIndex={850}
      onBackdropPress={onClose}
    >
      <box
        style={{ height: 1, flexShrink: 0, flexDirection: "row", justifyContent: "space-between" }}
      >
        <text content={`↑ ${translateUi("Enviar arquivos")}`} style={{ fg: COLORS.text }} />
        {width >= 64 && <text content={translateUi(status)} style={{ fg: COLORS.terminal }} />}
      </box>
      <box
        style={{
          height: compact ? 2 : 4,
          flexShrink: 0,
          marginTop: compact ? 0 : 1,
          paddingLeft: 1,
          border: ["left"],
          borderColor: COLORS.terminal,
          backgroundColor: COLORS.panel,
        }}
      >
        {!compact && (
          <text
            content={translateUi("SERVIDOR DE DESTINO")}
            style={{ height: 1, fg: COLORS.muted }}
          />
        )}
        <text
          content={truncateDisplay(`${state.profile.name} · ${state.profile.host}`, width - 6)}
          style={{ height: 1, fg: COLORS.text }}
        />
        <text content={`${REMOTE_AGENT_FILES_ROOT}/`} style={{ height: 1, fg: COLORS.terminal }} />
      </box>
      <box
        style={{
          height: 1,
          flexShrink: 0,
          marginTop: compact ? 0 : 1,
          flexDirection: "row",
          justifyContent: "space-between",
        }}
      >
        <text
          content={`${translateUi("ARQUIVOS")} · ${files.length}`}
          style={{ fg: COLORS.muted }}
        />
        <text content={agentFileSize(total)} style={{ fg: COLORS.muted }} />
      </box>
      {files.length ? (
        <RemoteAgentFileList
          state={state}
          selected={selected}
          width={width - 4}
          compact={compact}
          onSelect={(index) => {
            setCursor(index)
            focus()
          }}
        />
      ) : (
        <box
          style={{
            flexGrow: 1,
            minHeight: compact ? 1 : 4,
            border: compact ? [] : true,
            borderColor: COLORS.border,
            justifyContent: "center",
            alignItems: "center",
          }}
          customBorderChars={{ ...BorderChars.rounded, horizontal: "┄", vertical: "┆" }}
        >
          <text content={translateUi("Solte arquivos aqui")} style={{ fg: COLORS.text }} />
          {!compact && (
            <text
              content={translateUi("ou cole os caminhos completos")}
              style={{ fg: COLORS.muted }}
            />
          )}
        </box>
      )}
      {editing && (
        <box style={{ height: 3, flexShrink: 0, border: true, borderColor: COLORS.terminal }}>
          <input
            ref={input}
            id="terminal-agent-files-path"
            value={path}
            onInput={setPath}
            placeholder={translateUi("Caminho local do arquivo")}
            onSubmit={() => {
              if (!path.trim()) return
              onAdd(path)
              setPath("")
              setEditing(false)
              focus()
            }}
            style={{
              flexGrow: 1,
              focusedBackgroundColor: COLORS.panelRaised,
              focusedTextColor: COLORS.text,
            }}
          />
        </box>
      )}
      <RemoteAgentFilesFeedback state={state} />
      <box
        style={{ height: 1, flexShrink: 0, flexDirection: "row", justifyContent: "space-between" }}
      >
        <TerminalInlineButton
          id="terminal-agent-files-add"
          compact
          label="[A] Adicionar caminho"
          disabled={busy}
          onPress={addPath}
        />
        <TerminalInlineButton
          id="terminal-agent-files-remove"
          compact
          label="[Del] Remover"
          disabled={busy || !state.files.length}
          onPress={remove}
        />
      </box>
      <box
        style={{
          height: 1,
          flexShrink: 0,
          marginTop: compact ? 0 : 1,
          flexDirection: "row",
          justifyContent: "space-between",
        }}
      >
        <TerminalInlineButton
          id="terminal-agent-files-cancel"
          compact
          label="[Esc] Cancelar"
          onPress={onClose}
        />
        <TerminalInlineButton
          id="terminal-agent-files-send"
          compact
          label="[Enter] Enviar"
          accent={COLORS.terminal}
          selected={!busy && state.files.length > 0}
          disabled={busy || !state.files.length}
          onPress={confirm}
        />
      </box>
      {!compact && (
        <TerminalShortcutText
          content={translateUi("[↑/↓] Selecionar")}
          style={{ height: 1, flexShrink: 0, fg: COLORS.muted }}
        />
      )}
    </ModalSurface>
  )
}
