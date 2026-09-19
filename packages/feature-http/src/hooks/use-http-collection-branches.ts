import { useMemo, useState } from "react"
import { httpCollectionNodeId } from "../model/collection-tree"
import type { HttpSourceMode } from "../model/source-mode"
import type { PostmanWorkspace } from "../postman/api"
import type { PostmanCollectionFolder } from "../postman/sync"

function postmanClosedNodes(
  directories: readonly string[],
  files: readonly string[],
  folders: readonly PostmanCollectionFolder[],
  expanded: ReadonlySet<string>,
) {
  const ids = [
    ...directories.map((path) => httpCollectionNodeId("directory", path)),
    ...files.map((path) => httpCollectionNodeId("file", path)),
    ...folders.map((folder) => `folder:${folder.filePath}:${folder.id}`),
  ]
  return new Set(ids.filter((id) => !expanded.has(id)))
}

export function useHttpCollectionBranches(
  sourceMode: HttpSourceMode,
  postmanWorkspace: PostmanWorkspace | null,
  directories: readonly string[],
  files: readonly string[],
  folders: readonly PostmanCollectionFolder[],
) {
  const [localCollapsed, setLocalCollapsed] = useState<Set<string>>(() => new Set())
  // A new workspace selection object starts a fresh tree, even when its ID is unchanged.
  const [postmanOpen, setPostmanOpen] = useState<{
    workspace: PostmanWorkspace | null
    ids: Set<string>
  }>(() => ({ workspace: null, ids: new Set() }))
  const collapsed = useMemo(
    () =>
      sourceMode === "postman"
        ? postmanClosedNodes(
            directories,
            files,
            folders,
            postmanOpen.workspace === postmanWorkspace ? postmanOpen.ids : new Set(),
          )
        : localCollapsed,
    [directories, files, folders, localCollapsed, postmanOpen, postmanWorkspace, sourceMode],
  )
  const update = (id: string, open: boolean) => {
    if (sourceMode === "postman") {
      setPostmanOpen((current) => {
        const ids = new Set(current.workspace === postmanWorkspace ? current.ids : [])
        if (open) ids.add(id)
        else if (ids.has(id)) ids.delete(id)
        else ids.add(id)
        return { workspace: postmanWorkspace, ids }
      })
    } else {
      setLocalCollapsed((current) => {
        const next = new Set(current)
        if (open) next.delete(id)
        else if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })
    }
  }
  return {
    collapsed,
    expand: (id: string) => update(id, true),
    toggle: (id: string) => update(id, false),
  }
}
