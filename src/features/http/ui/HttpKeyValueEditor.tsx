import type { InputRenderable } from "@opentui/core"
import { useRef } from "react"
import { COLORS } from "../../../core/settings/theme"
import { translateUi } from "../../../shared/i18n/index"
import { InlineButton } from "../../../shared/ui/InlineButton"
import type { HttpKeyValue } from "../model/types"
import { completeHttpKeyValueName, httpHeaderSensitivity } from "../model/key-value"

function newEntry(prefix: string): HttpKeyValue {
  return {
    id: `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    enabled: true,
    name: "",
    value: "",
    sensitivity: "normal",
  }
}

export function HttpKeyValueEditor({
  idPrefix,
  title,
  entries,
  onChange,
  registerFirstInput,
  detectSensitiveNames = false,
  nameSuggestions = [],
  dense = false,
}: {
  idPrefix: string
  title: string
  entries: HttpKeyValue[]
  onChange: (entries: HttpKeyValue[]) => void
  registerFirstInput?: (input: InputRenderable | null) => void
  detectSensitiveNames?: boolean
  nameSuggestions?: readonly string[]
  dense?: boolean
}) {
  const inputs = useRef(new Map<string, InputRenderable>())
  const patchEntry = (id: string, patch: Partial<HttpKeyValue>) =>
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

  return (
    <box style={{ flexGrow: 1, minHeight: dense ? 2 : 3 }}>
      <box style={{ height: 1, flexShrink: 0, flexDirection: "row", alignItems: "center" }}>
        <text content={translateUi(title)} style={{ flexGrow: 1, fg: COLORS.muted }} />
        <InlineButton
          label="[+] Adicionar"
          accent={COLORS.http}
          onPress={() => onChange([...entries, newEntry(idPrefix)])}
        />
      </box>
      {dense ? null : (
        <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
          <text content="   " />
          <text content={translateUi("NOME")} style={{ width: "40%", fg: COLORS.muted }} />
          <text content={translateUi("VALOR")} style={{ flexGrow: 1, fg: COLORS.muted }} />
        </box>
      )}
      <scrollbox scrollY viewportCulling style={{ flexGrow: 1, backgroundColor: COLORS.canvas }}>
        {entries.length ? (
          entries.map((entry, index) => (
            <box key={entry.id} style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
              <InlineButton
                label={entry.enabled ? "[●]" : "[○]"}
                accent={COLORS.http}
                active={entry.enabled}
                onPress={() => patchEntry(entry.id, { enabled: !entry.enabled })}
              />
              <input
                ref={(input) => {
                  if (input) inputs.current.set(`${entry.id}-name`, input)
                  else inputs.current.delete(`${entry.id}-name`)
                  if (index === 0) registerFirstInput?.(input)
                }}
                id={`http-key-value-name-${entry.id}`}
                value={entry.name}
                placeholder={translateUi("NOME")}
                width="35%"
                onInput={(name) => patchEntry(entry.id, { name })}
                onKeyDown={(event) => {
                  if (event.name !== "tab") return
                  const suggestion = completeHttpKeyValueName(entry.name, nameSuggestions)
                  if (!suggestion) return
                  event.preventDefault()
                  event.stopPropagation()
                  patchEntry(entry.id, { name: suggestion })
                }}
                onMouseDown={() => inputs.current.get(`${entry.id}-name`)?.focus()}
                style={{
                  backgroundColor: COLORS.canvas,
                  focusedBackgroundColor: COLORS.panelRaised,
                }}
              />
              <input
                ref={(input) => {
                  if (input) inputs.current.set(`${entry.id}-value`, input)
                  else inputs.current.delete(`${entry.id}-value`)
                }}
                id={`http-key-value-value-${entry.id}`}
                value={entry.value}
                placeholder={translateUi("VALOR")}
                width="42%"
                onInput={(value) => patchEntry(entry.id, { value })}
                onMouseDown={() => inputs.current.get(`${entry.id}-value`)?.focus()}
                style={{
                  backgroundColor: COLORS.canvas,
                  focusedBackgroundColor: COLORS.panelRaised,
                }}
              />
              <InlineButton
                label="[×]"
                accent={COLORS.danger}
                onPress={() => onChange(entries.filter((candidate) => candidate.id !== entry.id))}
              />
            </box>
          ))
        ) : (
          <text content={translateUi("Nenhum item definido.")} style={{ fg: COLORS.muted }} />
        )}
      </scrollbox>
    </box>
  )
}
