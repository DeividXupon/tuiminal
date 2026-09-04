import type { InputRenderable } from "@opentui/core"
import { useRef } from "react"
import { COLORS } from "../../../core/settings/theme"
import { translateUi } from "../../../shared/i18n/index"
import { InlineButton } from "../../../shared/ui/InlineButton"
import type { HttpMultipartPart } from "../model/types"

function newPart(requestId: string): HttpMultipartPart {
  return {
    id: `${requestId}-part-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    enabled: true,
    name: "",
    value: "",
    kind: "text",
    sensitivity: "normal",
  }
}

export function HttpMultipartEditor({
  requestId,
  parts,
  onChange,
}: {
  requestId: string
  parts: HttpMultipartPart[]
  onChange: (parts: HttpMultipartPart[]) => void
}) {
  const inputs = useRef(new Map<string, InputRenderable>())
  const patchPart = (id: string, patch: Partial<HttpMultipartPart>) =>
    onChange(parts.map((part) => (part.id === id ? { ...part, ...patch } : part)))
  return (
    <box style={{ flexGrow: 1 }}>
      <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
        <text content={translateUi("MULTIPART")} style={{ flexGrow: 1, fg: COLORS.muted }} />
        <InlineButton
          label="[+] Adicionar"
          accent={COLORS.http}
          onPress={() => onChange([...parts, newPart(requestId)])}
        />
      </box>
      <scrollbox scrollY viewportCulling style={{ flexGrow: 1, backgroundColor: COLORS.canvas }}>
        {parts.length ? (
          parts.map((part) => (
            <box key={part.id} style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
              <InlineButton
                label={part.enabled ? "[●]" : "[○]"}
                accent={COLORS.http}
                active={part.enabled}
                onPress={() => patchPart(part.id, { enabled: !part.enabled })}
              />
              <InlineButton
                label={part.kind === "file" ? "[F]" : "[T]"}
                accent={COLORS.http}
                active={part.kind === "file"}
                onPress={() => patchPart(part.id, { kind: part.kind === "file" ? "text" : "file" })}
              />
              <input
                ref={(input) => {
                  if (input) inputs.current.set(`${part.id}-name`, input)
                  else inputs.current.delete(`${part.id}-name`)
                }}
                id={`http-key-value-name-${part.id}`}
                value={part.name}
                placeholder={translateUi("NOME")}
                width="28%"
                onInput={(name) => patchPart(part.id, { name })}
                onMouseDown={() => inputs.current.get(`${part.id}-name`)?.focus()}
                style={{
                  backgroundColor: COLORS.canvas,
                  focusedBackgroundColor: COLORS.panelRaised,
                }}
              />
              <input
                ref={(input) => {
                  if (input) inputs.current.set(`${part.id}-value`, input)
                  else inputs.current.delete(`${part.id}-value`)
                }}
                id={`http-key-value-value-${part.id}`}
                value={part.value}
                placeholder={translateUi(part.kind === "file" ? "CAMINHO DO ARQUIVO" : "VALOR")}
                width="42%"
                onInput={(value) => patchPart(part.id, { value })}
                onMouseDown={() => inputs.current.get(`${part.id}-value`)?.focus()}
                style={{
                  backgroundColor: COLORS.canvas,
                  focusedBackgroundColor: COLORS.panelRaised,
                }}
              />
              <InlineButton
                label="[×]"
                accent={COLORS.danger}
                onPress={() => onChange(parts.filter((candidate) => candidate.id !== part.id))}
              />
            </box>
          ))
        ) : (
          <text content={translateUi("Nenhuma parte definida.")} style={{ fg: COLORS.muted }} />
        )}
      </scrollbox>
      <text
        content={translateUi("[T] texto · [F] arquivo relativo ao projeto")}
        style={{ fg: COLORS.muted }}
      />
    </box>
  )
}
