import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import type { HttpOAuth2Auth } from "../model/oauth2"
import { HttpFormField } from "./HttpRequestForm"

export function HttpOAuth2Fields({
  requestId,
  auth,
  onChange,
}: {
  requestId: string
  auth: HttpOAuth2Auth
  onChange: (auth: HttpOAuth2Auth) => void
}) {
  const field = (
    name:
      | "authorizationUrl"
      | "tokenUrl"
      | "clientId"
      | "clientSecret"
      | "scope"
      | "audience"
      | "redirectUri",
    label: string,
    secret = false,
  ) => (
    <HttpFormField
      key={name}
      id={`http-auth-oauth2-field-${name}-${requestId}`}
      label={label}
      value={auth[name]}
      secret={secret}
      onInput={(value) => onChange({ ...auth, [name]: value })}
    />
  )
  return (
    <>
      <text content={translateUi("FLUXO OAUTH2")} fg={COLORS.muted} />
      <box flexDirection="row" flexWrap="wrap" flexShrink={0} minHeight={1}>
        <InlineButton
          id="http-oauth-client-credentials"
          label="Client Credentials"
          active={auth.grantType === "client_credentials"}
          onPress={() =>
            onChange({
              ...auth,
              grantType: "client_credentials",
              clientAuthentication:
                auth.clientAuthentication === "none" ? "basic" : auth.clientAuthentication,
            })
          }
        />
        <InlineButton
          id="http-oauth-pkce"
          label="Authorization Code + PKCE"
          active={auth.grantType === "authorization_code"}
          onPress={() =>
            onChange({ ...auth, grantType: "authorization_code", clientAuthentication: "none" })
          }
        />
      </box>
      {auth.grantType === "authorization_code"
        ? field("authorizationUrl", "URL DE AUTORIZAÇÃO")
        : null}
      {field("tokenUrl", "URL DO TOKEN")}
      {field("clientId", "CLIENT ID")}
      {field("clientSecret", "CLIENT SECRET", true)}
      <text content={translateUi("AUTENTICAÇÃO DO CLIENTE")} fg={COLORS.muted} />
      <box flexDirection="row" flexWrap="wrap" flexShrink={0} minHeight={1}>
        {(["basic", "body", "none"] as const).map((kind) => (
          <InlineButton
            key={kind}
            id={`http-oauth-client-auth-${kind}`}
            label={{ basic: "Basic", body: "Body", none: "Sem auth" }[kind]}
            active={auth.clientAuthentication === kind}
            onPress={() => onChange({ ...auth, clientAuthentication: kind })}
          />
        ))}
      </box>
      {field("scope", "SCOPE")}
      {field("audience", "AUDIENCE")}
      {auth.grantType === "authorization_code" ? (
        <>
          {field("redirectUri", "URL DE CALLBACK")}
          <text
            content={translateUi("Cadastre esta URL de callback no provedor OAuth2.")}
            fg={COLORS.muted}
          />
        </>
      ) : null}
    </>
  )
}
