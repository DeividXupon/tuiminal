import { isPostmanPath } from "../postman/mutations"
import type { HttpCollectionAction } from "../hooks/use-http-collection-management"
import type { HttpCollectionTreeRow } from "../model/collection-tree"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { HttpCollectionNameInput, type HttpCollectionNameEdit } from "./HttpCollectionNameInput"
import { httpMethodColor } from "./http-method-colors"

type Pending = { action: HttpCollectionAction; row: HttpCollectionTreeRow | null }

export function collectionDraftAnchor(pending: Pending | null, rows: HttpCollectionTreeRow[]) {
  if (!pending || ["rename", "delete", "create-collection"].includes(pending.action))
    return undefined
  const row = pending.row
  if (!row) return null
  if (
    pending.action === "create-request" ||
    (pending.action === "create-folder" && (row.kind !== "file" || isPostmanPath(row.path)))
  )
    return row.id
  const index = rows.findIndex((candidate) => candidate.id === row.id)
  let last = row.id
  for (const candidate of rows.slice(index + 1)) {
    if (candidate.depth <= row.depth) break
    last = candidate.id
  }
  return last
}

export function HttpCollectionDraft({
  action,
  row,
  methodWidth,
  edit,
}: Pending & { methodWidth: number; edit: HttpCollectionNameEdit }) {
  const request = action === "create-request" || (action === "duplicate" && row?.kind === "request")
  const child =
    (action === "create-request" && row?.kind !== "request") ||
    (action === "create-folder" && Boolean(row && (row.kind !== "file" || isPostmanPath(row.path))))
  const depth = row ? row.depth + (child ? 1 : 0) : 0
  const method = action === "duplicate" && row?.kind === "request" ? row.item.request.method : "GET"
  return (
    <box
      id="http-collection-draft"
      height={1}
      flexShrink={0}
      flexDirection="row"
      backgroundColor={COLORS.diffModifiedBg}
    >
      <text
        content={` ${"  ".repeat(depth)}${request ? "" : "▸ "}`}
        fg={COLORS.muted}
        flexShrink={0}
      />
      {request ? (
        <>
          <text content={method} fg={httpMethodColor(method)} width={methodWidth} flexShrink={0} />
          <text content=" " />
        </>
      ) : null}
      <HttpCollectionNameInput {...edit} />
    </box>
  )
}

export function collectionFocusIndex(
  pending: Pending | null,
  rows: HttpCollectionTreeRow[],
  selection: string | null,
) {
  const anchor = collectionDraftAnchor(pending, rows)
  if (anchor === undefined) return rows.findIndex((row) => row.id === selection)
  if (anchor === null) return 0
  return rows.findIndex((row) => row.id === anchor) + 1
}
