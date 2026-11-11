import type { ScrollBoxRenderable } from "@opentui/core"
import { useKeyboard, useRenderer } from "@opentui/react"
import { translateUi, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { ShortcutText } from "@xupon/tuiminal-core/ui/ShortcutText"
import { useEffect, useRef, useState } from "react"
import type { PostmanCollectionFolder } from "../postman/sync"
import { HttpDialog } from "./HttpDialog"
import { HttpDialogSection } from "./HttpDialogDetails"
import { HttpPostmanDestinationRow } from "./HttpPostmanDestinationRow"

type Destination = { filePath: string; label: string; folder?: { id: string; path: string } }

function destinations(
  files: Array<{ path: string }>,
  folders: PostmanCollectionFolder[],
): Destination[] {
  return files.flatMap((file) => {
    const label = file.path.slice("postman/".length).replace(/\.http$/iu, "")
    return [
      { filePath: file.path, label },
      ...folders
        .filter((folder) => folder.filePath === file.path)
        .map((folder) => ({
          filePath: file.path,
          label: `${label} / ${folder.path}`,
          folder: { id: folder.id, path: folder.path },
        })),
    ]
  })
}

export function HttpPostmanSaveModal({
  files,
  folders,
  requestName,
  terminalWidth,
  terminalHeight,
  onSelect,
  onClose,
}: {
  files: Array<{ path: string }>
  folders: PostmanCollectionFolder[]
  requestName: string
  terminalWidth: number
  terminalHeight: number
  onSelect: (path: string, folder?: { id: string; path: string }) => void
  onClose: () => void
}) {
  const renderer = useRenderer()
  const listRef = useRef<ScrollBoxRenderable | null>(null)
  const [selection, setSelection] = useState(0)
  const compact = terminalHeight < 20
  // biome-ignore lint/correctness/useExhaustiveDependencies: row heights change when the terminal is resized.
  useEffect(() => {
    listRef.current?.scrollChildIntoView(`http-postman-save-option-${selection}`)
  }, [selection, compact])

  const options = destinations(files, folders)
  const width = Math.max(1, Math.min(78, terminalWidth - 2))
  const height = Math.max(
    1,
    Math.min(24, terminalHeight - 2, 9 + Math.max(2, options.length * (compact ? 1 : 2))),
  )
  const choose = () => {
    const selected = options[selection]
    if (selected) onSelect(selected.filePath, selected.folder)
  }
  useEffect(() => {
    const timer = setTimeout(
      () => renderer.root.findDescendantById("http-postman-save-modal")?.focus(),
      0,
    )
    return () => clearTimeout(timer)
  }, [renderer])
  useKeyboard((key) => {
    if (!["escape", "up", "down", "j", "k", "enter", "return"].includes(key.name)) return
    key.preventDefault()
    key.stopPropagation()
    if (key.name === "escape") return onClose()
    if (key.name === "up" || key.name === "k")
      return setSelection((index) => Math.max(0, index - 1))
    if (key.name === "down" || key.name === "j")
      return setSelection((index) => Math.min(options.length - 1, index + 1))
    choose()
  })
  return (
    <HttpDialog
      id="http-postman-save-modal"
      title="SALVAR NO POSTMAN"
      width={width}
      height={height}
      terminalWidth={terminalWidth}
      terminalHeight={terminalHeight}
      onClose={onClose}
      zIndex={140}
      actions={[
        {
          id: "http-postman-save-confirm",
          label: "[Enter] Salvar",
          disabled: !options.length,
          onPress: choose,
        },
      ]}
    >
      <HttpDialogSection title="REQUEST">
        <text
          content={truncateDisplay(requestName, width - 7)}
          wrapMode="none"
          style={{ height: 1, fg: COLORS.text }}
        />
      </HttpDialogSection>
      <text
        content={`${translateUi("DESTINO")} · ${options.length}`}
        style={{ height: 1, flexShrink: 0, marginTop: compact ? 0 : 1, fg: COLORS.muted }}
      />
      {options.length ? (
        <scrollbox ref={listRef} scrollY style={{ flexGrow: 1, minHeight: 0 }}>
          {options.map((option, index) => (
            <HttpPostmanDestinationRow
              key={`${option.filePath}:${option.folder?.id ?? "root"}`}
              index={index}
              label={option.label}
              folder={!!option.folder}
              compact={compact}
              selected={selection === index}
              width={width}
              onPress={() => onSelect(option.filePath, option.folder)}
            />
          ))}
        </scrollbox>
      ) : (
        <text
          content={translateUi("Crie ou importe uma coleção Postman antes de salvar.")}
          style={{ fg: COLORS.warning, flexGrow: 1 }}
        />
      )}
      <ShortcutText
        content="[↑/↓] Navegar"
        style={{ height: 1, flexShrink: 0, fg: COLORS.muted }}
      />
    </HttpDialog>
  )
}
