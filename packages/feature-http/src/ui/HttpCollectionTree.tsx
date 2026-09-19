import type { InputRenderable, ScrollBoxRenderable } from "@opentui/core"
import { useEffect, useMemo, useRef, useState } from "react"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { translateUi, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { buildHttpCollectionTree, type HttpCollectionTreeRow } from "../model/collection-tree"
import {
  httpCollectionSelectionAfterAction,
  visibleHttpCollectionSelection,
  resolveHttpCollectionTreeCommand,
} from "../model/collection-tree-navigation"
import type { HttpKey } from "../model/keyboard-types"
import type { HttpProjectRequestItem, HttpWorkspaceState } from "../model/types"
import type {
  HttpCollectionAction,
  HttpCollectionDestination,
} from "../hooks/use-http-collection-management"
import { usePostmanCollectionDestination } from "../hooks/use-postman-collection-destination"
import { useHttpCollectionBranches } from "../hooks/use-http-collection-branches"
import { isPostmanPath } from "../postman/mutations"
import { HttpCollectionActionForm } from "./HttpCollectionActionForm"
import { HttpCollectionRow } from "./HttpCollectionRow"
import { HttpCollectionCommands } from "./HttpCollectionCommands"
import { runCollectionCommand } from "./run-collection-command"
import type { HttpSourceMode } from "../model/source-mode"
import type { PostmanCollectionFolder } from "../postman/sync"
import type { PostmanWorkspace } from "../postman/api"

function collectionDestination(
  action: HttpCollectionAction,
  mode: HttpSourceMode,
  workspace: PostmanWorkspace | undefined | null,
): HttpCollectionDestination | undefined {
  if (action !== "create-collection") return undefined
  return mode === "postman" && workspace
    ? { kind: "postman", workspaceId: workspace.id }
    : { kind: "tuiminal" }
}

function missingPostmanWorkspace(
  action: HttpCollectionAction,
  destination: "tuiminal" | "postman",
  workspace: PostmanWorkspace | undefined | null,
) {
  return action === "create-collection" && destination === "postman" && !workspace
}

export function HttpCollectionTree({
  state,
  sourceMode,
  postmanWorkspace,
  onPostmanWorkspaceChange,
  contentWidth,
  projectRequests,
  projectDirectories,
  projectFiles,
  postmanFolders,
  projectErrors,
  selection,
  setSelection,
  registerSearchInput,
  keyRef,
  scrollRef,
  onFocus,
  onOpen,
  onImport,
  onPostman,
  onRun,
  onManage,
}: {
  state: HttpWorkspaceState
  sourceMode: HttpSourceMode
  postmanWorkspace: PostmanWorkspace | null
  onPostmanWorkspaceChange: (workspace: PostmanWorkspace) => void
  contentWidth: number
  projectRequests: HttpProjectRequestItem[]
  projectDirectories: string[]
  projectFiles: string[]
  postmanFolders: PostmanCollectionFolder[]
  projectErrors: number
  selection: string | null
  setSelection: (id: string | null) => void
  registerSearchInput: (input: InputRenderable | null) => void
  keyRef: { current: ((key: HttpKey) => boolean) | null }
  scrollRef: { current: ScrollBoxRenderable | null }
  onFocus: () => void
  onOpen: (request: HttpProjectRequestItem) => void
  onImport: () => void
  onPostman: () => void
  onRun: () => void
  onManage: (
    action: HttpCollectionAction,
    row: HttpCollectionTreeRow | null,
    name?: string,
    destination?: HttpCollectionDestination,
  ) => Promise<boolean>
}) {
  const [query, setQuery] = useState("")
  const [helpOpen, setHelpOpen] = useState(false)
  const [pending, setPending] = useState<{
    action: HttpCollectionAction
    row: HttpCollectionTreeRow | null
  } | null>(null)
  const [name, setName] = useState("")
  const postmanDestination = usePostmanCollectionDestination()
  const {
    destination,
    workspaces,
    workspaceIndex,
    setWorkspaceIndex,
    workspaceError,
    setWorkspaceError,
  } = postmanDestination
  const searchRef = useRef<InputRenderable | null>(null)
  const handlerRef = useRef<((key: HttpKey) => boolean) | null>(null)
  const { collapsed, expand, toggle } = useHttpCollectionBranches(
    sourceMode,
    postmanWorkspace,
    projectDirectories,
    projectFiles,
    postmanFolders,
  )
  const rows = useMemo(
    () =>
      buildHttpCollectionTree(
        projectRequests,
        collapsed,
        query,
        projectDirectories,
        projectFiles,
        postmanFolders,
        sourceMode === "postman",
      ),
    [
      collapsed,
      postmanFolders,
      projectDirectories,
      projectFiles,
      projectRequests,
      query,
      sourceMode,
    ],
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
    const formLines =
      pending?.action === "create-collection"
        ? destination === "postman"
          ? 5
          : 4
        : pending
          ? 3
          : 0
    const line = 4 + (helpOpen ? 4 + (selected ? 1 : 0) : 0) + formLines + index
    const visible = Math.max(1, scroll.viewport.height)
    if (line < scroll.scrollTop) scroll.scrollTo(line)
    else if (line >= scroll.scrollTop + visible) scroll.scrollTo(line - visible + 1)
  }, [destination, helpOpen, pending, rows, scrollRef, selected, selection])
  const start = (action: HttpCollectionAction, row: HttpCollectionTreeRow | null) => {
    if (
      action === "create-collection" &&
      row?.kind === "directory" &&
      (row.path === "postman" || isPostmanPath(row.path))
    ) {
      row = null
    }
    setName(
      action === "rename" && row ? (row.kind === "request" ? row.item.request.name : row.name) : "",
    )
    setPending({ action, row })
    if (action === "create-collection")
      postmanDestination.reset(sourceMode === "postman" ? "postman" : "tuiminal")
    onFocus()
  }
  const apply = async (currentName = name) => {
    if (!pending) return
    const workspace = postmanWorkspace ?? workspaces[workspaceIndex]
    if (missingPostmanWorkspace(pending.action, destination, workspace)) {
      setWorkspaceError("Selecione um workspace Postman.")
      return
    }
    const target = collectionDestination(pending.action, sourceMode, workspace)
    if (await onManage(pending.action, pending.row, currentName, target)) {
      if (target?.kind === "postman" && workspace) {
        onPostmanWorkspaceChange(workspace)
      }
      if (pending.row && pending.action.startsWith("create-")) {
        const row = pending.row
        expand(row.kind === "request" ? `file:${row.path}` : row.id)
      }
      setPending(null)
      setSelection(httpCollectionSelectionAfterAction(pending.action, pending.row, currentName))
      setName("")
    }
  }
  const compactSearch = contentWidth < 30
  const handleKey = (key: HttpKey) => {
    if (key.name === "?" || (key.name === "/" && key.shift)) {
      setHelpOpen((open) => !open)
      return true
    }
    if (key.name === "escape" && helpOpen) {
      setHelpOpen(false)
      return true
    }
    const command = resolveHttpCollectionTreeCommand(
      key,
      rows,
      selection,
      pending?.action === "delete",
    )
    if (!command) return false
    if (command.kind === "open-postman" && sourceMode === "local") return false
    runCollectionCommand(command, selected, {
      select: setSelection,
      toggle,
      open: onOpen,
      start,
      apply: () => void apply(),
      cancel: () => setPending(null),
      postman: onPostman,
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
      <InlineButton
        id="http-collection-help"
        label="[?] Comandos"
        accent={COLORS.http}
        active={helpOpen}
        onPress={() => {
          onFocus()
          setHelpOpen((open) => !open)
        }}
      />
      {helpOpen ? (
        <HttpCollectionCommands
          sourceMode={sourceMode}
          selected={selected}
          contentWidth={contentWidth}
          onImport={onImport}
          onRun={onRun}
          onPostman={onPostman}
          onStart={start}
        />
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
          destination={destination}
          sourceMode={sourceMode}
          workspaces={workspaces}
          activeWorkspace={postmanWorkspace}
          workspaceIndex={workspaceIndex}
          onWorkspaceChange={setWorkspaceIndex}
          workspaceError={workspaceError}
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
      {rows.length ? (
        rows.map((row) => (
          <HttpCollectionRow
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
                : sourceMode === "postman"
                  ? "Nenhuma coleção neste workspace."
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
