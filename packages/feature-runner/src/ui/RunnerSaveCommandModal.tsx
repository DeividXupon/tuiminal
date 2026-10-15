import { ShortcutText } from "@xupon/tuiminal-core/ui/ShortcutText"
import type { BoxRenderable, InputRenderable } from "@opentui/core"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import { useCallback, useEffect, useRef, useState } from "react"
import { translateUi, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { ModalSurface } from "@xupon/tuiminal-core/ui/ModalSurface"

export type RunnerCommandSaveInput = {
  label: string
  command: string
  interactive: boolean
}

type RunnerSaveCommandModalProps = {
  open: boolean
  command: string
  availableWidth: number
  onClose: () => void
  onSave: (input: RunnerCommandSaveInput) => void
}

export function RunnerSaveCommandModal({
  open,
  command,
  availableWidth,
  onClose,
  onSave,
}: RunnerSaveCommandModalProps) {
  const renderer = useRenderer()
  const terminal = useTerminalDimensions()
  const dialogRef = useRef<BoxRenderable | null>(null)
  const nameRef = useRef<InputRenderable | null>(null)
  const nameValueRef = useRef("")
  const [name, setName] = useState("")
  const [interactive, setInteractive] = useState(false)

  const submit = useCallback(() => {
    const label = nameValueRef.current.trim()
    const normalizedCommand = command.trim()
    if (!label || !normalizedCommand) return
    onSave({ label, command: normalizedCommand, interactive })
  }, [command, interactive, onSave])

  const toggleInteractive = useCallback(() => {
    setInteractive((current) => !current)
  }, [])

  useEffect(() => {
    if (!open) return
    renderer.currentFocusedRenderable?.blur()
    nameValueRef.current = ""
    setName("")
    setInteractive(false)
    const timeout = setTimeout(() => nameRef.current?.focus(), 0)
    return () => clearTimeout(timeout)
  }, [open, renderer])

  useKeyboard((key) => {
    if (!open) return
    if (key.name === "escape") {
      key.preventDefault()
      key.stopPropagation()
      if (renderer.currentFocusedRenderable?.id === "runner-save-command-name") {
        nameRef.current?.blur()
        dialogRef.current?.focus()
        return
      }
      onClose()
    } else if (key.ctrl && key.name === "p") {
      key.preventDefault()
      key.stopPropagation()
      toggleInteractive()
    } else if (key.ctrl && key.name === "s") {
      key.preventDefault()
      key.stopPropagation()
      submit()
    }
  })

  if (!open) return null

  const width = Math.max(1, Math.min(88, availableWidth - 2))
  const height = Math.max(1, Math.min(19, terminal.height - 2))
  const compact = width < 64
  const contentWidth = Math.max(8, width - 6)

  return (
    <ModalSurface
      id="runner-save-command-modal"
      dialogRef={dialogRef}
      width={width}
      height={height}
      zIndex={970}
      borderColor={COLORS.runner}
      onBackdropPress={onClose}
    >
      <box
        style={{
          height: 2,
          flexShrink: 0,
          flexDirection: "row",
          justifyContent: "space-between",
          border: ["bottom"],
          borderColor: COLORS.border,
        }}
      >
        <text content={translateUi("◆ SALVAR COMANDO")} style={{ fg: COLORS.runner }} />
        <InlineButton label="[Esc] Cancelar" accent={COLORS.runner} onPress={onClose} />
      </box>

      <text
        content={translateUi("Este comando ficará salvo somente neste projeto.")}
        style={{ fg: COLORS.muted, marginTop: 1 }}
      />

      <box
        style={{
          height: 3,
          flexShrink: 0,
          marginTop: 1,
          paddingLeft: 1,
          paddingRight: 1,
          backgroundColor: COLORS.panel,
        }}
      >
        <text content={translateUi("COMANDO")} style={{ fg: COLORS.runner }} />
        <text content={truncateDisplay(command.trim(), contentWidth)} style={{ fg: COLORS.text }} />
      </box>

      <box style={{ height: 1, flexShrink: 0, flexDirection: "row", marginTop: 1 }}>
        <text content={translateUi("Nome")} style={{ width: 8, flexShrink: 0, fg: COLORS.muted }} />
        <input
          ref={nameRef}
          id="runner-save-command-name"
          value={name}
          placeholder={translateUi("Ex.: Servidor local")}
          width={Math.max(4, width - 14)}
          maxLength={80}
          onMouseDown={() => nameRef.current?.focus()}
          onInput={(value) => {
            nameValueRef.current = value
            setName(value)
          }}
          onSubmit={submit}
          style={{
            backgroundColor: COLORS.panelRaised,
            focusedBackgroundColor: COLORS.panelRaised,
            textColor: COLORS.text,
            focusedTextColor: COLORS.text,
            cursorColor: COLORS.runner,
            placeholderColor: COLORS.muted,
          }}
        />
      </box>

      <box style={{ height: 1, flexShrink: 0, flexDirection: "row", marginTop: 1 }}>
        <text content="PTY     " style={{ fg: COLORS.muted }} />
        <InlineButton
          label={interactive ? "[Ctrl+P] Ativado" : "[Ctrl+P] Desativado"}
          accent={interactive ? COLORS.success : COLORS.runner}
          active={interactive}
          onPress={toggleInteractive}
        />
      </box>

      <box
        style={{
          minHeight: 3,
          flexGrow: 1,
          marginTop: 1,
          paddingLeft: 1,
          paddingRight: 1,
          backgroundColor: COLORS.panel,
        }}
      >
        <text
          content={translateUi(
            compact
              ? "PTY cria um terminal interativo."
              : "PTY cria um terminal interativo ligado ao comando.",
          )}
          style={{ fg: COLORS.runner }}
        />
        <text
          content={translateUi(
            compact
              ? "Use em shells, menus, REPLs ou comandos que pedem entrada."
              : "Ative para shells, REPLs, menus ou programas que pedem entrada.",
          )}
          style={{ fg: COLORS.text }}
        />
        <text
          content={translateUi(
            compact
              ? "Scripts e servidores de log normalmente não precisam."
              : "Para scripts e servidores que apenas mostram logs, deixe desativado.",
          )}
          style={{ fg: COLORS.muted }}
        />
      </box>

      <box
        style={{
          height: 1,
          flexShrink: 0,
          flexDirection: "row",
          justifyContent: "space-between",
          marginTop: 1,
        }}
      >
        <ShortcutText
          content={translateUi(
            compact ? "[Ctrl+P] PTY · [Esc] cancelar" : "[Ctrl+P] alternar PTY · [Esc] cancelar",
          )}
          style={{ fg: COLORS.muted }}
        />
        <InlineButton
          label="[Enter] Salvar"
          accent={COLORS.runner}
          disabled={!name.trim()}
          onPress={submit}
        />
      </box>
    </ModalSurface>
  )
}
