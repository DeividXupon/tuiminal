import type { ScrollBoxRenderable } from "@opentui/core"
import { useRef } from "react"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import type { HttpRequestTableNavigation } from "../hooks/use-http-request-tables"
import type { HttpMultipartPart } from "../model/types"
import { HttpMultipartRow } from "./HttpMultipartRow"
import { HttpRequestTable } from "./HttpRequestTable"

export function HttpMultipartEditor({
  requestId,
  parts,
  onChange,
  navigation,
  dense = false,
}: {
  requestId: string
  dense?: boolean
  parts: HttpMultipartPart[]
  onChange: (parts: HttpMultipartPart[]) => void
  navigation: HttpRequestTableNavigation<HttpMultipartPart>
}) {
  const rows =
    navigation.active && navigation.mode !== "block" ? [...parts, navigation.draft] : parts
  const scrollRef = useRef<ScrollBoxRenderable | null>(null)
  const currentRows = useRef(rows)
  currentRows.current = rows
  const patchPart = (id: string, patch: Partial<HttpMultipartPart>) => {
    if (id === navigation.draft.id) {
      if (patch.name !== undefined) navigation.onDraftInput("name", patch.name)
      else if (patch.value !== undefined) navigation.onDraftInput("value", patch.value)
      return
    }
    onChange(parts.map((part) => (part.id === id ? { ...part, ...patch } : part)))
  }

  return (
    <HttpRequestTable
      idPrefix={`${requestId}-multipart`}
      title="MULTIPART"
      count={parts.length}
      enabledCount={parts.filter((part) => part.enabled).length}
      navigation={navigation}
      scrollRef={scrollRef}
      dense={dense}
      multipart
    >
      {rows.length ? (
        rows.map((part, index) => (
          <HttpMultipartRow
            key={part.id}
            part={part}
            index={index}
            draft={part.id === navigation.draft.id}
            navigation={navigation}
            currentRows={currentRows}
            onPatch={patchPart}
            onDelete={(id) => onChange(parts.filter((candidate) => candidate.id !== id))}
          />
        ))
      ) : (
        <text content={translateUi("Nenhuma parte definida.")} style={{ fg: COLORS.muted }} />
      )}
    </HttpRequestTable>
  )
}
