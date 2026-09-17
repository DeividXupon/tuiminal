import type { InputRenderable } from "@opentui/core"
import { useEffect, useRef } from "react"
import { translateUi, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import type { HttpCollectionAction } from "../hooks/use-http-collection-management"
import type { HttpCollectionTreeRow } from "../model/collection-tree"

function heading(action: HttpCollectionAction) {
  if (action === "delete") return "EXCLUIR"
  if (action === "rename") return "RENOMEAR"
  return "CRIAR"
}

function targetName(row: HttpCollectionTreeRow | null) {
  if (!row) return translateUi("RAIZ")
  return row.kind === "request" ? row.item.request.name : row.path
}

export function HttpCollectionActionForm({
  action,
  row,
  name,
  contentWidth,
  onNameChange,
  onApply,
  onCancel,
}: {
  action: HttpCollectionAction
  row: HttpCollectionTreeRow | null
  name: string
  contentWidth: number
  onNameChange: (name: string) => void
  onApply: (name?: string) => void
  onCancel: () => void
}) {
  const inputRef = useRef<InputRenderable | null>(null)
  useEffect(() => {
    if (action === "delete") return
    const timer = setTimeout(() => inputRef.current?.focus(), 20)
    return () => clearTimeout(timer)
  }, [action])
  return (
    <box id="http-collection-action-form" style={{ flexShrink: 0 }}>
      <text
        content={truncateDisplay(
          `${translateUi(heading(action))} · ${targetName(row)}`,
          contentWidth,
        )}
        style={{ fg: action === "delete" ? COLORS.danger : COLORS.http }}
      />
      {action === "delete" ? (
        <text
          content={translateUi("Confirme a exclusão deste item e de seu conteúdo.")}
          style={{ fg: COLORS.warning }}
        />
      ) : (
        <input
          ref={inputRef}
          id="http-collection-name-input"
          value={name}
          placeholder={translateUi("Nome")}
          onInput={onNameChange}
          onKeyDown={(event) => {
            if (event.name === "return" || event.name === "enter") {
              event.preventDefault()
              event.stopPropagation()
              onApply(inputRef.current?.value)
            }
            if (event.name === "escape") {
              event.preventDefault()
              event.stopPropagation()
              onCancel()
            }
          }}
          onMouseDown={() => inputRef.current?.focus()}
          style={{ backgroundColor: COLORS.canvas, focusedBackgroundColor: COLORS.panelRaised }}
        />
      )}
      <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
        <InlineButton
          id="http-collection-action-apply"
          label={action === "delete" ? "[Enter] Excluir" : "[Enter] Salvar"}
          accent={action === "delete" ? COLORS.danger : COLORS.http}
          disabled={action !== "delete" && !name.trim()}
          onPress={() => onApply(inputRef.current?.value)}
        />
        <InlineButton
          id="http-collection-action-cancel"
          label="Cancelar"
          accent={COLORS.http}
          onPress={onCancel}
        />
      </box>
    </box>
  )
}
