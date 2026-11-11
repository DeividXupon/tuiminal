import { httpExtractionIsSecret } from "../model/chain-extractions"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import type { HttpChainExtraction } from "../model/types"
import type { HttpChainingNavigation } from "../hooks/use-http-chaining-navigation"

export function HttpChainingRow({
  requestId,
  item,
  index,
  focused,
  preview,
  navigation: nav,
}: {
  requestId: string
  item: HttpChainExtraction
  index: number
  focused: boolean
  preview: { error: string | null; value: string; message?: string }
  navigation: HttpChainingNavigation
}) {
  const selected = focused && nav.row === index
  const active = (column: number) => selected && nav.column === column
  const source = item.source ?? "jsonpath"
  return (
    <box
      id={`http-extraction-row-${requestId}-${index}`}
      flexShrink={0}
      marginTop={1}
      border={["left"]}
      borderColor={selected ? COLORS.http : COLORS.border}
      paddingLeft={1}
      paddingRight={1}
      backgroundColor={
        selected ? COLORS.diffModifiedBg : index % 2 ? COLORS.panelAlt : COLORS.canvas
      }
    >
      <box flexDirection="row" flexWrap="wrap" minHeight={1} flexShrink={0}>
        <text content={`#${index + 1}`} flexGrow={1} fg={COLORS.muted} />
        <InlineButton
          id={`http-extraction-source-${requestId}-${index}`}
          label={source === "header" ? "Header" : source === "status" ? "Status" : "JSONPath"}
          accent={COLORS.http}
          selected={active(2)}
          onPress={() => {
            nav.select(index, 2)
            nav.cycleSource(index)
          }}
        />
        <InlineButton
          id={`http-extraction-privacy-${requestId}-${index}`}
          label={httpExtractionIsSecret(item) ? "● SECRETO" : "○ PÚBLICO"}
          accent={httpExtractionIsSecret(item) ? COLORS.warning : COLORS.http}
          selected={active(3)}
          onPress={() => {
            nav.select(index, 3)
            nav.patch(index, { secret: !item.secret })
          }}
        />
        <InlineButton
          id={`http-extraction-enabled-${requestId}-${index}`}
          label={item.enabled === false ? "○" : "●"}
          accent={item.enabled === false ? COLORS.muted : COLORS.success}
          selected={active(4)}
          onPress={() => {
            nav.select(index, 4)
            nav.patch(index, { enabled: item.enabled === false })
          }}
        />
        <InlineButton
          id={`http-extraction-delete-${requestId}-${index}`}
          label="[×]"
          accent={COLORS.danger}
          selected={active(5)}
          onPress={() => nav.remove(index)}
        />
      </box>
      <box flexDirection="row" flexShrink={0} gap={1} height={2}>
        <ExtractionField
          column={0}
          requestId={requestId}
          item={item}
          index={index}
          navigation={nav}
          active={active(0)}
        />
        <ExtractionField
          column={1}
          requestId={requestId}
          item={item}
          index={index}
          navigation={nav}
          active={active(1)}
        />
      </box>
      <text
        content={
          preview.error
            ? translateUi(preview.error)
            : `${item.name ? `{{${item.name}}}` : "…"} → ${preview.message ? translateUi(preview.message) : preview.value}`
        }
        fg={preview.error ? COLORS.danger : COLORS.muted}
        wrapMode="none"
        height={1}
      />
    </box>
  )
}

function ExtractionField({
  column,
  item,
  index,
  navigation: nav,
  active,
}: {
  column: 0 | 1
  requestId: string
  item: HttpChainExtraction
  index: number
  navigation: HttpChainingNavigation
  active: boolean
}) {
  const source = item.source ?? "jsonpath"
  const pathLabel =
    source === "header" ? "HEADER DA RESPOSTA" : source === "status" ? "STATUS HTTP" : "JSONPath"
  const placeholder = source === "header" ? "Location" : "$.token"
  return (
    <box width={column ? 0 : "40%"} flexGrow={column ? 1 : 0} minWidth={0}>
      <text
        content={translateUi(column ? pathLabel : "NOME DA VARIÁVEL")}
        height={1}
        fg={active ? COLORS.http : COLORS.muted}
        wrapMode="none"
      />
      {column && source === "status" ? (
        <text content="200, 201, …" fg={COLORS.muted} />
      ) : (
        <input
          id={nav.inputId(index, column)}
          value={column ? item.jsonPath : item.name}
          width="100%"
          placeholder={column ? placeholder : "token"}
          onMouseDown={() => nav.select(index, column, true)}
          onKeyDown={nav.keyDown}
          onInput={(value) => nav.patch(index, column ? { jsonPath: value } : { name: value })}
          style={{
            backgroundColor: active ? COLORS.diffModifiedBg : COLORS.panelAlt,
            focusedBackgroundColor: COLORS.panelRaised,
            textColor: COLORS.text,
            focusedTextColor: COLORS.text,
            cursorColor: COLORS.http,
          }}
        />
      )}
    </box>
  )
}
