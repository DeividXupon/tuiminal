import type { InputRenderable } from "@opentui/core"
import { useEffect, useRef, useState, type RefObject } from "react"
import { COLORS, LAYOUT } from "@xupon/tuiminal-core/settings/theme"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import type { HttpRequestDefinition } from "../model/types"
import { applyUrlVariableCompletion, urlVariableCompletion } from "../model/url-query"
import { httpMethodColor } from "./http-method-colors"

type HttpOmnibarProps = {
  request: HttpRequestDefinition
  focused: boolean
  twoRows: boolean
  running: boolean
  readOnly: boolean
  urlRef: RefObject<InputRenderable | null>
  completionKeyRef: { current: ((key: HttpCompletionKey) => boolean) | null }
  onFocus: () => void
  onUrlChange: (value: string) => void
  variableNames: readonly string[]
  onCycleMethod: (direction: number) => void
  onSend: () => void
  onCancel: () => void
  environmentName: string | null
  productionEnvironment: boolean
  onOpenEnvironment: () => void
}

export type HttpCompletionKey = {
  name: string
  preventDefault(): void
  stopPropagation(): void
}

function EnvironmentAndSend({
  running,
  readOnly,
  onSend,
  onCancel,
  environmentName,
  productionEnvironment,
  onOpenEnvironment,
  onFocus,
}: Pick<
  HttpOmnibarProps,
  | "running"
  | "readOnly"
  | "onSend"
  | "onCancel"
  | "environmentName"
  | "productionEnvironment"
  | "onOpenEnvironment"
  | "onFocus"
>) {
  return (
    <box style={{ height: 1, flexShrink: 0, flexDirection: "row", alignItems: "center" }}>
      <box style={{ flexGrow: 1 }}>
        <InlineButton
          id="http-environment-button"
          label={environmentName ? `[E] ${environmentName}` : "[E] Sem ambiente"}
          accent={productionEnvironment ? COLORS.danger : COLORS.http}
          active={environmentName !== null}
          onPress={() => {
            onFocus()
            onOpenEnvironment()
          }}
        />
      </box>
      <InlineButton
        id="http-send-button"
        label={running ? "[X] Cancelar" : "[S] Enviar"}
        accent={running ? COLORS.warning : COLORS.http}
        disabled={readOnly && !running}
        onPress={() => {
          onFocus()
          if (running) onCancel()
          else onSend()
        }}
      />
    </box>
  )
}

export function HttpOmnibar({
  request,
  focused,
  twoRows,
  running,
  readOnly,
  urlRef,
  completionKeyRef,
  onFocus,
  onUrlChange,
  variableNames,
  onCycleMethod,
  onSend,
  onCancel,
  environmentName,
  productionEnvironment,
  onOpenEnvironment,
}: HttpOmnibarProps) {
  const [completion, setCompletion] = useState<ReturnType<typeof urlVariableCompletion>>(null)
  const [suggestionIndex, setSuggestionIndex] = useState(0)
  const completionRef = useRef(completion)
  const suggestionIndexRef = useRef(suggestionIndex)
  const completionContextRef = useRef({ focused: false, requestId: "" })
  useEffect(() => {
    const previous = completionContextRef.current
    completionContextRef.current = { focused, requestId: request.id }
    if (!focused) {
      completionRef.current = null
      setCompletion(null)
      return
    }
    if (previous.focused && previous.requestId === request.id) return
    const value = urlRef.current?.value ?? request.url
    const nextCompletion =
      urlVariableCompletion(value, urlRef.current?.cursorOffset ?? value.length, variableNames) ??
      urlVariableCompletion(value, value.length, variableNames)
    completionRef.current = nextCompletion
    suggestionIndexRef.current = 0
    setSuggestionIndex(0)
    setCompletion(nextCompletion)
  })
  const complete = (index: number) => {
    const candidate = completionRef.current
    if (!candidate) return
    const variableName = candidate.suggestions[index]
    if (!variableName) return
    const next = applyUrlVariableCompletion(
      urlRef.current?.value ?? request.url,
      candidate.start,
      candidate.end,
      variableName,
    )
    onUrlChange(next)
    completionRef.current = null
    setCompletion(null)
    setTimeout(() => {
      if (urlRef.current) {
        urlRef.current.focus()
        urlRef.current.cursorOffset = candidate.start + variableName.length + 4
      }
    }, 0)
  }
  completionKeyRef.current = (key) => {
    const candidate = completionRef.current
    if (!candidate || !focused) return false
    if (key.name === "tab") complete(suggestionIndexRef.current)
    else if (key.name === "down" || key.name === "up") {
      suggestionIndexRef.current =
        (suggestionIndexRef.current +
          (key.name === "down" ? 1 : candidate.suggestions.length - 1)) %
        candidate.suggestions.length
      setSuggestionIndex(suggestionIndexRef.current)
    } else if (key.name === "escape") {
      completionRef.current = null
      setCompletion(null)
    } else return false
    key.preventDefault()
    key.stopPropagation()
    return true
  }
  const address = (
    <>
      <InlineButton
        id="http-method-button"
        label={request.method.padEnd(7)}
        accent={httpMethodColor(request.method)}
        active
        disabled={readOnly}
        onPress={() => {
          onFocus()
          onCycleMethod(1)
        }}
      />
      {readOnly ? (
        <text
          id="http-url-read-only"
          content={request.url}
          style={{
            width: 8,
            flexGrow: 1,
            flexShrink: 1,
            minWidth: 8,
            height: 1,
            fg: COLORS.muted,
            bg: COLORS.panelRaised,
          }}
        />
      ) : (
        <input
          ref={urlRef}
          id="http-url-input"
          value={request.url}
          placeholder="http://localhost:3000/api"
          onInput={(value) => {
            onUrlChange(value)
            const nextCompletion =
              urlVariableCompletion(
                value,
                urlRef.current?.cursorOffset ?? value.length,
                variableNames,
              ) ?? urlVariableCompletion(value, value.length, variableNames)
            completionRef.current = nextCompletion
            suggestionIndexRef.current = 0
            setSuggestionIndex(0)
            setCompletion(nextCompletion)
          }}
          onMouseDown={() => {
            onFocus()
            urlRef.current?.focus()
          }}
          onSubmit={() => onSend()}
          style={{
            backgroundColor: COLORS.panelRaised,
            focusedBackgroundColor: COLORS.panelRaised,
            textColor: COLORS.text,
            focusedTextColor: COLORS.text,
            cursorColor: COLORS.http,
            width: 8,
            flexGrow: 1,
            flexShrink: 1,
            minWidth: 8,
          }}
        />
      )}
    </>
  )

  return (
    <>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: the OpenTUI box is the keyboard focus region for the route and also has focusable child controls. */}
      <box
        id="http-url-pane"
        onMouseDown={onFocus}
        style={{
          height: twoRows ? 2 : 1,
          flexShrink: 0,
          backgroundColor: focused ? COLORS.panelRaised : COLORS.panel,
          border: focused ? (["left"] as ["left"]) : false,
          borderColor: COLORS.http,
          paddingLeft: 1,
          paddingRight: 1,
        }}
      >
        {twoRows ? (
          <>
            <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>{address}</box>
            <EnvironmentAndSend
              running={running}
              readOnly={readOnly}
              onSend={onSend}
              onCancel={onCancel}
              environmentName={environmentName}
              productionEnvironment={productionEnvironment}
              onOpenEnvironment={onOpenEnvironment}
              onFocus={onFocus}
            />
          </>
        ) : (
          <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
            {address}
            <InlineButton
              id="http-environment-button"
              label={environmentName ? `[E] ${environmentName}` : "[E] Sem ambiente"}
              accent={productionEnvironment ? COLORS.danger : COLORS.http}
              active={environmentName !== null}
              onPress={() => {
                onFocus()
                onOpenEnvironment()
              }}
            />
            <InlineButton
              id="http-send-button"
              label={running ? "[X] Cancelar" : "[S] Enviar"}
              accent={running ? COLORS.warning : COLORS.http}
              disabled={readOnly && !running}
              onPress={() => {
                onFocus()
                if (running) onCancel()
                else onSend()
              }}
            />
          </box>
        )}
      </box>
      {completion && focused && !readOnly ? (
        <box
          id="http-url-variable-suggestions"
          style={{
            position: "absolute",
            left: LAYOUT.outerPadding + 9,
            top: LAYOUT.outerPadding + 1 + (twoRows ? 2 : 1),
            width: "65%",
            height: Math.min(7, completion.suggestions.length + 3),
            zIndex: 30,
            border: true,
            borderColor: COLORS.http,
            backgroundColor: COLORS.panelRaised,
          }}
        >
          {completion.suggestions.slice(0, 4).map((variableName, index) => (
            <InlineButton
              key={variableName}
              id={`http-url-variable-${variableName}`}
              label={`{{${variableName}}}`}
              accent={COLORS.http}
              active={index === suggestionIndex}
              onPress={() => complete(index)}
            />
          ))}
          <text
            content={translateUi("[↑/↓] Escolher · [Tab] Completar")}
            style={{ fg: COLORS.muted }}
          />
        </box>
      ) : null}
    </>
  )
}
