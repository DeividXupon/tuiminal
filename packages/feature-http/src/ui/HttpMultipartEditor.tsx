import type { ScrollBoxRenderable } from "@opentui/core"
import { useEffect, useRef } from "react"
import { COLORS, focusedPanelBorder } from "@xupon/tuiminal-core/settings/theme"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { ShortcutText } from "@xupon/tuiminal-core/ui/ShortcutText"
import type { HttpRequestTableNavigation } from "../hooks/use-http-request-tables"
import type { HttpMultipartPart } from "../model/types"
import { HttpMultipartRow } from "./HttpMultipartRow"

export function HttpMultipartEditor({
  requestId,
  parts,
  onChange,
  navigation,
}: {
  requestId: string
  parts: HttpMultipartPart[]
  onChange: (parts: HttpMultipartPart[]) => void
  navigation: HttpRequestTableNavigation<HttpMultipartPart>
}) {
  const rows =
    navigation.active && navigation.mode !== "block" ? [...parts, navigation.draft] : parts
  const scrollRef = useRef<ScrollBoxRenderable | null>(null)
  const currentRows = useRef(rows)
  currentRows.current = rows
  useEffect(() => {
    if (navigation.active && navigation.mode !== "block") {
      scrollRef.current?.scrollTo(Math.max(0, navigation.row - 2))
    }
  }, [navigation.active, navigation.mode, navigation.row])
  const patchPart = (id: string, patch: Partial<HttpMultipartPart>) => {
    if (id === navigation.draft.id) {
      if (patch.name !== undefined) navigation.onDraftInput("name", patch.name)
      else if (patch.value !== undefined) navigation.onDraftInput("value", patch.value)
      return
    }
    onChange(parts.map((part) => (part.id === id ? { ...part, ...patch } : part)))
  }

  return (
    <box
      id={`http-key-value-section-${requestId}-multipart`}
      focusable
      style={{ ...focusedPanelBorder(navigation.active, COLORS.http), flexGrow: 1 }}
    >
      <box
        {...(navigation.active ? {} : { onMouseDown: navigation.onFocusBlock })}
        style={{ height: 1, flexShrink: 0, flexDirection: "row" }}
      >
        <text
          content={translateUi("MULTIPART")}
          style={{ flexGrow: 1, fg: navigation.active ? COLORS.http : COLORS.muted }}
        />
        {navigation.active && navigation.mode === "block" ? (
          <InlineButton label="[Enter] Tabela" accent={COLORS.http} onPress={navigation.onEnter} />
        ) : null}
      </box>
      <scrollbox
        ref={scrollRef}
        scrollY
        viewportCulling
        style={{ flexGrow: 1, backgroundColor: COLORS.canvas }}
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
      </scrollbox>
      {navigation.active && navigation.mode === "table" ? (
        <box style={{ height: 1, flexShrink: 0, overflow: "hidden" }}>
          <ShortcutText
            content={
              navigation.column === 2
                ? "[Enter] Excluir linha · [Space] Ativar/desativar"
                : "[Space] Ativar/desativar · [←/→] Selecionar [×]"
            }
            style={{ fg: COLORS.muted }}
          />
        </box>
      ) : (
        <text
          content={translateUi("[T] texto · [F] arquivo relativo ao projeto")}
          style={{ fg: COLORS.muted }}
        />
      )}
    </box>
  )
}
