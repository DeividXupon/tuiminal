import type { BoxRenderable, InputRenderable, ScrollBoxRenderable } from "@opentui/core"
import { useKeyboard, useTerminalDimensions } from "@opentui/react"
import { translateUi, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { ModalSurface } from "@xupon/tuiminal-core/ui/ModalSurface"
import { useEffect, useMemo, useRef, useState } from "react"
import type { LiveDiffProject } from "../services/live-diff-projects"

export function LiveDiffProjectPicker({
  projects,
  loading,
  error,
  onSelect,
  onClose,
}: {
  projects: readonly LiveDiffProject[]
  loading: boolean
  error: string
  onSelect: (path: string) => void
  onClose: () => void
}) {
  const dimensions = useTerminalDimensions()
  const dialog = useRef<BoxRenderable | null>(null)
  const input = useRef<InputRenderable | null>(null)
  const list = useRef<ScrollBoxRenderable | null>(null)
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState(0)
  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase()
    return term
      ? projects.filter((project) =>
          `${project.name} ${project.parent}`.toLocaleLowerCase().includes(term),
        )
      : [...projects]
  }, [projects, query])
  useEffect(() => {
    input.current?.focus()
  }, [])
  useEffect(() => {
    setSelected((current) => Math.min(current, Math.max(0, filtered.length - 1)))
  }, [filtered.length])
  useEffect(() => {
    list.current?.scrollChildIntoView(`live-diff-project-option-${selected}`)
  }, [selected])
  const choose = () => {
    const project = filtered[selected]
    if (project) onSelect(project.path)
  }
  useKeyboard((key) => {
    if (key.name === "escape") {
      key.preventDefault()
      key.stopPropagation()
      onClose()
      return
    }
    const direction = key.name === "up" ? -1 : key.name === "down" ? 1 : 0
    if (direction && filtered.length) {
      key.preventDefault()
      key.stopPropagation()
      setSelected((current) => (current + direction + filtered.length) % filtered.length)
      return
    }
    if (key.name === "enter" || key.name === "return") {
      key.preventDefault()
      key.stopPropagation()
      choose()
    }
  })
  const width = Math.max(1, Math.min(72, dimensions.width - 2))
  const height = Math.max(7, Math.min(18, dimensions.height - 2))
  return (
    <ModalSurface
      dialogRef={dialog}
      id="live-diff-project-picker"
      width={width}
      height={height}
      borderColor={COLORS.terminal}
      zIndex={820}
      onBackdropPress={onClose}
    >
      <text
        content={translateUi("Adicionar projeto ao Live Diff")}
        style={{ fg: COLORS.terminal }}
      />
      <input
        ref={input}
        id="live-diff-project-search"
        value={query}
        placeholder={translateUi("Pesquisar projetos Git…")}
        onInput={setQuery}
        onMouseDown={() => input.current?.focus()}
        width="100%"
        style={{
          backgroundColor: COLORS.panelRaised,
          textColor: COLORS.text,
          focusedBackgroundColor: COLORS.panelRaised,
          focusedTextColor: COLORS.text,
        }}
      />
      <scrollbox ref={list} id="live-diff-project-options" scrollY style={{ flexGrow: 1 }}>
        {filtered.map((project, index) => (
          // biome-ignore lint/a11y/noStaticElementInteractions: rows are selectable with arrows and Enter.
          <box
            key={project.path}
            id={`live-diff-project-option-${index}`}
            onMouseDown={() => onSelect(project.path)}
            style={{
              height: 1,
              flexShrink: 0,
              flexDirection: "row",
              backgroundColor: index === selected ? COLORS.panelRaised : COLORS.canvas,
            }}
          >
            <text
              content={`${index === selected ? "›" : " "} ${truncateDisplay(project.name, Math.max(1, width - 24))}`}
              wrapMode="none"
              style={{ flexGrow: 1, fg: index === selected ? COLORS.focus : COLORS.text }}
            />
            <text
              content={truncateDisplay(project.parent, 18)}
              wrapMode="none"
              style={{ flexShrink: 0, fg: COLORS.muted }}
            />
          </box>
        ))}
        {!filtered.length && (
          <text
            content={
              error ||
              translateUi(
                loading
                  ? "Procurando projetos Git…"
                  : projects.length
                    ? "Nenhum projeto corresponde à pesquisa."
                    : "Nenhum projeto Git encontrado.",
              )
            }
            style={{ fg: error ? COLORS.warning : COLORS.muted }}
          />
        )}
      </scrollbox>
      <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
        <InlineButton
          compact
          label="[Enter] Adicionar"
          onPress={choose}
          disabled={!filtered.length}
        />
        <InlineButton compact label="[Esc] Cancelar" onPress={onClose} />
      </box>
    </ModalSurface>
  )
}
