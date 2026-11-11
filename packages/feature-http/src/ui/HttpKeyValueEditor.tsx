import type { InputRenderable, ScrollBoxRenderable } from "@opentui/core"
import { useRef, type RefObject } from "react"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import type { HttpRequestTableNavigation } from "../hooks/use-http-request-tables"
import { httpHeaderSensitivity } from "../model/key-value"
import type { HttpKeyValue } from "../model/types"
import {
  HttpRequestTable,
  REQUEST_TABLE_ACTION_WIDTH,
  useHttpRequestTableColumns,
} from "./HttpRequestTable"

type CellProps = {
  entry: HttpKeyValue
  index: number
  column: 0 | 1
  background: string
  selected: boolean
  navigation: HttpRequestTableNavigation<HttpKeyValue>
  currentRows: RefObject<HttpKeyValue[]>
  onPatch: (id: string, patch: Partial<HttpKeyValue>) => void
  registerFirstInput?: ((input: InputRenderable | null) => void) | undefined
}

function HttpKeyValueCell({
  entry,
  index,
  column,
  background,
  selected,
  navigation,
  currentRows,
  onPatch,
  registerFirstInput,
}: CellProps) {
  const columns = useHttpRequestTableColumns()
  const inputRef = useRef<InputRenderable | null>(null)
  const field = column === 0 ? "name" : "value"
  return (
    <input
      ref={(input) => {
        inputRef.current = input
        if (index === 0 && column === 0) registerFirstInput?.(input)
      }}
      id={`http-key-value-${field}-${entry.id}`}
      value={entry[field]}
      placeholder={translateUi(column === 0 ? "NOME" : "VALOR")}
      onInput={(value) => {
        if (value !== currentRows.current.find((item) => item.id === entry.id)?.[field]) {
          onPatch(entry.id, { [field]: value })
        }
      }}
      onMouseDown={() => {
        navigation.onFocusCell(index, column)
        inputRef.current?.focus()
      }}
      style={{
        width: column === 0 ? columns.name : columns.value,
        flexShrink: 0,
        backgroundColor: selected ? COLORS.http : background,
        focusedBackgroundColor: background,
        textColor: selected
          ? COLORS.canvas
          : !entry.enabled
            ? COLORS.muted
            : column === 0
              ? COLORS.http
              : COLORS.text,
        focusedTextColor: COLORS.text,
      }}
    />
  )
}

function HttpKeyValueRow({
  entry,
  index,
  draft,
  navigation,
  currentRows,
  onPatch,
  onDelete,
  registerFirstInput,
}: {
  entry: HttpKeyValue
  index: number
  draft: boolean
  navigation: HttpRequestTableNavigation<HttpKeyValue>
  currentRows: RefObject<HttpKeyValue[]>
  onPatch: (id: string, patch: Partial<HttpKeyValue>) => void
  onDelete: (id: string) => void
  registerFirstInput?: ((input: InputRenderable | null) => void) | undefined
}) {
  const background = index % 2 === 0 ? COLORS.canvas : COLORS.panelAlt
  const selected = navigation.active && navigation.mode === "table" && navigation.row === index
  return (
    <box
      id={`http-key-value-row-${entry.id}`}
      style={{ height: 1, flexShrink: 0, flexDirection: "row", backgroundColor: background }}
    >
      {draft ? (
        <text content=" +" width={REQUEST_TABLE_ACTION_WIDTH} flexShrink={0} fg={COLORS.muted} />
      ) : (
        <InlineButton
          id={`http-key-value-enabled-${entry.id}`}
          label={entry.enabled ? "[●]" : "[○]"}
          accent={COLORS.http}
          active={entry.enabled}
          selected={selected && navigation.column === -1}
          onPress={() => onPatch(entry.id, { enabled: !entry.enabled })}
        />
      )}
      <HttpKeyValueCell
        entry={entry}
        index={index}
        column={0}
        background={background}
        selected={selected && navigation.column === 0}
        navigation={navigation}
        currentRows={currentRows}
        onPatch={onPatch}
        registerFirstInput={registerFirstInput}
      />
      <text content="│" width={1} flexShrink={0} fg={COLORS.border} />
      <HttpKeyValueCell
        entry={entry}
        index={index}
        column={1}
        background={background}
        selected={selected && navigation.column === 1}
        navigation={navigation}
        currentRows={currentRows}
        onPatch={onPatch}
      />
      {draft ? (
        <text content="" width={REQUEST_TABLE_ACTION_WIDTH} flexShrink={0} />
      ) : (
        <InlineButton
          id={`http-key-value-delete-${entry.id}`}
          label="[×]"
          accent={COLORS.danger}
          selected={selected && navigation.column === 2}
          onPress={() => onDelete(entry.id)}
        />
      )}
    </box>
  )
}

export function HttpKeyValueEditor({
  idPrefix,
  title,
  entries,
  onChange,
  registerFirstInput,
  detectSensitiveNames = false,
  dense = false,
  fillHeight = false,
  navigation,
}: {
  idPrefix: string
  title: string
  entries: HttpKeyValue[]
  onChange: (entries: HttpKeyValue[]) => void
  registerFirstInput?: (input: InputRenderable | null) => void
  detectSensitiveNames?: boolean
  dense?: boolean
  fillHeight?: boolean
  navigation: HttpRequestTableNavigation<HttpKeyValue>
}) {
  const scrollRef = useRef<ScrollBoxRenderable | null>(null)
  const rows =
    navigation.active && navigation.mode !== "block" ? [...entries, navigation.draft] : entries
  // OpenTUI emits onInput when React applies a new controlled value.
  const currentRows = useRef(rows)
  currentRows.current = rows
  const patchEntry = (id: string, patch: Partial<HttpKeyValue>) => {
    if (id === navigation.draft.id) {
      if (patch.name !== undefined) navigation.onDraftInput("name", patch.name)
      else if (patch.value !== undefined) navigation.onDraftInput("value", patch.value)
      return
    }
    onChange(
      entries.map((entry) =>
        entry.id === id
          ? {
              ...entry,
              ...patch,
              ...(detectSensitiveNames && patch.name !== undefined
                ? { sensitivity: httpHeaderSensitivity(patch.name) }
                : {}),
            }
          : entry,
      ),
    )
  }

  return (
    <HttpRequestTable
      idPrefix={idPrefix}
      title={title}
      count={entries.length}
      enabledCount={entries.filter((entry) => entry.enabled).length}
      navigation={navigation}
      scrollRef={scrollRef}
      dense={dense}
      fillHeight={fillHeight}
    >
      {rows.length ? (
        rows.map((entry, index) => (
          <HttpKeyValueRow
            key={entry.id}
            entry={entry}
            index={index}
            draft={entry.id === navigation.draft.id}
            navigation={navigation}
            currentRows={currentRows}
            onPatch={patchEntry}
            onDelete={(id) => onChange(entries.filter((candidate) => candidate.id !== id))}
            registerFirstInput={registerFirstInput}
          />
        ))
      ) : (
        <text content={translateUi("Nenhum item definido.")} style={{ fg: COLORS.muted }} />
      )}
    </HttpRequestTable>
  )
}
