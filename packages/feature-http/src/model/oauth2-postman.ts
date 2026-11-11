import { defaultHttpOAuth2, type HttpOAuth2Auth } from "./oauth2"

export function postmanOAuth2(value: unknown): HttpOAuth2Auth | undefined {
  if (!Array.isArray(value)) return
  const values = new Map(
    value.flatMap((row) =>
      row && typeof row.key === "string" && typeof row.value === "string"
        ? [[row.key, row.value] as const]
        : [],
    ),
  )
  const grant = values.get("grant_type")
  if (
    grant !== "client_credentials" &&
    grant !== "authorization_code" &&
    grant !== "authorization_code_with_pkce"
  )
    return
  if (values.get("addTokenTo") && values.get("addTokenTo") !== "header") return
  const authentication = values.get("client_authentication") ?? "header"
  if (!["header", "body", "none"].includes(authentication)) return
  const clientSecret = values.get("clientSecret") ?? ""
  const publicClient = grant !== "client_credentials" && authentication === "body" && !clientSecret
  return {
    ...defaultHttpOAuth2(),
    grantType: grant === "client_credentials" ? grant : "authorization_code",
    authorizationUrl: values.get("authUrl") ?? "",
    tokenUrl: values.get("accessTokenUrl") ?? "",
    clientId: values.get("clientId") ?? "",
    clientSecret,
    clientAuthentication: publicClient
      ? "none"
      : authentication === "header"
        ? "basic"
        : (authentication as "body" | "none"),
    scope: values.get("scope") ?? "",
    audience: values.get("audience") ?? "",
    redirectUri: values.get("redirect_uri") || defaultHttpOAuth2().redirectUri,
  }
}

export function remoteOAuth2(auth: HttpOAuth2Auth) {
  const values = {
    grant_type:
      auth.grantType === "authorization_code" ? "authorization_code_with_pkce" : auth.grantType,
    authUrl: auth.authorizationUrl,
    accessTokenUrl: auth.tokenUrl,
    clientId: auth.clientId,
    clientSecret: auth.clientAuthentication === "none" ? "" : auth.clientSecret,
    client_authentication: auth.clientAuthentication === "basic" ? "header" : "body",
    scope: auth.scope,
    audience: auth.audience,
    redirect_uri: auth.redirectUri,
    addTokenTo: "header",
    challengeAlgorithm: "S256",
  }
  return {
    type: "oauth2",
    oauth2: Object.entries(values).map(([key, value]) => ({ key, value, type: "string" })),
  }
}
