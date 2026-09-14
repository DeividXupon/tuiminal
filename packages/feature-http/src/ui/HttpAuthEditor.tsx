import type { InputRenderable } from "@opentui/core"
import { useRef } from "react"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { DirectionalButton } from "@xupon/tuiminal-core/ui/DirectionalButton"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { HTTP_AUTH_KINDS, httpAuthForKind, nextHttpAuthKind } from "../model/nested-view-navigation"
import type { HttpAuth } from "../model/types"

function AuthInput({
  id,
  label,
  value,
  onInput,
}: {
  id: string
  label: string
  value: string
  onInput: (value: string) => void
}) {
  const ref = useRef<InputRenderable | null>(null)
  return (
    <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
      <text content={translateUi(label)} style={{ width: 12, flexShrink: 0, fg: COLORS.muted }} />
      <input
        ref={ref}
        id={id}
        value={value}
        width="70%"
        onInput={onInput}
        onMouseDown={() => ref.current?.focus()}
        style={{ backgroundColor: COLORS.canvas, focusedBackgroundColor: COLORS.panelRaised }}
      />
    </box>
  )
}

export function HttpAuthEditor({
  requestId,
  auth,
  focused,
  onChange,
}: {
  requestId: string
  auth: HttpAuth
  focused: boolean
  onChange: (auth: HttpAuth) => void
}) {
  const selectKind = (kind: HttpAuth["kind"]) => onChange(httpAuthForKind(kind))
  return (
    <box style={{ flexGrow: 1, paddingTop: 1 }}>
      <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
        {focused ? (
          <DirectionalButton
            id="http-auth-kind-previous"
            direction={-1}
            level="nested"
            accent={COLORS.http}
            onPress={() => selectKind(nextHttpAuthKind(auth.kind, -1))}
          />
        ) : null}
        {HTTP_AUTH_KINDS.map((kind) => (
          <InlineButton
            key={kind}
            label={
              { none: "Sem auth", bearer: "Bearer", basic: "Basic", "api-key": "API Key" }[kind]
            }
            accent={COLORS.http}
            active={auth.kind === kind}
            onPress={() => selectKind(kind)}
          />
        ))}
        {focused ? (
          <DirectionalButton
            id="http-auth-kind-next"
            direction={1}
            level="nested"
            accent={COLORS.http}
            onPress={() => selectKind(nextHttpAuthKind(auth.kind, 1))}
          />
        ) : null}
      </box>
      {auth.kind === "none" ? (
        <text
          content={translateUi("Nenhuma autenticação configurada.")}
          style={{ fg: COLORS.muted }}
        />
      ) : null}
      {auth.kind === "bearer" ? (
        <AuthInput
          id={`http-auth-token-${requestId}`}
          label="TOKEN"
          value={auth.token}
          onInput={(token) => onChange({ ...auth, token })}
        />
      ) : null}
      {auth.kind === "basic" ? (
        <>
          <AuthInput
            id={`http-auth-username-${requestId}`}
            label="USUÁRIO"
            value={auth.username}
            onInput={(username) => onChange({ ...auth, username })}
          />
          <AuthInput
            id={`http-auth-password-${requestId}`}
            label="SENHA"
            value={auth.password}
            onInput={(password) => onChange({ ...auth, password })}
          />
        </>
      ) : null}
      {auth.kind === "api-key" ? (
        <>
          <AuthInput
            id={`http-auth-key-name-${requestId}`}
            label="NOME"
            value={auth.name}
            onInput={(name) => onChange({ ...auth, name })}
          />
          <AuthInput
            id={`http-auth-key-value-${requestId}`}
            label="VALOR"
            value={auth.value}
            onInput={(value) => onChange({ ...auth, value })}
          />
          <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
            <text content={translateUi("ENVIAR EM")} style={{ width: 12, fg: COLORS.muted }} />
            <InlineButton
              label="Header"
              accent={COLORS.http}
              active={auth.placement === "header"}
              onPress={() => onChange({ ...auth, placement: "header" })}
            />
            <InlineButton
              label="Query"
              accent={COLORS.http}
              active={auth.placement === "query"}
              onPress={() => onChange({ ...auth, placement: "query" })}
            />
          </box>
        </>
      ) : null}
      {auth.kind === "none" ? null : (
        <text
          content={translateUi("Credenciais permanecem somente na memória da sessão.")}
          style={{ fg: COLORS.warning }}
        />
      )}
    </box>
  )
}
