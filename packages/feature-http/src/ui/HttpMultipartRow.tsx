import type { InputRenderable } from "@opentui/core"
import { useRef, type RefObject } from "react"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import type { HttpRequestTableNavigation } from "../hooks/use-http-request-tables"
import type { HttpMultipartPart } from "../model/types"

type RowProps = {
  part: HttpMultipartPart
  index: number
  draft: boolean
  navigation: HttpRequestTableNavigation<HttpMultipartPart>
  currentRows: RefObject<HttpMultipartPart[]>
  onPatch: (id: string, patch: Partial<HttpMultipartPart>) => void
  onDelete: (id: string) => void
}

function MultipartCell({
  part,
  index,
  column,
  background,
  selected,
  navigation,
  currentRows,
  onPatch,
}: RowProps & { column: 0 | 1; background: string; selected: boolean }) {
  const inputRef = useRef<InputRenderable | null>(null)
  const field = column === 0 ? "name" : "value"
  return (
    <input
      ref={inputRef}
      id={`http-key-value-${field}-${part.id}`}
      value={part[field]}
      placeholder={translateUi(
        column === 0 ? "NOME" : part.kind === "file" ? "CAMINHO DO ARQUIVO" : "VALOR",
      )}
      width={column === 0 ? "28%" : "42%"}
      onInput={(value) => {
        if (value !== currentRows.current.find((item) => item.id === part.id)?.[field]) {
          onPatch(part.id, { [field]: value })
        }
      }}
      onMouseDown={() => {
        navigation.onFocusCell(index, column)
        inputRef.current?.focus()
      }}
      style={{
        backgroundColor: selected ? COLORS.http : background,
        focusedBackgroundColor: background,
        textColor: selected ? COLORS.canvas : COLORS.text,
      }}
    />
  )
}

export function HttpMultipartRow(props: RowProps) {
  const { part, index, draft, navigation, onPatch, onDelete } = props
  const background = index % 2 === 0 ? COLORS.panelAlt : COLORS.panelRaised
  const selected = navigation.active && navigation.mode === "table" && navigation.row === index
  return (
    <box style={{ height: 1, flexShrink: 0, flexDirection: "row", backgroundColor: background }}>
      {draft ? (
        <text content="   " />
      ) : (
        <InlineButton
          id={`http-key-value-enabled-${part.id}`}
          label={part.enabled ? "[●]" : "[○]"}
          accent={COLORS.http}
          active={part.enabled}
          selected={selected && navigation.column === -2}
          onPress={() => onPatch(part.id, { enabled: !part.enabled })}
        />
      )}
      {draft ? (
        <text content="   " />
      ) : (
        <InlineButton
          id={`http-key-value-kind-${part.id}`}
          label={part.kind === "file" ? "[F]" : "[T]"}
          accent={COLORS.http}
          active={part.kind === "file"}
          selected={selected && navigation.column === -1}
          onPress={() => onPatch(part.id, { kind: part.kind === "file" ? "text" : "file" })}
        />
      )}
      <MultipartCell
        {...props}
        column={0}
        background={background}
        selected={selected && navigation.column === 0}
      />
      <MultipartCell
        {...props}
        column={1}
        background={background}
        selected={selected && navigation.column === 1}
      />
      {draft ? null : (
        <InlineButton
          id={`http-key-value-delete-${part.id}`}
          label="[×]"
          accent={COLORS.danger}
          selected={selected && navigation.column === 2}
          onPress={() => onDelete(part.id)}
        />
      )}
    </box>
  )
}
