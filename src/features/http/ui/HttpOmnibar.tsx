import type { InputRenderable } from "@opentui/core"
import type { RefObject } from "react"
import { COLORS } from "../../../core/settings/theme"
import { translateUi } from "../../../shared/i18n/index"
import { InlineButton } from "../../../shared/ui/InlineButton"
import type { HttpRequestDefinition } from "../model/types"

type HttpOmnibarProps = {
  request: HttpRequestDefinition
  twoRows: boolean
  inputWidth: number
  running: boolean
  urlRef: RefObject<InputRenderable | null>
  onUrlChange: (value: string) => void
  onCycleMethod: (direction: number) => void
  onSend: () => void
  onCancel: () => void
  environmentName: string | null
  productionEnvironment: boolean
  onCycleEnvironment: () => void
}

function EnvironmentAndSend({
  running,
  onSend,
  onCancel,
  environmentName,
  productionEnvironment,
  onCycleEnvironment,
}: Pick<
  HttpOmnibarProps,
  | "running"
  | "onSend"
  | "onCancel"
  | "environmentName"
  | "productionEnvironment"
  | "onCycleEnvironment"
>) {
  return (
    <box style={{ height: 1, flexShrink: 0, flexDirection: "row", alignItems: "center" }}>
      <box style={{ flexGrow: 1 }}>
        <InlineButton
          id="http-environment-button"
          label={environmentName ? `[E] ${environmentName}` : "[E] Sem ambiente"}
          accent={productionEnvironment ? COLORS.danger : COLORS.http}
          active={environmentName !== null}
          onPress={onCycleEnvironment}
        />
      </box>
      <InlineButton
        id="http-send-button"
        label={running ? "[X] Cancelar" : "[S] Enviar"}
        accent={running ? COLORS.warning : COLORS.http}
        onPress={running ? onCancel : onSend}
      />
    </box>
  )
}

export function HttpOmnibar({
  request,
  twoRows,
  inputWidth,
  running,
  urlRef,
  onUrlChange,
  onCycleMethod,
  onSend,
  onCancel,
  environmentName,
  productionEnvironment,
  onCycleEnvironment,
}: HttpOmnibarProps) {
  const address = (
    <>
      <InlineButton
        id="http-method-button"
        label={request.method.padEnd(7)}
        accent={COLORS.http}
        active
        onPress={() => onCycleMethod(1)}
      />
      <input
        ref={urlRef}
        id="http-url-input"
        value={request.url}
        placeholder="http://localhost:3000/api"
        width={inputWidth}
        onInput={onUrlChange}
        onMouseDown={() => urlRef.current?.focus()}
        onSubmit={onSend}
        style={{
          backgroundColor: COLORS.panelRaised,
          focusedBackgroundColor: COLORS.panelRaised,
          textColor: COLORS.text,
          focusedTextColor: COLORS.text,
          cursorColor: COLORS.http,
        }}
      />
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
            onSend={onSend}
            onCancel={onCancel}
            environmentName={environmentName}
            productionEnvironment={productionEnvironment}
            onCycleEnvironment={onCycleEnvironment}
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
            onPress={onCycleEnvironment}
          />
          <InlineButton
            id="http-send-button"
            label={running ? "[X] Cancelar" : "[S] Enviar"}
            accent={running ? COLORS.warning : COLORS.http}
            onPress={running ? onCancel : onSend}
          />
        </box>
      )}
    </box>
  )
}
