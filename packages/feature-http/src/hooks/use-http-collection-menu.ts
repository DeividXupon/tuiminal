import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import type {
  HttpCollectionAction,
  HttpCollectionDestination,
} from "./use-http-collection-management"
import type { HttpSourceMode } from "../model/source-mode"
import type { PostmanWorkspace } from "../postman/api"
import { useEffect, useState } from "react"
import type { HttpCollectionTreeRow } from "../model/collection-tree"
import type { HttpKey } from "../model/keyboard-types"

export const HTTP_WORKSPACE_ROW_ID = "workspace:postman"
export type HttpCollectionWorkspace = {
  kind: "workspace"
  id: string
  name: string
  source: HttpSourceMode
}
export type HttpCollectionMenuTarget = HttpCollectionTreeRow | HttpCollectionWorkspace
export type HttpCollectionMenuAction =
  | HttpCollectionAction
  | "select-workspace"
  | "create-workspace"
  | "settings"
  | "run-collection"
  | "import-collection"

export function useHttpCollectionMenu(
  active: boolean,
  selected: HttpCollectionMenuTarget | null,
  select: (id: string) => void,
  focus: () => void,
) {
  const [openId, setOpenId] = useState<string | null>(null)
  useEffect(() => {
    if (!active || selected?.id !== openId) setOpenId(null)
  }, [active, selected?.id, openId])
  const open = () => {
    if (active && selected) setOpenId(selected.id)
  }
  const handleKey = (key: HttpKey) => {
    if (key.name !== "a" || key.ctrl || key.meta || key.option || !active || !selected) return false
    open()
    return true
  }
  return {
    row: active && selected?.id === openId ? selected : null,
    open,
    openFor: (row: HttpCollectionMenuTarget) => {
      focus()
      select(row.id)
      setOpenId(row.id)
    },
    close: () => setOpenId(null),
    handleKey,
  }
}

export function collectionActionName(action: string, row: HttpCollectionTreeRow | null) {
  if (!row) return ""
  const name =
    row.kind === "request"
      ? row.item.request.name.slice(row.folderPath ? row.folderPath.length + 3 : 0)
      : row.name
  if (action === "rename") return name
  return action === "duplicate" ? `${name.replace(/\.(http|rest)$/i, "")} copy` : ""
}

export function collectionDestination(
  action: HttpCollectionAction,
  mode: HttpSourceMode,
  workspace: PostmanWorkspace | undefined | null,
): HttpCollectionDestination | undefined {
  if (action !== "create-collection") return undefined
  return mode === "postman" && workspace
    ? { kind: "postman", workspaceId: workspace.id }
    : { kind: "tuiminal" }
}

export function missingPostmanWorkspace(
  action: HttpCollectionAction,
  destination: "tuiminal" | "postman",
  workspace: PostmanWorkspace | undefined | null,
) {
  return action === "create-collection" && destination === "postman" && !workspace
}

export function collectionWorkspace(
  mode: HttpSourceMode,
  workspace: PostmanWorkspace | null,
): HttpCollectionWorkspace {
  return mode === "postman"
    ? {
        kind: "workspace",
        source: mode,
        id: HTTP_WORKSPACE_ROW_ID,
        name: workspace?.name ?? translateUi("WORKSPACE POSTMAN"),
      }
    : { kind: "workspace", source: mode, id: "workspace:local", name: translateUi("PROJETO") }
}
