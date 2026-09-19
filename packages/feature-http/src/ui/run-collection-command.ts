import type { HttpCollectionAction } from "../hooks/use-http-collection-management"
import type { HttpCollectionTreeRow } from "../model/collection-tree"
import type { HttpCollectionTreeCommand } from "../model/collection-tree-navigation"
import type { HttpProjectRequestItem } from "../model/types"
import { isPostmanPath } from "../postman/mutations"

export function runCollectionCommand(
  command: HttpCollectionTreeCommand,
  selected: HttpCollectionTreeRow | null,
  actions: {
    select: (id: string) => void
    toggle: (id: string) => void
    open: (request: HttpProjectRequestItem) => void
    start: (action: HttpCollectionAction, row: HttpCollectionTreeRow | null) => void
    apply: () => void
    cancel: () => void
    postman: () => void
  },
) {
  if (command.kind === "noop") return
  if (command.kind === "open-postman") return actions.postman()
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
  else
    actions.start(
      command.kind,
      selected?.kind === "directory" ||
        selected?.kind === "folder" ||
        (command.kind === "create-folder" &&
          selected?.kind === "file" &&
          isPostmanPath(selected.path))
        ? selected
        : null,
    )
}
