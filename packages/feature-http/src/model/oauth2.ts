/** OAuth configuration is serializable; issued tokens never belong to a request. */
export type HttpOAuth2Auth = {
  kind: "oauth2"
  grantType: "client_credentials" | "authorization_code"
  authorizationUrl: string
  tokenUrl: string
  clientId: string
  clientSecret: string
  clientAuthentication: "basic" | "body" | "none"
  scope: string
  audience: string
  redirectUri: string
}

export function defaultHttpOAuth2(): HttpOAuth2Auth {
  return {
    kind: "oauth2",
    grantType: "client_credentials",
    authorizationUrl: "",
    tokenUrl: "",
    clientId: "",
    clientSecret: "",
    clientAuthentication: "basic",
    scope: "",
    audience: "",
    redirectUri: "http://127.0.0.1:53682/oauth/callback",
  }
}

export function parseHttpOAuth2(value: Record<string, unknown>): HttpOAuth2Auth | undefined {
  if (value.kind !== "oauth2") return undefined
  if (!["client_credentials", "authorization_code"].includes(String(value.grantType))) return
  if (!["basic", "body", "none"].includes(String(value.clientAuthentication))) return
  const defaults = defaultHttpOAuth2()
  for (const field of [
    "authorizationUrl",
    "tokenUrl",
    "clientId",
    "clientSecret",
    "scope",
    "audience",
    "redirectUri",
  ] as const) {
    if (typeof value[field] !== "string") return
    defaults[field] = value[field]
  }
  return {
    ...defaults,
    grantType: value.grantType as HttpOAuth2Auth["grantType"],
    clientAuthentication: value.clientAuthentication as HttpOAuth2Auth["clientAuthentication"],
  }
}

export function oauthPreviewAuth<Auth extends { kind: string }>(
  auth: Auth,
): Auth | { kind: "bearer"; token: string } {
  return auth.kind === "oauth2" ? { kind: "bearer", token: "<OAuth2>" } : auth
}
