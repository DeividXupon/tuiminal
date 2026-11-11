import { useEffect, useRef } from "react"
import { useKeyboard, useRenderer } from "@opentui/react"
import { InputRenderable, type KeyEvent } from "@opentui/core"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import type {
  HttpCollectionSettingsDocument,
  HttpCollectionSettingsData,
} from "../model/collection-settings"
import { HttpRequestForm } from "./HttpRequestForm"

export function HttpCollectionVariables({
  document,
  active,
  onFocus,
  onChange,
}: {
  document: HttpCollectionSettingsDocument
  active: boolean
  onFocus: () => void
  onChange: (variables: HttpCollectionSettingsData["variables"]) => void
}) {
  const renderer = useRenderer()
  const rows = useRef(document.variables)
  const pendingFocus = useRef<string | null>(null)
  rows.current = document.variables
  useEffect(() => {
    if (!pendingFocus.current || !document.variables.length) return
    const input = renderer.root.findDescendantById(pendingFocus.current)
    if (!input) return
    input.focus()
    pendingFocus.current = null
  }, [document.variables, renderer])
  const add = () => {
    onFocus()
    const id = crypto.randomUUID()
    pendingFocus.current = `http-collection-variable-name-${id}`
    onChange([...rows.current, { id, name: "", value: "", enabled: true }])
  }
  useKeyboard((key) => {
    if (
      !active ||
      key.defaultPrevented ||
      key.ctrl ||
      key.meta ||
      key.option ||
      renderer.currentFocusedRenderable instanceof InputRenderable
    )
      return
    if (key.name !== "n") return
    key.preventDefault()
    key.stopPropagation()
    add()
  })
  const change = (id: string, patch: Partial<HttpCollectionSettingsData["variables"][number]>) => {
    const next = rows.current.map((row) => (row.id === id ? { ...row, ...patch } : row))
    if (JSON.stringify(next) === JSON.stringify(rows.current)) return
    rows.current = next
    onChange(next)
  }
  const move = (key: KeyEvent, index: number, column: number) => {
    if (key.ctrl || !["tab", "return", "enter"].includes(key.name)) return
    key.preventDefault()
    key.stopPropagation()
    const next =
      (index * 2 + column + (key.shift ? -1 : 1) + rows.current.length * 2) %
      (rows.current.length * 2)
    const row = rows.current[Math.floor(next / 2)]
    if (row)
      renderer.root
        .findDescendantById(`http-collection-variable-${next % 2 ? "value" : "name"}-${row.id}`)
        ?.focus()
  }
  return (
    <>
      <InlineButton
        id="http-collection-variable-add"
        label="[N] Nova variável"
        accent={COLORS.http}
        onPress={add}
      />
      <box flexDirection="row" height={1} flexShrink={0} backgroundColor={COLORS.panelRaised}>
        <text content="   " width={3} />
        <text content={translateUi("Variável")} width="40%" fg={COLORS.http} />
        <text content={translateUi("Valor")} flexGrow={1} fg={COLORS.http} />
      </box>
      <HttpRequestForm id={`collection-variables-${document.id}`} onFocus={onFocus}>
        {document.variables.map((row, index) => (
          <box
            key={row.id}
            height={1}
            flexShrink={0}
            flexDirection="row"
            backgroundColor={index % 2 ? COLORS.panelRaised : COLORS.panelAlt}
          >
            <InlineButton
              id={`http-collection-variable-toggle-${row.id}`}
              label={row.enabled ? "☑" : "☐"}
              accent={COLORS.http}
              onPress={() => change(row.id, { enabled: !row.enabled })}
            />
            <input
              id={`http-collection-variable-name-${row.id}`}
              value={row.name}
              placeholder={translateUi("variável")}
              width="40%"
              onInput={(name) => change(row.id, { name })}
              onKeyDown={(key) => move(key, index, 0)}
            />
            <input
              id={`http-collection-variable-value-${row.id}`}
              value={row.value}
              placeholder={translateUi("valor")}
              flexGrow={1}
              onInput={(value) => change(row.id, { value })}
              onKeyDown={(key) => move(key, index, 1)}
            />
            <InlineButton
              id={`http-collection-variable-delete-${row.id}`}
              label="×"
              accent={COLORS.danger}
              onPress={() => onChange(rows.current.filter((item) => item.id !== row.id))}
            />
          </box>
        ))}
      </HttpRequestForm>
    </>
  )
}
