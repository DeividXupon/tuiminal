import type { InputRenderable, RGBA, ScrollBoxRenderable } from "@opentui/core"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import type { RefObject } from "react"
import {
  FIELD_IDS,
  FIELD_LABELS,
  FIELD_PLACEHOLDERS,
  type FieldId,
  type RemoteProfileDraft,
} from "./terminal-remote-settings"

export function TerminalRemoteProfileForm({
  draft,
  compact,
  dense,
  selectedField,
  editingField,
  highlight,
  scrollRef,
  registerInput,
  onSelectField,
  onChange,
  onSubmitLast,
}: {
  draft: RemoteProfileDraft
  compact: boolean
  dense: boolean
  selectedField: FieldId
  editingField: FieldId | null
  highlight: RGBA
  scrollRef: RefObject<ScrollBoxRenderable | null>
  registerInput: (field: FieldId, input: InputRenderable | null) => void
  onSelectField: (field: FieldId) => void
  onChange: (field: FieldId, value: string) => void
  onSubmitLast: () => void
}) {
  const stacked = compact && !dense
  const labelWidth = stacked ? undefined : 17
  return (
    <scrollbox
      ref={scrollRef}
      id="configuration-terminal-remote-fields"
      scrollY
      style={{ width: "100%", flexGrow: 1, minHeight: 2 }}
      verticalScrollbarOptions={{
        trackOptions: { backgroundColor: COLORS.panel, foregroundColor: COLORS.border },
      }}
    >
      {FIELD_IDS.map((field, index) => (
        <box
          key={field}
          id={`configuration-terminal-remote-field-${field}`}
          style={{
            width: "100%",
            height: stacked ? 2 : 1,
            flexShrink: 0,
            flexDirection: stacked ? "column" : "row",
            paddingLeft: 1,
            paddingRight: 1,
            backgroundColor:
              field === selectedField && editingField === null ? highlight : COLORS.panel,
          }}
        >
          <text
            content={translateUi(FIELD_LABELS[field])}
            style={{
              ...(labelWidth === undefined ? {} : { width: labelWidth, flexShrink: 0 }),
              height: 1,
              fg: field === editingField ? COLORS.terminal : COLORS.text,
            }}
          />
          <input
            id={`configuration-terminal-remote-${field}`}
            ref={(input: InputRenderable | null) => registerInput(field, input)}
            value={draft[field]}
            placeholder={FIELD_PLACEHOLDERS[field]}
            onInput={(value: string) => onChange(field, value)}
            onSubmit={() => {
              const next = FIELD_IDS[index + 1]
              if (next) onSelectField(next)
              else onSubmitLast()
            }}
            onMouseDown={() => onSelectField(field)}
            style={{
              flexGrow: 1,
              ...(stacked ? { width: "100%" as const } : {}),
              backgroundColor: field === editingField ? highlight : COLORS.panel,
              textColor: COLORS.text,
              focusedBackgroundColor: highlight,
              focusedTextColor: COLORS.text,
            }}
          />
        </box>
      ))}
    </scrollbox>
  )
}
