import { Button } from "@tuiparts/react/button"
import type { BoxRenderable, InputRenderable, ScrollBoxRenderable } from "@opentui/core"
import { useKeyboard, useTerminalDimensions } from "@opentui/react"
import { useEffect, useRef, useState } from "react"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { ModalSurface } from "@xupon/tuiminal-core/ui/ModalSurface"
import { translateUi, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import type { TerminalFolder } from "../model/sessions"

export type TerminalDialogKind = "command" | "folder" | "rename" | "move"
const TITLES = {
  command: "Novo comando",
  folder: "Nova pasta",
  rename: "Renomear terminal",
  move: "Mover seção",
}
export function TerminalDialog({
  kind,
  initialValue,
  folders,
  onSave,
  onClose,
}: {
  kind: TerminalDialogKind
  initialValue: string
  folders: TerminalFolder[]
  onSave: (value: string) => void
  onClose: () => void
}) {
  const dimensions = useTerminalDimensions()
  const scrollRef = useRef<ScrollBoxRenderable | null>(null)
  const dialogRef = useRef<BoxRenderable | null>(null)
  const ref = useRef<InputRenderable | null>(null)
  const [value, setValue] = useState(initialValue)
  const [index, setIndex] = useState(0)
  useEffect(() => {
    if (kind === "move") dialogRef.current?.focus()
    else ref.current?.focus()
  }, [kind])
  useEffect(() => {
    const folder = folders[index]
    if (folder) scrollRef.current?.scrollChildIntoView(`terminal-dialog-folder-${folder.id}`)
  }, [index, folders])
  const submit = () => {
    const chosen = kind === "move" ? folders[index]?.id : value.trim()
    if (chosen) onSave(chosen)
  }
  useKeyboard((key) => {
    if (key.name === "escape") {
      key.preventDefault()
      key.stopPropagation()
      onClose()
    } else if (kind === "move") {
      key.preventDefault()
      key.stopPropagation()
      if (key.name === "up" || key.name === "k")
        setIndex((index + folders.length - 1) % folders.length)
      if (key.name === "down" || key.name === "j") setIndex((index + 1) % folders.length)
      if (key.name === "return" || key.name === "enter") submit()
    }
  })
  return (
    <ModalSurface
      dialogRef={dialogRef}
      id="terminal-dialog"
      width={Math.max(1, Math.min(64, dimensions.width - 2))}
      height={Math.min(dimensions.height, kind === "move" ? Math.min(folders.length + 5, 16) : 7)}
      borderColor={COLORS.terminal}
      zIndex={800}
      onBackdropPress={onClose}
    >
      <text content={translateUi(TITLES[kind])} style={{ height: 1, fg: COLORS.terminal }} />
      {kind === "move" ? (
        <scrollbox ref={scrollRef} scrollY style={{ flexGrow: 1 }}>
          {folders.map((folder, cursor) => (
            <Button
              key={folder.id}
              height={1}
              id={`terminal-dialog-folder-${folder.id}`}
              onPress={() => onSave(folder.id)}
            >
              <text
                content={truncateDisplay(folder.name, Math.max(1, dimensions.width - 10))}
                style={{ fg: index === cursor ? COLORS.terminal : COLORS.text }}
              />
            </Button>
          ))}
        </scrollbox>
      ) : (
        <input
          ref={ref}
          id="terminal-command-input"
          value={value}
          onInput={setValue}
          onSubmit={submit}
          onMouseDown={() => ref.current?.focus()}
          width="100%"
          style={{
            backgroundColor: COLORS.panelRaised,
            textColor: COLORS.text,
            focusedBackgroundColor: COLORS.panelRaised,
            focusedTextColor: COLORS.text,
          }}
        />
      )}
      <box style={{ height: 1, flexDirection: "row", flexShrink: 0 }}>
        <InlineButton compact label="[Enter] Salvar" onPress={submit} />
        <InlineButton compact label="[Esc] Cancelar" onPress={onClose} />
      </box>
    </ModalSurface>
  )
}
