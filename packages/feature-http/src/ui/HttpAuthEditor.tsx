import { HttpOAuth2Fields } from "./HttpOAuth2Fields"
import { HttpOAuth2Controls, type HttpOAuthContext } from "./HttpOAuth2Controls"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { DirectionalButton } from "@xupon/tuiminal-core/ui/DirectionalButton"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { HTTP_AUTH_KINDS, httpAuthForKind, nextHttpAuthKind } from "../model/nested-view-navigation"
import type { HttpAuth } from "../model/types"

import { HttpRequestForm, HttpFormSection, HttpFormField } from "./HttpRequestForm"

export function HttpAuthEditor({
  requestId,
  auth,
  focused,
  onChange,
  onFocus,
  inherited = false,
  unsupported = false,
  onInherit,
  oauthContext,
}: {
  requestId: string
  oauthContext?: HttpOAuthContext | undefined
  inherited?: boolean
  unsupported?: boolean
  onInherit?: (() => void) | undefined
  onFocus: () => void
  auth: HttpAuth
  focused: boolean
  onChange: (auth: HttpAuth) => void
}) {
  const selectKind = (kind: HttpAuth["kind"]) => {
    onFocus()
    if (inherited || unsupported || kind !== auth.kind) onChange(httpAuthForKind(kind))
  }
  return (
    <box style={{ flexGrow: 1 }}>
      <box
        style={{
          minHeight: 1,
          flexShrink: 0,
          flexDirection: "row",
          flexWrap: "wrap",
          backgroundColor: COLORS.panelAlt,
        }}
      >
        {focused ? (
          <DirectionalButton
            id="http-auth-kind-previous"
            direction={-1}
            level="nested"
            accent={COLORS.http}
            onPress={() => selectKind(nextHttpAuthKind(auth.kind, -1))}
          />
        ) : null}
        {onInherit ? (
          <InlineButton
            id="http-auth-kind-inherit"
            label="Herdar autenticação do pai"
            accent={COLORS.http}
            active={inherited}
            onPress={() => {
              onFocus()
              onInherit()
            }}
          />
        ) : null}
        {HTTP_AUTH_KINDS.map((kind) => (
          <InlineButton
            key={kind}
            id={`http-auth-kind-${kind}`}
            label={
              {
                none: "Sem auth",
                bearer: "Bearer",
                basic: "Basic",
                "api-key": "API Key",
                oauth2: "OAuth2",
              }[kind]
            }
            accent={COLORS.http}
            active={!inherited && !unsupported && auth.kind === kind}
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
      <HttpRequestForm id={`auth-${requestId}`} onFocus={onFocus}>
        <HttpFormSection
          first
          title={
            inherited
              ? "Herdar autenticação do pai"
              : auth.kind === "none"
                ? "SEM AUTENTICAÇÃO"
                : "CREDENCIAIS"
          }
          description={
            inherited
              ? "Usa a autenticação da pasta ou coleção pai."
              : {
                  none: "Nenhuma credencial configurada nesta aba.",
                  bearer: "O token será enviado no header Authorization.",
                  basic: "Informe o usuário e a senha desta requisição.",
                  "api-key": "Defina o nome da chave, seu valor e onde enviá-la.",
                  oauth2: "Tokens OAuth2 ficam apenas nesta sessão.",
                }[auth.kind]
          }
        >
          {auth.kind === "oauth2" ? (
            <HttpOAuth2Fields requestId={requestId} auth={auth} onChange={onChange} />
          ) : null}
          {auth.kind === "bearer" ? (
            <HttpFormField
              id={`http-auth-token-${requestId}`}
              label="TOKEN"
              secret
              value={auth.token}
              placeholder="{{token}}"
              onInput={(token) => onChange({ ...auth, token })}
            />
          ) : null}
          {auth.kind === "basic" ? (
            <>
              <HttpFormField
                id={`http-auth-username-${requestId}`}
                label="USUÁRIO"
                value={auth.username}
                onInput={(username) => onChange({ ...auth, username })}
              />
              <HttpFormField
                id={`http-auth-password-${requestId}`}
                label="SENHA"
                secret
                value={auth.password}
                onInput={(password) => onChange({ ...auth, password })}
              />
            </>
          ) : null}
          {auth.kind === "api-key" ? (
            <>
              <HttpFormField
                id={`http-auth-key-name-${requestId}`}
                label="NOME"
                value={auth.name}
                placeholder="X-API-Key"
                onInput={(name) => onChange({ ...auth, name })}
              />
              <HttpFormField
                id={`http-auth-key-value-${requestId}`}
                label="VALOR"
                secret
                value={auth.value}
                placeholder="{{apiKey}}"
                onInput={(value) => onChange({ ...auth, value })}
              />
              <text content={translateUi("ENVIAR EM")} fg={COLORS.muted} />
              <box minHeight={1} flexShrink={0} flexDirection="row" flexWrap="wrap">
                <InlineButton
                  id="http-auth-placement-header"
                  label="Header"
                  active={auth.placement === "header"}
                  accent={COLORS.http}
                  onPress={() => onChange({ ...auth, placement: "header" })}
                />
                <InlineButton
                  id="http-auth-placement-query"
                  label="Query"
                  active={auth.placement === "query"}
                  accent={COLORS.http}
                  onPress={() => onChange({ ...auth, placement: "query" })}
                />
              </box>
            </>
          ) : null}
        </HttpFormSection>
        {auth.kind !== "none" ? (
          <text
            content={translateUi("Use {{token}} para reutilizar valores do ambiente.")}
            fg={COLORS.muted}
            marginTop={1}
          />
        ) : null}
      </HttpRequestForm>
      {auth.kind === "oauth2" && oauthContext ? (
        <HttpOAuth2Controls auth={auth} context={oauthContext} active={focused} onFocus={onFocus} />
      ) : null}
    </box>
  )
}
