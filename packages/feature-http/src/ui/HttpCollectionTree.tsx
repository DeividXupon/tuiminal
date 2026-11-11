import type { HttpCollectionSettingsTarget } from "../model/collection-settings"
import { HttpCollectionEmpty } from "./HttpCollectionEmpty"
import { HttpCollectionWorkspaceRow } from "./HttpCollectionWorkspaceRow"
import { useHttpCollectionScroll } from "../hooks/use-http-collection-scroll"
import {
  collectionWorkspace,
  collectionDestination,
  missingPostmanWorkspace,
  collectionActionName,
  useHttpCollectionMenu,
} from "../hooks/use-http-collection-menu"
import { HttpCollectionSearch } from "./HttpCollectionSearch"
import { HttpCollectionDraft, collectionDraftAnchor } from "./HttpCollectionDraft"
import { HttpCollectionMenu } from "./HttpCollectionMenu"
import type { InputRenderable, ScrollBoxRenderable } from "@opentui/core"
import { Fragment, useEffect, useMemo, useRef, useState } from "react"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { displayWidth, translateUi, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import {
  buildHttpCollectionTree,
  type HttpCollectionTreeRow,
  type HttpCollectionFile,
} from "../model/collection-tree"
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
import type { HttpCollectionRunTarget } from "../hooks/use-http-collection-runner"
import { runCollectionCommand } from "./run-collection-command"
import type { HttpSourceMode } from "../model/source-mode"
import type { PostmanCollectionFolder } from "../postman/sync"
import type { PostmanWorkspace } from "../postman/api"

export function HttpCollectionTree({
  state,
  active,
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
  onSettings,
}: {
  state: HttpWorkspaceState
  active: boolean
  sourceMode: HttpSourceMode
  postmanWorkspace: PostmanWorkspace | null
  onPostmanWorkspaceChange: (workspace: PostmanWorkspace) => void
  contentWidth: number
  projectRequests: HttpProjectRequestItem[]
  projectDirectories: string[]
  projectFiles: HttpCollectionFile[]
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
  onPostman: (action?: "create-workspace") => void
  onRun: (collection: HttpCollectionRunTarget) => void
  onSettings: (target: HttpCollectionSettingsTarget) => void
  onManage: (
    action: HttpCollectionAction,
    row: HttpCollectionTreeRow | null,
    name?: string,
    destination?: HttpCollectionDestination,
  ) => Promise<boolean | string>
}) {
  const [query, setQuery] = useState("")
  const [pending, setPending] = useState<{
    action: HttpCollectionAction
    row: HttpCollectionTreeRow | null
  } | null>(null)
  const [busy, setBusy] = useState(false)
  const applying = useRef(false)
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
  const handlerRef = useRef<((key: HttpKey) => boolean) | null>(null)
  const { collapsed, expand, toggle } = useHttpCollectionBranches(
    sourceMode,
    postmanWorkspace,
    projectDirectories,
    projectFiles.map((file) => file.path),
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
  const methodWidth = projectRequests.reduce(
    (width, item) => Math.max(width, displayWidth(item.request.method)),
    3,
  )
  useEffect(() => {
    if (!active && !applying.current) setPending(null)
  }, [active])
  const workspace = collectionWorkspace(sourceMode, postmanWorkspace)
  const workspaceSelected = Boolean(workspace && selection === workspace.id)
  const inlineCollection = pending?.action === "create-collection" && Boolean(postmanWorkspace)
  const selected = rows.find((row) => row.id === selection) ?? null
  const menu = useHttpCollectionMenu(
    active && !pending,
    workspaceSelected ? workspace : selected,
    setSelection,
    onFocus,
  )
  useEffect(() => {
    if (!pending && selection && !selected && !workspaceSelected) {
      setSelection(visibleHttpCollectionSelection(rows, selection))
    }
  }, [pending, rows, selected, selection, setSelection, workspaceSelected])
  useHttpCollectionScroll({
    scrollRef,
    pending,
    rows,
    selection,
    destination,
    inlineCollection,
    workspaceSelected,
  })
  const start = (action: HttpCollectionAction, row: HttpCollectionTreeRow | null) => {
    if (applying.current) return
    if (
      action === "create-collection" &&
      row?.kind === "directory" &&
      (row.path === "postman" || isPostmanPath(row.path))
    ) {
      row = null
    }
    setName(collectionActionName(action, row))
    setPending({ action, row })
    if (row && ["create-request", "create-folder"].includes(action)) expand(row.id)
    if (action === "create-collection")
      postmanDestination.reset(sourceMode === "postman" ? "postman" : "tuiminal")
    onFocus()
  }
  const apply = async (currentName = name) => {
    if (!pending || applying.current) return
    const workspace = postmanWorkspace ?? workspaces[workspaceIndex]
    if (missingPostmanWorkspace(pending.action, destination, workspace)) {
      setWorkspaceError("Selecione um workspace Postman.")
      return
    }
    const target = collectionDestination(pending.action, sourceMode, workspace)
    applying.current = true
    setBusy(true)
    try {
      const result = await onManage(pending.action, pending.row, currentName, target)
      if (!result) return
      if (target?.kind === "postman" && workspace) {
        onPostmanWorkspaceChange(workspace)
      }
      if (pending.row && pending.action.startsWith("create-")) {
        const row = pending.row
        expand(row.kind === "request" ? `file:${row.path}` : row.id)
      }
      setPending(null)
      setSelection(
        selectionForResult(
          result,
          httpCollectionSelectionAfterAction(
            pending.action,
            pending.row,
            currentName,
            sourceMode === "postman" ? "postman" : "",
          ),
        ),
      )
      setName("")
    } finally {
      applying.current = false
      setBusy(false)
    }
  }
  const edit = {
    name,
    busy,
    onChange: setName,
    onApply: (value: string) => void apply(value),
    onCancel: () => {
      if (!applying.current) setPending(null)
    },
  }
  const draftAnchor = inlineCollection ? null : collectionDraftAnchor(pending, rows)
  const draft =
    pending && draftAnchor !== undefined ? (
      <HttpCollectionDraft
        action={pending.action}
        row={pending.row}
        methodWidth={methodWidth}
        edit={edit}
      />
    ) : null
  const compactSearch = contentWidth < 30
  const handleKey = (key: HttpKey) => {
    if (pending && pending.action !== "delete") {
      if (key.name === "escape") edit.onCancel()
      else if (key.name === "return" || key.name === "enter") void apply()
      return true
    }
    if (menu.handleKey(key)) return true
    const command = resolveHttpCollectionTreeCommand(
      key,
      rows,
      selection,
      pending?.action === "delete",
      workspace?.id,
    )
    if (!command) return false
    runCollectionCommand(command, {
      select: setSelection,
      toggle,
      open: onOpen,
      apply: () => void apply(),
      cancel: () => setPending(null),
      workspaceMenu: menu.open,
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
      {menu.row ? (
        <HttpCollectionMenu
          settingsEnabled={sourceMode === "postman"}
          row={menu.row}
          onClose={menu.close}
          onSelect={(action) => {
            menu.close()
            switch (action) {
              case "settings":
                if (menu.row && menu.row.kind !== "workspace" && menu.row.kind !== "request")
                  onSettings(menu.row)
                return
              case "select-workspace":
                return onPostman()
              case "create-workspace":
                return onPostman(action)
              case "import-collection":
                return onImport()
              case "run-collection":
                if (menu.row?.kind === "file") onRun({ path: menu.row.path, name: menu.row.name })
                return
              default:
                start(action, menu.row?.kind === "workspace" ? null : menu.row)
            }
          }}
        />
      ) : null}
      <HttpCollectionWorkspaceRow
        workspace={workspace}
        selected={workspaceSelected}
        active={active && !pending}
        contentWidth={contentWidth}
        onSelect={() => {
          onFocus()
          setSelection(workspace.id)
        }}
        onActions={menu.open}
        onContextMenu={pending ? undefined : menu.openFor}
      />
      {pending &&
      !inlineCollection &&
      (pending.action === "delete" || pending.action === "create-collection") ? (
        <HttpCollectionActionForm
          action={pending.action}
          row={pending.row}
          name={name}
          contentWidth={contentWidth}
          onNameChange={setName}
          onApply={apply}
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
      <HttpCollectionSearch
        compact={compactSearch}
        query={query}
        onChange={setQuery}
        onFocus={onFocus}
        register={registerSearchInput}
      />
      {draftAnchor === null ? draft : null}
      {rows.length ? (
        rows.map((row) => (
          <Fragment key={row.id}>
            <HttpCollectionRow
              edit={pending?.action === "rename" && pending.row?.id === row.id ? edit : undefined}
              row={row}
              contentWidth={contentWidth}
              methodWidth={methodWidth}
              activeDocumentId={state.activeDocumentId}
              selected={selection === row.id}
              onActions={selection === row.id && active && !pending ? menu.open : undefined}
              onContextMenu={pending ? undefined : menu.openFor}
              onDoubleClick={
                sourceMode !== "postman" || row.kind === "request"
                  ? undefined
                  : () => onSettings(row)
              }
              onPress={() => {
                onFocus()
                setSelection(row.id)
                if (row.kind === "request") onOpen(row.item)
                else toggle(row.id)
              }}
            />
            {draftAnchor === row.id ? draft : null}
          </Fragment>
        ))
      ) : (
        <HttpCollectionEmpty query={query} sourceMode={sourceMode} contentWidth={contentWidth} />
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

function selectionForResult(result: boolean | string, fallback: string | null) {
  return typeof result === "string" ? result : fallback
}
