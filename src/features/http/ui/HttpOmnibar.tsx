import type { InputRenderable } from "@opentui/core"
import type { RefObject } from "react"
import { COLORS } from "../../../core/settings/theme"
import { InlineButton } from "../../../shared/ui/InlineButton"
import type { HttpRequestDefinition } from "../model/types"

type HttpOmnibarProps = {
  request: HttpRequestDefinition
  twoRows: boolean
  running: boolean
  readOnly: boolean
  urlRef: RefObject<InputRenderable | null>
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
}: Pick<
  HttpOmnibarProps,
  | "running"
  | "readOnly"
  | "onSend"
  | "onCancel"
  | "environmentName"
  | "productionEnvironment"
  | "onOpenEnvironment"
>) {
  return (
    <box style={{ height: 1, flexShrink: 0, flexDirection: "row", alignItems: "center" }}>
      <box style={{ flexGrow: 1 }}>
        <InlineButton
          id="http-environment-button"
          label={environmentName ? `[E] ${environmentName}` : "[E] Sem ambiente"}
          accent={productionEnvironment ? COLORS.danger : COLORS.http}
          active={environmentName !== null}
          onPress={onOpenEnvironment}
        />
      </box>
      <InlineButton
        id="http-send-button"
        label={running ? "[X] Cancelar" : "[S] Enviar"}
        accent={running ? COLORS.warning : COLORS.http}
        disabled={readOnly && !running}
        onPress={running ? onCancel : onSend}
      />
    </box>
  )
}

export function HttpOmnibar({
  request,
  twoRows,
  running,
  readOnly,
  urlRef,
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
        onPress={() => onCycleMethod(1)}
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
          onMouseDown={() => urlRef.current?.focus()}
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
    <box
      style={{
        height: twoRows ? 2 : 1,
        flexShrink: 0,
        backgroundColor: COLORS.panel,
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
            onPress={onOpenEnvironment}
          />
          <InlineButton
            id="http-send-button"
            label={running ? "[X] Cancelar" : "[S] Enviar"}
            accent={running ? COLORS.warning : COLORS.http}
            disabled={readOnly && !running}
            onPress={running ? onCancel : onSend}
          />
        </box>
      )}
    </box>
  )
}
