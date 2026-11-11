import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { useRenderer } from "@opentui/react"
import type { ScrollBoxRenderable } from "@opentui/core"
import { useCallback, useEffect, useRef } from "react"
import type { httpWorkspaceTabs } from "../model/environment-documents"
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
  documents: ReturnType<typeof httpWorkspaceTabs>
  activeDocumentId: string
  compact: boolean
  sourceMode: HttpSourceMode
  onChooseSource: () => void
  onSelect: (documentId: string) => void
  onClose: (documentId: string) => void
  onAdd: () => void
}) {
  const renderer = useRenderer()
  const nameWidth = compact ? 8 : 15
  const scrollRef = useRef<ScrollBoxRenderable | null>(null)
  const revealActive = useCallback(() => {
    scrollRef.current?.scrollChildIntoView(`http-document-tab-${activeDocumentId}`)
  }, [activeDocumentId])
  const scheduleReveal = useCallback(() => {
    renderer.off("frame", revealActive)
    renderer.once("frame", revealActive)
    renderer.requestRender()
  }, [renderer, revealActive])
  useEffect(() => {
    scheduleReveal()
    return () => {
      renderer.off("frame", revealActive)
    }
  }, [renderer, revealActive, scheduleReveal])
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
      <scrollbox
        id="http-document-tabs"
        ref={scrollRef}
        scrollX
        scrollY={false}
        horizontalScrollbarOptions={{ visible: false }}
        contentOptions={{ flexDirection: "row" }}
        onSizeChange={scheduleReveal}
        style={{ height: 1, width: 0, flexGrow: 1, minWidth: 0 }}
      >
        {documents.map((document, index) => {
          const active = document.id === activeDocumentId
          const dirty = document.dirty
          const name = truncateDisplay(document.name, nameWidth)
          return (
            <box
              key={document.id}
              id={`http-document-tab-${document.id}`}
              onSizeChange={scheduleReveal}
              style={{ flexDirection: "row", flexShrink: 0 }}
            >
              <InlineButton
                id={`http-document-${document.id}`}
                label={`${index < 9 ? `[${index + 1}] ` : ""}${document.prefix} ${name}${dirty ? " ●" : ""}`}
                accent={COLORS.http}
                active={active}
                onPress={() => onSelect(document.id)}
              />
              {
                <InlineButton
                  id={`http-document-close-${document.id}`}
                  label={active ? "[X]" : "×"}
                  active={active}
                  shortcutBaseColor={COLORS.danger}
                  accent={COLORS.danger}
                  onPress={() => onClose(document.id)}
                />
              }
            </box>
          )
        })}
      </scrollbox>
      <InlineButton id="http-document-new" label="[Ctrl+N]" accent={COLORS.http} onPress={onAdd} />
    </box>
  )
}
