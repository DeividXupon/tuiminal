import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { HTTP_DOCUMENT_LIMIT } from "../model/workspace"
import type { HttpDocumentState } from "../model/types"
import type { HttpSourceMode } from "../model/source-mode"

export function HttpDocumentBar({
  documents,
  activeDocumentId,
  compact,
  sourceMode,
  onChooseSource,
  onSelect,
  onClose,
  onAdd,
}: {
  documents: HttpDocumentState[]
  activeDocumentId: string
  compact: boolean
  sourceMode: HttpSourceMode
  onChooseSource: () => void
  onSelect: (documentId: string) => void
  onClose: (documentId: string) => void
  onAdd: () => void
}) {
  const nameWidth = compact ? 8 : 15
  return (
    <box
      style={{
        height: 1,
        flexShrink: 0,
        flexDirection: "row",
        backgroundColor: COLORS.panel,
        overflow: "hidden",
      }}
    >
      <InlineButton
        id="http-change-source"
        label={compact ? "[Ctrl+G]" : `[Ctrl+G] ${sourceMode === "postman" ? "Postman" : "Local"}`}
        accent={COLORS.http}
        onPress={onChooseSource}
      />
      {documents.map((document) => {
        const active = document.request.id === activeDocumentId
        const dirty = document.revision !== document.savedRevision
        const name = truncateDisplay(document.request.name, nameWidth)
        return (
          <box key={document.request.id} style={{ flexDirection: "row", flexShrink: 0 }}>
            <InlineButton
              id={`http-document-${document.request.id}`}
              label={`${document.request.method} ${name}${dirty ? " ●" : ""}`}
              accent={COLORS.http}
              active={active}
              onPress={() => onSelect(document.request.id)}
            />
            {documents.length > 1 ? (
              <InlineButton
                label="×"
                accent={COLORS.danger}
                onPress={() => onClose(document.request.id)}
              />
            ) : null}
          </box>
        )
      })}
      <InlineButton
        label="[Ctrl+N]"
        accent={COLORS.http}
        disabled={documents.length >= HTTP_DOCUMENT_LIMIT}
        onPress={onAdd}
      />
    </box>
  )
}
