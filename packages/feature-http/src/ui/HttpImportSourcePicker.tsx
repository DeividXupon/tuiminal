import { decodePasteBytes, type InputRenderable } from "@opentui/core"
import { useKeyboard, usePaste, useRenderer } from "@opentui/react"
import { useEffect, useRef, useState } from "react"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { ShortcutText } from "@xupon/tuiminal-core/ui/ShortcutText"
import {
  pastedHttpImportSourcePath,
  suggestHttpImportSourcePaths,
  type HttpImportPathSuggestion,
} from "../services/import-source-path"

export function HttpImportSourcePicker({
  sourcePath,
  compact,
  tiny,
  onSourcePathChange,
  onSubmit,
}: {
  sourcePath: string
  compact: boolean
  tiny: boolean
  onSourcePathChange: (path: string) => void
  onSubmit: () => void
}) {
  const renderer = useRenderer()
  const sourceRef = useRef<InputRenderable | null>(null)
  const [suggestions, setSuggestions] = useState<HttpImportPathSuggestion[]>([])
  const [selected, setSelected] = useState(0)
  const visible = suggestions.slice(0, tiny ? 1 : compact ? 2 : 4)

  useEffect(() => {
    const timer = setTimeout(() => sourceRef.current?.focus(), 0)
    return () => clearTimeout(timer)
  }, [])
  useEffect(() => {
    setSuggestions([])
    setSelected(0)
    if (!sourcePath) return
    let cancelled = false
    const timer = setTimeout(() => {
      void suggestHttpImportSourcePaths(sourcePath).then((matches) => {
        if (!cancelled) setSuggestions(matches)
      })
    }, 90)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [sourcePath])

  usePaste((event) => {
    const path = pastedHttpImportSourcePath(decodePasteBytes(event.bytes))
    if (!path) return
    event.preventDefault()
    event.stopPropagation()
    onSourcePathChange(path)
    sourceRef.current?.focus()
  })
  useKeyboard((key) => {
    if (renderer.currentFocusedRenderable?.id !== "http-collection-import-source") return
    if (!visible.length || key.ctrl || key.meta || key.option) return
    if (key.name === "up" || key.name === "down") {
      key.preventDefault()
      key.stopPropagation()
      setSelected(
        (current) => (current + (key.name === "down" ? 1 : visible.length - 1)) % visible.length,
      )
      return
    }
    if (key.name !== "tab" || key.shift) return
    const next = visible[selected]
    if (!next) return
    key.preventDefault()
    key.stopPropagation()
    onSourcePathChange(next.path)
  })

  return (
    <box style={{ flexGrow: 1, minHeight: 0, gap: compact ? 0 : 1 }}>
      <text content={translateUi("ARQUIVO DE ORIGEM")} style={{ fg: COLORS.muted }} />
      <input
        ref={sourceRef}
        id="http-collection-import-source"
        value={sourcePath}
        placeholder={translateUi("~/Downloads/collection.json")}
        onInput={(value) => {
          if (value !== sourcePath) onSourcePathChange(value)
        }}
        onSubmit={onSubmit}
        onMouseDown={() => sourceRef.current?.focus()}
        style={{
          backgroundColor: COLORS.canvas,
          focusedBackgroundColor: COLORS.panelRaised,
        }}
      />
      {visible.length ? (
        <box style={{ flexShrink: 0 }}>
          {visible.map((item, index) => (
            // biome-ignore lint/a11y/noStaticElementInteractions: keyboard users select these suggestions from the focused input with arrows and Tab.
            <box
              key={item.path}
              id={`http-collection-import-suggestion-${index}`}
              onMouseDown={() => {
                onSourcePathChange(item.path)
                sourceRef.current?.focus()
              }}
              style={{
                height: 1,
                flexShrink: 0,
                backgroundColor: index === selected ? COLORS.http : COLORS.panelAlt,
              }}
            >
              <text
                content={` ${item.label}`}
                style={{ fg: index === selected ? COLORS.canvas : COLORS.text }}
              />
            </box>
          ))}
          {tiny ? null : (
            <ShortcutText content="[↑/↓] Escolher · [Tab] Completar" style={{ fg: COLORS.muted }} />
          )}
        </box>
      ) : null}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: this OpenTUI drop target moves keyboard focus to the input, which is also directly reachable. */}
      <box
        id="http-collection-import-drop-zone"
        onMouseDown={() => sourceRef.current?.focus()}
        onMouseDrop={() => sourceRef.current?.focus()}
        style={{
          flexGrow: 1,
          minHeight: tiny ? 4 : compact ? 5 : 7,
          flexShrink: 0,
          border: true,
          borderStyle: "rounded",
          borderColor: COLORS.http,
          backgroundColor: COLORS.panelAlt,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {tiny ? null : <text content="↓" style={{ fg: COLORS.http }} />}
        <text content={translateUi("SOLTE UM ARQUIVO AQUI")} style={{ fg: COLORS.http }} />
        {tiny ? null : (
          <text content={translateUi("ou cole o caminho completo")} style={{ fg: COLORS.muted }} />
        )}
      </box>
    </box>
  )
}
