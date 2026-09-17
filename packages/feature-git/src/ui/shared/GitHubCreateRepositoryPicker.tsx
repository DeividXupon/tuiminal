import type { BoxRenderable, InputRenderable, SelectRenderable } from "@opentui/core"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import { Button } from "@tuiparts/react/button"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { ShortcutText } from "@xupon/tuiminal-core/ui/ShortcutText"
import { handleSelectMouseDown, handleSelectMouseScroll } from "@xupon/tuiminal-core/ui/selectMouse"
import { DEMO_ISSUES } from "../../model/issue/fixtures"
import { DEMO_PULL_REQUESTS } from "../../model/pr/fixtures"
import { validateRepositoryName } from "../../model/pr/query"
import { loadGitHubRepositoryCatalog } from "../../services/github/repository-catalog"
import { useBlurModalFocusOnUnmount } from "../useBlurModalFocusOnUnmount"

const MAX_VISIBLE_REPOSITORIES = 100

function demoRepositories() {
  const items = [...DEMO_PULL_REQUESTS, ...DEMO_ISSUES]
  return [...new Set(items.map((item) => `${item.identity.owner}/${item.identity.repository}`))]
}

function currentRepository(selected: string) {
  return validateRepositoryName(selected) ? [selected] : []
}

async function readRepositoryCatalog(host: string, demo: boolean, signal: AbortSignal) {
  if (demo) return { repositories: demoRepositories(), partial: false }
  const executable = process.env.TUIMINAL_GH_EXECUTABLE?.trim()
  return loadGitHubRepositoryCatalog({
    host,
    options: { signal, ...(executable ? { executable } : {}) },
  })
}

function repositoryPickerKeyAction(name: string, searchFocused: boolean, canRetry: boolean) {
  if (name === "escape") return searchFocused ? "blur-search" : "close"
  if (name === "tab") return searchFocused ? "focus-list" : "focus-search"
  if (searchFocused) return null
  if (name === "/") return "focus-search"
  if (name === "r" && canRetry) return "retry"
  if (name === "up" || name === "k") return "up"
  if (name === "down" || name === "j") return "down"
  if (["return", "enter", "linefeed"].includes(name)) return "select"
  return null
}

export function GitHubCreateRepositoryPicker({
  host,
  selected,
  demo,
  onSelect,
  onClose,
}: {
  host: string
  selected: string
  demo: boolean
  onSelect: (repository: string) => void
  onClose: () => void
}) {
  const renderer = useRenderer()
  const terminal = useTerminalDimensions()
  const dialogRef = useRef<BoxRenderable | null>(null)
  const searchRef = useRef<InputRenderable | null>(null)
  const listRef = useRef<SelectRenderable | null>(null)
  const requestRef = useRef<AbortController | null>(null)
  const [repositories, setRepositories] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [partial, setPartial] = useState(false)
  const [error, setError] = useState("")
  const [query, setQuery] = useState("")
  const [selectedIndex, setSelectedIndex] = useState(0)
  useBlurModalFocusOnUnmount(dialogRef)

  const load = useCallback(async () => {
    requestRef.current?.abort()
    const controller = new AbortController()
    requestRef.current = controller
    setLoading(true)
    setError("")
    setPartial(false)
    setRepositories(currentRepository(selected))
    try {
      const catalog = await readRepositoryCatalog(host, demo, controller.signal)
      if (requestRef.current !== controller || controller.signal.aborted) return
      setRepositories([...new Set([...currentRepository(selected), ...catalog.repositories])])
      setPartial(catalog.partial)
    } catch (cause) {
      if (requestRef.current !== controller || controller.signal.aborted) return
      setError(cause instanceof Error ? cause.message : "Falha ao carregar repositórios.")
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null
        setLoading(false)
      }
    }
  }, [demo, host, selected])

  useEffect(() => {
    renderer.currentFocusedRenderable?.blur()
    const timeout = setTimeout(() => dialogRef.current?.focus(), 0)
    return () => clearTimeout(timeout)
  }, [renderer])
  useEffect(() => {
    void load()
    return () => {
      requestRef.current?.abort()
      requestRef.current = null
    }
  }, [load])

  const normalizedQuery = query.trim().toLocaleLowerCase()
  const { options, moreMatches } = useMemo(() => {
    const options: Array<{ name: string; description: string; value: string }> = []
    let moreMatches = false
    for (const repository of repositories) {
      if (normalizedQuery && !repository.toLocaleLowerCase().includes(normalizedQuery)) continue
      if (options.length === MAX_VISIBLE_REPOSITORIES) {
        moreMatches = true
        break
      }
      options.push({
        name: `${repository === selected ? "●" : "◇"} ${repository}`,
        description: host,
        value: repository,
      })
    }
    return { options, moreMatches }
  }, [host, normalizedQuery, repositories, selected])
  useEffect(() => {
    setSelectedIndex((current) => Math.max(0, Math.min(options.length - 1, current)))
  }, [options.length])
  useEffect(() => {
    if (!options.length) return
    const timeout = setTimeout(() => {
      if (renderer.currentFocusedRenderable?.id === "git-create-repository-picker")
        listRef.current?.focus()
    }, 0)
    return () => clearTimeout(timeout)
  }, [options.length, renderer])

  useKeyboard((key) => {
    const action = repositoryPickerKeyAction(
      key.name.toLowerCase(),
      renderer.currentFocusedRenderable?.id === "git-create-repository-search",
      Boolean(error && !loading),
    )
    if (!action) return
    key.preventDefault()
    key.stopPropagation()
    const focusList = () => {
      searchRef.current?.blur()
      if (listRef.current) listRef.current.focus()
      else dialogRef.current?.focus()
    }
    const moveSelection = (delta: number) =>
      setSelectedIndex((current) => Math.max(0, Math.min(options.length - 1, current + delta)))
    const handlers = {
      "blur-search": focusList,
      "focus-list": focusList,
      close: onClose,
      "focus-search": () => searchRef.current?.focus(),
      retry: () => void load(),
      up: () => moveSelection(-1),
      down: () => moveSelection(1),
      select: () => {
        const repository = options[selectedIndex]?.value
        if (repository) {
          onSelect(repository)
          onClose()
        }
      },
    }
    handlers[action]()
  })

  const width = Math.max(38, Math.min(76, terminal.width - 4))
  const height = Math.max(12, Math.min(25, terminal.height - 2))
  return (
    <>
      <Button
        onPress={onClose}
        position="absolute"
        top={0}
        left={0}
        width="100%"
        height="100%"
        zIndex={984}
        backgroundColor="#030509"
        opacity={0.94}
      />
      <box
        position="absolute"
        top={0}
        left={0}
        width="100%"
        height="100%"
        zIndex={985}
        alignItems="center"
        justifyContent="center"
      >
        <box
          ref={dialogRef}
          id="git-create-repository-picker"
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
            <text content={translateUi("ESCOLHER REPOSITÓRIO")} style={{ fg: COLORS.git }} />
            <InlineButton
              label={translateUi("[Esc] Voltar")}
              accent={COLORS.git}
              onPress={onClose}
            />
          </box>
          <text content={host} style={{ fg: COLORS.muted }} />
          <input
            ref={searchRef}
            id="git-create-repository-search"
            value={query}
            placeholder={translateUi("⌕ Filtrar repositório…")}
            onInput={setQuery}
            onSubmit={() => listRef.current?.focus()}
            onMouseDown={() => searchRef.current?.focus()}
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
              id="git-create-repository-list"
              options={options}
              selectedIndex={selectedIndex}
              onChange={setSelectedIndex}
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
                content={translateUi(
                  loading ? "Carregando repositórios…" : "Nenhum repositório encontrado.",
                )}
                style={{ fg: COLORS.muted }}
              />
            </box>
          )}
          {partial ? (
            <text
              content={translateUi("Catálogo de repositórios parcial.")}
              style={{ fg: COLORS.warning }}
            />
          ) : null}
          {moreMatches ? (
            <text
              content={translateUi("Mais repositórios disponíveis; refine a busca.")}
              style={{ fg: COLORS.muted }}
            />
          ) : null}
          {loading && options.length ? (
            <text content={translateUi("Carregando repositórios…")} style={{ fg: COLORS.muted }} />
          ) : null}
          {error ? <text content={translateUi(error)} style={{ fg: COLORS.danger }} /> : null}
          {error ? (
            <InlineButton
              label={translateUi("[R] Tentar novamente")}
              accent={COLORS.git}
              onPress={() => void load()}
            />
          ) : null}
          <ShortcutText
            content={translateUi("[/] Filtrar  [↑/↓] Navegar  [Enter] Selecionar")}
            style={{ height: 1, flexShrink: 0, fg: COLORS.muted }}
          />
        </box>
      </box>
    </>
  )
}
