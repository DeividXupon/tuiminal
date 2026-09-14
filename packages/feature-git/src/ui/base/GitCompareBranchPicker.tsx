import type { BoxRenderable, InputRenderable, SelectRenderable } from "@opentui/core"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import { Button } from "@tuiparts/react/button"
import { useEffect, useMemo, useRef, useState } from "react"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { ShortcutText } from "@xupon/tuiminal-core/ui/ShortcutText"
import { handleSelectMouseDown, handleSelectMouseScroll } from "@xupon/tuiminal-core/ui/selectMouse"
import {
  comparisonRefDescription,
  type GitComparisonRef,
  gitComparePickerKeyboardAction,
} from "../../model/branch-comparison"

export type GitComparePickerSide = "base" | "compared"

export function GitCompareBranchPicker({
  side,
  references,
  selectedRef,
  onSelect,
  onClose,
}: {
  side: GitComparePickerSide
  references: readonly GitComparisonRef[]
  selectedRef: string | null
  onSelect: (ref: string) => void
  onClose: () => void
}) {
  const renderer = useRenderer()
  const terminal = useTerminalDimensions()
  const dialogRef = useRef<BoxRenderable | null>(null)
  const inputRef = useRef<InputRenderable | null>(null)
  const listRef = useRef<SelectRenderable | null>(null)
  const [query, setQuery] = useState("")
  const [selectedIndex, setSelectedIndex] = useState(0)
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const options = useMemo(
    () =>
      references
        .filter(
          (reference) =>
            !normalizedQuery || reference.name.toLocaleLowerCase().includes(normalizedQuery),
        )
        .map((reference) => ({
          name: `${reference.ref === selectedRef ? "●" : "◇"} ${reference.name}`,
          description: translateUi(comparisonRefDescription(reference)),
          value: reference.ref,
        })),
    [normalizedQuery, references, selectedRef],
  )

  useEffect(() => {
    renderer.currentFocusedRenderable?.blur()
    const timeout = setTimeout(() => {
      if (listRef.current) listRef.current.focus()
      else dialogRef.current?.focus()
    }, 0)
    return () => clearTimeout(timeout)
  }, [renderer])

  useEffect(() => {
    setSelectedIndex((current) => Math.max(0, Math.min(options.length - 1, current)))
  }, [options.length])

  useKeyboard((key) => {
    const focusedId = renderer.currentFocusedRenderable?.id
    const action = gitComparePickerKeyboardAction(
      key.name,
      focusedId === "git-compare-branch-search",
    )
    if (!action) return
    if (action === "blur-search") {
      key.preventDefault()
      key.stopPropagation()
      inputRef.current?.blur()
      if (listRef.current) listRef.current.focus()
      else dialogRef.current?.focus()
      return
    }
    if (action === "close") {
      key.preventDefault()
      key.stopPropagation()
      onClose()
      return
    }
    if (action === "focus-search") {
      key.preventDefault()
      inputRef.current?.focus()
      return
    }
    if (action === "up" || action === "down") {
      key.preventDefault()
      key.stopPropagation()
      const delta = action === "down" ? 1 : -1
      setSelectedIndex((current) => Math.max(0, Math.min(options.length - 1, current + delta)))
      return
    }
    const option = options[selectedIndex]
    if (!option) return
    key.preventDefault()
    key.stopPropagation()
    onSelect(option.value)
    onClose()
  })

  const width = Math.max(44, Math.min(78, terminal.width - 6))
  const height = Math.max(14, Math.min(26, terminal.height - 4))
  const title = side === "base" ? "◆ ESCOLHER BRANCH BASE" : "◆ ESCOLHER BRANCH COMPARADA"
  return (
    <>
      <Button
        onPress={onClose}
        position="absolute"
        top={0}
        left={0}
        width="100%"
        height="100%"
        zIndex={980}
        backgroundColor="#030509"
        opacity={0.94}
      />
      <box
        position="absolute"
        top={0}
        left={0}
        width="100%"
        height="100%"
        zIndex={981}
        alignItems="center"
        justifyContent="center"
      >
        <box
          ref={dialogRef}
          id="git-compare-branch-picker"
          focusable
          style={{
            width,
            height,
            border: true,
            borderStyle: "rounded",
            borderColor: COLORS.git,
            backgroundColor: COLORS.canvas,
            paddingLeft: 1,
            paddingRight: 1,
          }}
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
            <text content={translateUi(title)} style={{ fg: COLORS.git }} />
            <InlineButton
              id="git-compare-picker-close"
              label={translateUi("[Esc] Voltar")}
              accent={COLORS.git}
              onPress={onClose}
            />
          </box>
          <input
            ref={inputRef}
            id="git-compare-branch-search"
            value={query}
            placeholder={translateUi("⌕ Filtrar branch…")}
            onInput={setQuery}
            onSubmit={() => listRef.current?.focus()}
            onMouseDown={() => inputRef.current?.focus()}
            width={width - 4}
            style={{
              marginTop: 1,
              marginBottom: 1,
              backgroundColor: COLORS.panelRaised,
              focusedBackgroundColor: COLORS.panelRaised,
              textColor: COLORS.text,
              focusedTextColor: COLORS.text,
              cursorColor: COLORS.git,
            }}
          />
          {options.length ? (
            <select
              ref={listRef}
              id="git-compare-branch-list"
              options={options}
              selectedIndex={selectedIndex}
              onChange={(index) => setSelectedIndex(index)}
              onSelect={(_index, option) => {
                if (typeof option?.value !== "string") return
                onSelect(option.value)
                onClose()
              }}
              onMouseDown={(event) =>
                handleSelectMouseDown(event, listRef.current, {
                  optionCount: options.length,
                  showDescription: true,
                  activateOnClick: true,
                })
              }
              onMouseScroll={(event) => handleSelectMouseScroll(event, listRef.current)}
              showDescription
              showScrollIndicator
              wrapSelection
              style={{
                flexGrow: 1,
                backgroundColor: COLORS.panel,
                focusedBackgroundColor: COLORS.panel,
                textColor: COLORS.muted,
                focusedTextColor: COLORS.text,
                selectedBackgroundColor: COLORS.panelRaised,
                selectedTextColor: COLORS.git,
                descriptionColor: COLORS.muted,
                selectedDescriptionColor: COLORS.text,
              }}
            />
          ) : (
            <box style={{ flexGrow: 1, alignItems: "center", justifyContent: "center" }}>
              <text
                content={translateUi("Nenhuma branch encontrada.")}
                style={{ fg: COLORS.muted }}
              />
            </box>
          )}
          <ShortcutText
            content={translateUi("[/] Filtrar  [↑/↓] Navegar  [Enter] Selecionar")}
            style={{ height: 1, flexShrink: 0, fg: COLORS.muted }}
          />
        </box>
      </box>
    </>
  )
}
