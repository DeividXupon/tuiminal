import type { InputRenderable, ScrollBoxRenderable } from "@opentui/core"
import { useEffect, useMemo, useRef, useState } from "react"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { displayWidth, translateUi, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { buildHttpCollectionTree, type HttpCollectionTreeRow } from "../model/collection-tree"
import {
  httpCollectionSelectionAfterAction,
  visibleHttpCollectionSelection,
  resolveHttpCollectionTreeCommand,
  type HttpCollectionTreeCommand,
} from "../model/collection-tree-navigation"
import type { HttpKey } from "../model/keyboard-types"
import type { HttpProjectRequestItem, HttpWorkspaceState } from "../model/types"
import type { HttpCollectionAction } from "../hooks/use-http-collection-management"
import { HttpCollectionActionForm } from "./HttpCollectionActionForm"

function CollectionRow({
  row,
  contentWidth,
  activeDocumentId,
  selected,
  onPress,
}: {
  row: HttpCollectionTreeRow
  contentWidth: number
  activeDocumentId: string
  selected: boolean
  onPress: () => void
}) {
  const indent = "  ".repeat(row.depth)
  const indentWidth = displayWidth(indent)
  if (row.kind === "request") {
    const nameWidth = Math.max(
      1,
      contentWidth - 2 - indentWidth - displayWidth(row.item.request.method) - 1,
    )
    return (
      <InlineButton
        id={`http-navigation-project-${row.item.request.id}`}
        label={`${indent}${row.item.request.method} ${truncateDisplay(row.item.request.name, nameWidth)}`}
        accent={COLORS.http}
        active={row.item.request.id === activeDocumentId}
        selected={selected}
        onPress={onPress}
      />
    )
  }
  const count = ` (${row.requestCount})`
  const nameWidth = Math.max(1, contentWidth - 2 - indentWidth - 2 - displayWidth(count))
  return (
    <InlineButton
      id={`http-collection-${row.kind}-${row.path}`}
      label={`${indent}${row.expanded ? "▾" : "▸"} ${truncateDisplay(row.name, nameWidth)}${count}`}
      accent={COLORS.http}
      selected={selected}
      onPress={onPress}
    />
  )
}

function runCollectionCommand(
  command: HttpCollectionTreeCommand,
  selected: HttpCollectionTreeRow | null,
  actions: {
    select: (id: string) => void
    toggle: (id: string) => void
    open: (request: HttpProjectRequestItem) => void
    start: (action: HttpCollectionAction, row: HttpCollectionTreeRow | null) => void
    apply: () => void
    cancel: () => void
  },
) {
  if (command.kind === "noop") return
  if (command.kind === "select") actions.select(command.id)
  else if (command.kind === "toggle") {
    actions.select(command.id)
    actions.toggle(command.id)
  } else if (command.kind === "open") {
    actions.select(command.row.id)
    actions.open(command.row.item)
  } else if (command.kind === "confirm-delete") actions.apply()
  else if (command.kind === "cancel-delete") actions.cancel()
  else if (command.kind === "rename" || command.kind === "delete") {
    actions.start(command.kind, selected)
  } else if (command.kind === "create-request") actions.start(command.kind, selected)
  else actions.start(command.kind, selected?.kind === "directory" ? selected : null)
}

export function HttpCollectionTree({
  state,
  contentWidth,
  projectRequests,
  projectDirectories,
  projectFiles,
  projectErrors,
  selection,
  setSelection,
  registerSearchInput,
  keyRef,
  scrollRef,
  onFocus,
  onOpen,
  onImport,
  onRun,
  onManage,
}: {
  state: HttpWorkspaceState
  contentWidth: number
  projectRequests: HttpProjectRequestItem[]
  projectDirectories: string[]
  projectFiles: string[]
  projectErrors: number
  selection: string | null
  setSelection: (id: string | null) => void
  registerSearchInput: (input: InputRenderable | null) => void
  keyRef: { current: ((key: HttpKey) => boolean) | null }
  scrollRef: { current: ScrollBoxRenderable | null }
  onFocus: () => void
  onOpen: (request: HttpProjectRequestItem) => void
  onImport: () => void
  onRun: () => void
  onManage: (
    action: HttpCollectionAction,
    row: HttpCollectionTreeRow | null,
    name?: string,
  ) => Promise<boolean>
}) {
  const [query, setQuery] = useState("")
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  const [pending, setPending] = useState<{
    action: HttpCollectionAction
    row: HttpCollectionTreeRow | null
  } | null>(null)
  const [name, setName] = useState("")
  const searchRef = useRef<InputRenderable | null>(null)
  const handlerRef = useRef<((key: HttpKey) => boolean) | null>(null)
  const rows = useMemo(
    () =>
      buildHttpCollectionTree(projectRequests, collapsed, query, projectDirectories, projectFiles),
    [collapsed, projectDirectories, projectFiles, projectRequests, query],
  )
  const selected = rows.find((row) => row.id === selection) ?? null
  useEffect(() => {
    if (!pending && selection && !selected) {
      setSelection(visibleHttpCollectionSelection(rows, selection))
    }
  }, [pending, rows, selected, selection, setSelection])
  useEffect(() => {
    const scroll = scrollRef.current
    const index = rows.findIndex((row) => row.id === selection)
    if (!scroll || index < 0) return
    const line = 7 + (selected ? 1 : 0) + (pending ? 3 : 0) + index
    const visible = Math.max(1, scroll.viewport.height)
    if (line < scroll.scrollTop) scroll.scrollTo(line)
    else if (line >= scroll.scrollTop + visible) scroll.scrollTo(line - visible + 1)
  }, [pending, rows, scrollRef, selected, selection])
  const start = (action: HttpCollectionAction, row: HttpCollectionTreeRow | null) => {
    setName(
      action === "rename" && row ? (row.kind === "request" ? row.item.request.name : row.name) : "",
    )
    setPending({ action, row })
    onFocus()
  }
  const apply = async (currentName = name) => {
    if (!pending) return
    if (await onManage(pending.action, pending.row, currentName)) {
      if (pending.row && pending.action.startsWith("create-")) {
        const row = pending.row
        setCollapsed((current) => {
          const next = new Set(current)
          next.delete(row.kind === "request" ? `file:${row.path}` : row.id)
          return next
        })
      }
      setPending(null)
      setSelection(httpCollectionSelectionAfterAction(pending.action, pending.row, currentName))
      setName("")
    }
  }
  const toggle = (id: string) =>
    setCollapsed((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const compactActions = contentWidth < 48
  const compactSearch = contentWidth < 30
  const handleKey = (key: HttpKey) => {
    const command = resolveHttpCollectionTreeCommand(
      key,
      rows,
      selection,
      pending?.action === "delete",
    )
    if (!command) return false
    runCollectionCommand(command, selected, {
      select: setSelection,
      toggle,
      open: onOpen,
      start,
      apply: () => void apply(),
      cancel: () => setPending(null),
    })
    return true
  }
  handlerRef.current = handleKey
  keyRef.current = handleKey
  useEffect(
    () => () => {
      if (keyRef.current === handlerRef.current) keyRef.current = null
    },
    [keyRef],
  )

  return (
    <>
      <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
        <InlineButton
          id="http-collection-import-button"
          label={compactActions ? "[I]" : "[I] Importar"}
          accent={COLORS.http}
          onPress={onImport}
        />
        <InlineButton
          id="http-collection-runner-button"
          label={compactActions ? "[R]" : "[R] Rodar"}
          accent={COLORS.http}
          onPress={onRun}
        />
      </box>
      <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
        <InlineButton
          id="http-collection-create"
          label={compactActions ? "[Shift+N]" : "[Shift+N] Nova coleção"}
          accent={COLORS.http}
          onPress={() =>
            start("create-collection", selected?.kind === "directory" ? selected : null)
          }
        />
        <InlineButton
          id="http-folder-create"
          label={compactActions ? "[P]" : "[P] Nova pasta"}
          accent={COLORS.http}
          onPress={() => start("create-folder", selected?.kind === "directory" ? selected : null)}
        />
      </box>
      <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
        <InlineButton
          id="http-request-create"
          label={compactActions ? "[N]" : "[N] Nova request"}
          accent={COLORS.http}
          onPress={() => start("create-request", selected)}
        />
      </box>
      {selected ? (
        <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
          <InlineButton
            id="http-collection-rename"
            label="[E] Renomear"
            accent={COLORS.http}
            onPress={() => start("rename", selected)}
          />
          <InlineButton
            id="http-collection-delete"
            label="[D] Excluir"
            accent={COLORS.danger}
            onPress={() => start("delete", selected)}
          />
        </box>
      ) : null}
      {pending ? (
        <HttpCollectionActionForm
          action={pending.action}
          row={pending.row}
          name={name}
          contentWidth={contentWidth}
          onNameChange={setName}
          onApply={(currentName) => void apply(currentName)}
          onCancel={() => setPending(null)}
        />
      ) : null}
      <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
        <InlineButton
          id="http-collection-search-button"
          label={compactSearch ? "[F]" : "[F] Buscar"}
          accent={COLORS.http}
          active={Boolean(query)}
          onPress={() => {
            onFocus()
            searchRef.current?.focus()
          }}
        />
        <input
          ref={(input) => {
            searchRef.current = input
            registerSearchInput(input)
          }}
          id="http-collection-search"
          value={query}
          placeholder={compactSearch ? "…" : translateUi("Buscar coleção")}
          onInput={setQuery}
          onMouseDown={() => {
            onFocus()
            searchRef.current?.focus()
          }}
          style={{
            flexGrow: 1,
            backgroundColor: COLORS.canvas,
            focusedBackgroundColor: COLORS.panelRaised,
          }}
        />
        {query ? (
          <InlineButton
            id="http-collection-search-clear"
            label="[×]"
            accent={COLORS.danger}
            onPress={() => setQuery("")}
          />
        ) : null}
      </box>
      <text
        content={truncateDisplay(
          translateUi("[↑/↓] [J/K] Navegar  [←/→] Recolher/abrir  [Enter] Abrir"),
          contentWidth,
        )}
        style={{ fg: COLORS.muted }}
      />
      {rows.length ? (
        rows.map((row) => (
          <CollectionRow
            key={row.id}
            row={row}
            contentWidth={contentWidth}
            activeDocumentId={state.activeDocumentId}
            selected={selection === row.id}
            onPress={() => {
              onFocus()
              setSelection(row.id)
              if (row.kind === "request") onOpen(row.item)
              else toggle(row.id)
            }}
          />
        ))
      ) : (
        <text
          content={truncateDisplay(
            translateUi(
              query
                ? "Nenhum request corresponde à busca."
                : "Nenhum arquivo .http ou .rest no projeto.",
            ),
            contentWidth,
          )}
          style={{ fg: COLORS.muted }}
        />
      )}
      {projectErrors ? (
        <text
          content={truncateDisplay(
            translateUi(`${projectErrors} arquivo(s) não puderam ser lidos.`),
            contentWidth,
          )}
          style={{ fg: COLORS.warning }}
        />
      ) : null}
    </>
  )
}
