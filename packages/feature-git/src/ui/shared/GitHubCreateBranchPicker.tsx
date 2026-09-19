import type { BoxRenderable, InputRenderable, SelectRenderable } from "@opentui/core"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { ModalSurface } from "@xupon/tuiminal-core/ui/ModalSurface"
import { ShortcutText } from "@xupon/tuiminal-core/ui/ShortcutText"
import { handleSelectMouseDown, handleSelectMouseScroll } from "@xupon/tuiminal-core/ui/selectMouse"
import { validGitHubBranch } from "../../model/create-item"
import { DEMO_PULL_REQUESTS } from "../../model/pr/fixtures"
import { validateRepositoryName } from "../../model/pr/query"
import { listGitHubRepositoryBranches } from "../../services/github/branch-list"
import { useBlurModalFocusOnUnmount } from "../useBlurModalFocusOnUnmount"

function demoBranches(repository: string) {
  const found = DEMO_PULL_REQUESTS.filter(
    (item) => `${item.identity.owner}/${item.identity.repository}` === repository,
  ).flatMap((item) => [item.baseBranch, item.headBranch])
  return [...new Set(["main", ...found])].filter(validGitHubBranch)
}

function branchPickerKeyAction(
  name: string,
  inSearch: boolean,
  canLoadMore: boolean,
  canRetry: boolean,
) {
  if (name === "escape") return inSearch ? "blur-search" : "close"
  if (name === "tab") return inSearch ? "focus-list" : "focus-search"
  if (inSearch) return null
  if (name === "/") return "focus-search"
  if (name === "m" && canLoadMore) return "more"
  if (name === "r" && canRetry) return "retry"
  if (name === "up" || name === "k") return "up"
  if (name === "down" || name === "j") return "down"
  if (["return", "enter", "linefeed"].includes(name)) return "select"
  return null
}

export function GitHubCreateBranchPicker({
  side,
  host,
  repository,
  selected,
  demo,
  onSelect,
  onClose,
}: {
  side: "base" | "head"
  host: string
  repository: string
  selected: string
  demo: boolean
  onSelect: (branch: string) => void
  onClose: () => void
}) {
  const renderer = useRenderer()
  const terminal = useTerminalDimensions()
  const dialogRef = useRef<BoxRenderable | null>(null)
  const searchRef = useRef<InputRenderable | null>(null)
  const listRef = useRef<SelectRenderable | null>(null)
  const requestRef = useRef<{ id: number; controller: AbortController } | null>(null)
  const nextIdRef = useRef(0)
  const [branches, setBranches] = useState<string[]>([])
  const [nextPage, setNextPage] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [query, setQuery] = useState("")
  const [selectedIndex, setSelectedIndex] = useState(0)
  useBlurModalFocusOnUnmount(dialogRef)

  const loadPage = useCallback(
    async (page: number) => {
      requestRef.current?.controller.abort()
      const controller = new AbortController()
      const id = ++nextIdRef.current
      requestRef.current = { id, controller }
      setLoading(true)
      setError("")
      try {
        const result = demo
          ? { branches: demoBranches(repository), nextPage: null }
          : await listGitHubRepositoryBranches(host, repository, page, {
              signal: controller.signal,
              ...(process.env.TUIMINAL_GH_EXECUTABLE?.trim()
                ? { executable: process.env.TUIMINAL_GH_EXECUTABLE.trim() }
                : {}),
            })
        if (requestRef.current?.id !== id || controller.signal.aborted) return
        setBranches((current) =>
          page === 1 ? result.branches : [...new Set([...current, ...result.branches])],
        )
        setNextPage(result.nextPage)
      } catch (cause) {
        if (requestRef.current?.id !== id || controller.signal.aborted) return
        setError(cause instanceof Error ? cause.message : "Falha ao carregar branches.")
      } finally {
        if (requestRef.current?.id === id) {
          requestRef.current = null
          setLoading(false)
        }
      }
    },
    [demo, host, repository],
  )

  useEffect(() => {
    renderer.currentFocusedRenderable?.blur()
    const timeout = setTimeout(() => dialogRef.current?.focus(), 0)
    return () => clearTimeout(timeout)
  }, [renderer])
  useEffect(() => {
    setBranches([])
    setNextPage(null)
    setQuery("")
    setSelectedIndex(0)
    if (validateRepositoryName(repository)) void loadPage(1)
    else setError("Informe owner/repository válido.")
    return () => {
      requestRef.current?.controller.abort()
      requestRef.current = null
    }
  }, [loadPage, repository])

  const normalizedQuery = query.trim().toLocaleLowerCase()
  const options = useMemo(
    () =>
      branches
        .filter(
          (branch) => !normalizedQuery || branch.toLocaleLowerCase().includes(normalizedQuery),
        )
        .map((branch) => ({
          name: `${branch === selected ? "●" : "◇"} ${branch}`,
          description: repository,
          value: branch,
        })),
    [branches, normalizedQuery, repository, selected],
  )
  useEffect(() => {
    setSelectedIndex((current) => Math.max(0, Math.min(options.length - 1, current)))
  }, [options.length])
  useEffect(() => {
    if (!options.length) return
    const timeout = setTimeout(() => {
      if (renderer.currentFocusedRenderable?.id === "git-create-branch-picker")
        listRef.current?.focus()
    }, 0)
    return () => clearTimeout(timeout)
  }, [options.length, renderer])

  useKeyboard((key) => {
    const inSearch = renderer.currentFocusedRenderable?.id === "git-create-branch-search"
    const action = branchPickerKeyAction(
      key.name.toLowerCase(),
      inSearch,
      Boolean(nextPage && !loading),
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
      more: () => {
        if (nextPage) void loadPage(nextPage)
      },
      retry: () => void loadPage(branches.length ? (nextPage ?? 1) : 1),
      up: () => moveSelection(-1),
      down: () => moveSelection(1),
      select: () => {
        const branch = options[selectedIndex]?.value
        if (branch) {
          onSelect(branch)
          onClose()
        }
      },
    }
    handlers[action]()
  })

  const width = Math.max(38, Math.min(76, terminal.width - 4))
  const height = Math.max(12, Math.min(25, terminal.height - 2))
  return (
    <ModalSurface
      id="git-create-branch-picker"
      dialogRef={dialogRef}
      width={width}
      height={height}
      zIndex={984}
      borderColor={COLORS.git}
      backdropOpacity={0.94}
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
        <text
          content={translateUi(
            side === "base" ? "ESCOLHER BRANCH BASE" : "ESCOLHER BRANCH COMPARADA",
          )}
          style={{ fg: COLORS.git }}
        />
        <InlineButton label={translateUi("[Esc] Voltar")} accent={COLORS.git} onPress={onClose} />
      </box>
      <text content={`${host} · ${repository}`} style={{ fg: COLORS.muted }} />
      <input
        ref={searchRef}
        id="git-create-branch-search"
        value={query}
        placeholder={translateUi("⌕ Filtrar branch…")}
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
          id="git-create-branch-list"
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
            content={translateUi(loading ? "Carregando branches…" : "Nenhuma branch encontrada.")}
            style={{ fg: COLORS.muted }}
          />
        </box>
      )}
      {error ? <text content={translateUi(error)} style={{ fg: COLORS.danger }} /> : null}
      <box style={{ height: 1, flexShrink: 0, flexDirection: "row", gap: 2 }}>
        {nextPage ? (
          <InlineButton
            label={translateUi("[M] Mais branches")}
            accent={COLORS.git}
            disabled={loading}
            onPress={() => void loadPage(nextPage)}
          />
        ) : null}
        {error ? (
          <InlineButton
            label={translateUi("[R] Tentar novamente")}
            accent={COLORS.git}
            onPress={() => void loadPage(branches.length ? (nextPage ?? 1) : 1)}
          />
        ) : null}
      </box>
      <ShortcutText
        content={translateUi("[/] Filtrar  [↑/↓] Navegar  [Enter] Selecionar")}
        style={{ height: 1, flexShrink: 0, fg: COLORS.muted }}
      />
    </ModalSurface>
  )
}
