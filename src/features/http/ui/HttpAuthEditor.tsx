import type { InputRenderable } from "@opentui/core"
import { useRef } from "react"
import { COLORS } from "../../../core/settings/theme"
import { translateUi } from "../../../shared/i18n/index"
import { InlineButton } from "../../../shared/ui/InlineButton"
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
  onChange,
}: {
  requestId: string
  auth: HttpAuth
  onChange: (auth: HttpAuth) => void
}) {
  return (
    <box style={{ flexGrow: 1, paddingTop: 1 }}>
      <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
        <InlineButton
          label="Sem auth"
          accent={COLORS.http}
          active={auth.kind === "none"}
          onPress={() => onChange({ kind: "none" })}
        />
        <InlineButton
          label="Bearer"
          accent={COLORS.http}
          active={auth.kind === "bearer"}
          onPress={() => onChange({ kind: "bearer", token: "" })}
        />
        <InlineButton
          label="Basic"
          accent={COLORS.http}
          active={auth.kind === "basic"}
          onPress={() => onChange({ kind: "basic", username: "", password: "" })}
        />
        <InlineButton
          label="API Key"
          accent={COLORS.http}
          active={auth.kind === "api-key"}
          onPress={() =>
            onChange({ kind: "api-key", placement: "header", name: "X-API-Key", value: "" })
          }
        />
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
