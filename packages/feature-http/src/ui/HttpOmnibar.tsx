import type { InputRenderable } from "@opentui/core"
import type { RefObject } from "react"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import type { HttpRequestDefinition } from "../model/types"

type HttpOmnibarProps = {
  request: HttpRequestDefinition
  focused: boolean
  twoRows: boolean
  running: boolean
  readOnly: boolean
  urlRef: RefObject<InputRenderable | null>
  onFocus: () => void
  onUrlChange: (value: string) => void
  onCycleMethod: (direction: number) => void
  onSend: () => void
  onCancel: () => void
  environmentName: string | null
  productionEnvironment: boolean
  onOpenEnvironment: () => void
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
  onFocus,
  onUrlChange,
  onCycleMethod,
  onSend,
  onCancel,
  environmentName,
  productionEnvironment,
  onOpenEnvironment,
}: HttpOmnibarProps) {
  const address = (
    <>
      <InlineButton
        id="http-method-button"
        label={request.method.padEnd(7)}
        accent={COLORS.http}
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
          onInput={onUrlChange}
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
    // biome-ignore lint/a11y/noStaticElementInteractions: the OpenTUI box is the keyboard focus region for the route and also has focusable child controls.
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
  )
}
