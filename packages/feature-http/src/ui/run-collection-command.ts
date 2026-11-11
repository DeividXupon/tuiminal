import type { HttpCollectionTreeCommand } from "../model/collection-tree-navigation"
import type { HttpProjectRequestItem } from "../model/types"

export function runCollectionCommand(
  command: HttpCollectionTreeCommand,
  actions: {
    select: (id: string) => void
    toggle: (id: string) => void
    open: (request: HttpProjectRequestItem) => void
    apply: () => void
    cancel: () => void
    workspaceMenu: () => void
  },
) {
  if (command.kind === "workspace-menu") return actions.workspaceMenu()
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
}
