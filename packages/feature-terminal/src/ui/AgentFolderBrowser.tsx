import type { InputRenderable, ScrollBoxRenderable } from "@opentui/core"
import { useKeyboard, useTerminalDimensions } from "@opentui/react"
import { translateUi, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { ModalSurface } from "@xupon/tuiminal-core/ui/ModalSurface"
import { PlasmaLoadingOverlay } from "@xupon/tuiminal-core/ui/PlasmaLoadingOverlay"
import { useEffect, useRef, useState } from "react"
import { useAgentDirectorySearch } from "../hooks/use-agent-directory-search"
import type { AgentProjectTarget } from "../model/agent-project"
import {
  completeDirectorySuggestion,
  directorySearchParts,
  directorySuggestions,
} from "../services/agent-directory-search"
import { readProjectDirectory } from "../services/agent-project-directories"
import { projectName } from "../model/project-name"
import { TerminalInlineButton, TerminalShortcutText } from "./TerminalShortcut"

export function AgentFolderBrowser({
  target,
  origin,
  onSelect,
  onClose,
}: {
  target: AgentProjectTarget
  origin: string
  onSelect: (path: string) => void
  onClose: () => void
}) {
  const search = useAgentDirectorySearch(target)
  const input = useRef<InputRenderable | null>(null)
  const list = useRef<ScrollBoxRenderable | null>(null)
  const validation = useRef<AbortController | null>(null)
  const [selected, setSelected] = useState(0)
  const selectedRef = useRef(0)
  const windows = target.kind === "local" && process.platform === "win32"
  const [error, setError] = useState("")
  const [choosing, setChoosing] = useState(false)
  const dimensions = useTerminalDimensions()
  const width = Math.max(1, Math.min(90, dimensions.width - 2))
  useEffect(() => {
    input.current?.focus()
    input.current?.gotoLineEnd()
    return () => validation.current?.abort()
  }, [])
  // biome-ignore lint/correctness/useExhaustiveDependencies: changing the query invalidates the cursor and validation error.
  useEffect(() => {
    selectedRef.current = 0
    setSelected(0)
    setError("")
  }, [search.query])
  useEffect(() => {
    list.current?.scrollChildIntoView(`terminal-dialog-folder-row-${selected}`)
  }, [selected])
  const currentSuggestions = () => {
    const query = input.current?.value ?? search.query
    if (
      directorySearchParts(query, windows).parent !==
      directorySearchParts(search.query, windows).parent
    )
      return []
    return directorySuggestions(search.result?.directories ?? [], query, windows)
  }
  const complete = (index = selectedRef.current) => {
    if (validation.current) return
    const path = currentSuggestions()[index]
    if (!path || !input.current) return
    const next = completeDirectorySuggestion(input.current.value, path, windows)
    input.current.value = next
    search.setQuery(next)
    input.current.focus()
    input.current.gotoLineEnd()
  }
  const choose = async () => {
    if (validation.current || search.loading) return
    const controller = new AbortController()
    validation.current = controller
    setChoosing(true)
    setError("")
    try {
      const result = await readProjectDirectory(
        target,
        input.current?.value || "~/",
        "~",
        controller.signal,
        false,
      )
      if (!controller.signal.aborted) onSelect(result.path)
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(
          cause instanceof Error ? cause.message : "Não foi possível acessar a pasta selecionada.",
        )
    } finally {
      if (!controller.signal.aborted) {
        validation.current = null
        setChoosing(false)
        input.current?.focus()
      }
    }
  }
  useKeyboard((key) => {
    if (key.name === "escape") {
      key.preventDefault()
      key.stopPropagation()
      onClose()
      return
    }
    if (validation.current) {
      key.preventDefault()
      key.stopPropagation()
      return
    }
    if (["up", "down"].includes(key.name)) {
      key.preventDefault()
      key.stopPropagation()
      const suggestions = currentSuggestions()
      if (suggestions.length) {
        selectedRef.current =
          (selectedRef.current + (key.name === "up" ? -1 : 1) + suggestions.length) %
          suggestions.length
        setSelected(selectedRef.current)
      }
    } else if (key.name === "tab") {
      key.preventDefault()
      key.stopPropagation()
      complete()
    } else if (["enter", "return"].includes(key.name)) {
      key.preventDefault()
      key.stopPropagation()
      void choose()
    }
  })
  return (
    <ModalSurface
      id="terminal-dialog-folder-browser"
      dialogFocusable={false}
      width={width}
      height={Math.max(1, Math.min(25, dimensions.height - 2))}
      zIndex={820}
      borderColor={COLORS.terminal}
      onBackdropPress={onClose}
      positionRelative
    >
      <text
        content={`${translateUi("Procurar pasta")} · ${origin}`}
        wrapMode="none"
        style={{ height: 1, flexShrink: 0, fg: COLORS.terminal }}
      />
      <input
        ref={input}
        id="terminal-dialog-project-path"
        value={search.query}
        onInput={(value) => {
          if (!validation.current) {
            selectedRef.current = 0
            setSelected(0)
            search.setQuery(value)
          }
        }}
        onMouseDown={() => input.current?.focus()}
        style={{
          flexShrink: 0,
          backgroundColor: COLORS.panelRaised,
          focusedBackgroundColor: COLORS.panelRaised,
          textColor: COLORS.text,
          focusedTextColor: COLORS.text,
        }}
      />
      <text
        content={translateUi(search.loading ? "Carregando pastas…" : "Sugestões de pastas")}
        style={{ height: 1, flexShrink: 0, fg: COLORS.muted }}
      />
      <scrollbox
        ref={list}
        id="terminal-dialog-folder-suggestions"
        scrollY
        style={{ flexGrow: 1, minHeight: 0 }}
      >
        {search.rows.map((path, index) => (
          // biome-ignore lint/a11y/noStaticElementInteractions: arrows and Tab offer the same completion.
          <box
            key={path}
            id={`terminal-dialog-folder-row-${index}`}
            onMouseDown={() => complete(index)}
            style={{
              height: 1,
              flexShrink: 0,
              backgroundColor: index === selected ? COLORS.panelRaised : COLORS.panel,
            }}
          >
            <text
              content={`${index === selected ? "›" : " "} ${truncateDisplay(projectName(path), width - 6)}/`}
              wrapMode="none"
              style={{ fg: index === selected ? COLORS.focus : COLORS.text }}
            />
          </box>
        ))}
        {!search.loading && !search.rows.length && (
          <text
            content={translateUi("Nenhuma pasta corresponde ao caminho.")}
            style={{ fg: COLORS.muted }}
          />
        )}
      </scrollbox>
      {(error || search.error || search.result?.truncated) && (
        <text
          content={translateUi(
            error || search.error || "Lista limitada a 2000 pastas; use o caminho direto.",
          )}
          wrapMode="none"
          style={{ height: 1, flexShrink: 0, fg: COLORS.warning }}
        />
      )}
      <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
        <TerminalShortcutText
          id="terminal-dialog-folder-hints"
          content={width < 78 ? "[↑/↓] [Tab] completar" : "[↑/↓] sugestões · [Tab] completar"}
          wrapMode="none"
          style={{ height: 1, minWidth: 0, flexShrink: 1, fg: COLORS.muted }}
        />
        <TerminalInlineButton
          compact
          id="terminal-dialog-folder-choose"
          label="[Enter] Usar pasta"
          disabled={search.loading || choosing}
          onPress={() => void choose()}
        />
        <TerminalInlineButton
          compact
          id="terminal-dialog-folder-back"
          label="[Esc] Voltar"
          onPress={onClose}
        />
      </box>
      <PlasmaLoadingOverlay
        id="terminal-folder-open-loader"
        active={choosing}
        label="Abrindo pasta…"
        accent={COLORS.terminal}
        background={COLORS.canvas}
      />
    </ModalSurface>
  )
}
