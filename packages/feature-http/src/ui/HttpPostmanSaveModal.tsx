import { useKeyboard, useRenderer } from "@opentui/react"
import { useEffect, useState } from "react"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { translateUi, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import type { PostmanCollectionFolder } from "../postman/sync"

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
  const [selection, setSelection] = useState(0)
  const options = destinations(files, folders)
  const width = Math.min(68, Math.max(38, terminalWidth - 4))
  const height = Math.min(22, Math.max(9, terminalHeight - 2))
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
    const selected = options[selection]
    if (selected) onSelect(selected.filePath, selected.folder)
  })
  return (
    <>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: this backdrop blocks pointer input behind the modal. */}
      <box
        onMouseDown={(event) => {
          event.preventDefault()
          event.stopPropagation()
        }}
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: "100%",
          height: "100%",
          zIndex: 140,
        }}
      />
      <box
        id="http-postman-save-modal"
        focusable
        style={{
          position: "absolute",
          left: Math.max(0, Math.floor((terminalWidth - width) / 2)),
          top: Math.max(0, Math.floor((terminalHeight - height) / 2)),
          width,
          height,
          zIndex: 141,
          border: true,
          borderStyle: "rounded",
          borderColor: COLORS.http,
          backgroundColor: COLORS.panelRaised,
          paddingLeft: 1,
          paddingRight: 1,
        }}
      >
        <text content={translateUi("SALVAR NO POSTMAN")} style={{ fg: COLORS.http }} />
        <text content={truncateDisplay(requestName, width - 4)} style={{ fg: COLORS.text }} />
        {options.length ? (
          <scrollbox scrollY style={{ flexGrow: 1 }}>
            {options.map((option, index) => (
              <InlineButton
                key={`${option.filePath}:${option.folder?.id ?? "root"}`}
                id={`http-postman-save-option-${index}`}
                label={truncateDisplay(option.label, width - 7)}
                accent={COLORS.http}
                selected={selection === index}
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
        <InlineButton label="[Esc] Fechar" accent={COLORS.http} onPress={onClose} />
      </box>
    </>
  )
}
