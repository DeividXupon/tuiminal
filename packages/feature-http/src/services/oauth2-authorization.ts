import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { createHash, randomBytes, timingSafeEqual } from "node:crypto"
import { createServer } from "node:http"
import { spawn } from "node:child_process"
import type { HttpOAuth2Auth } from "../model/oauth2"
import { exchangeOAuthToken, oauthEndpoint } from "./oauth2-endpoints"

export function oauthAuthorizationUrl(auth: HttpOAuth2Auth, state: string, verifier: string) {
  const url = oauthEndpoint(auth.authorizationUrl)
  const values = {
    response_type: "code",
    client_id: auth.clientId,
    redirect_uri: auth.redirectUri,
    scope: auth.scope,
    state,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
  }
  for (const [name, value] of Object.entries(values)) url.searchParams.set(name, value)
  if (auth.audience) url.searchParams.set("audience", auth.audience)
  return url.toString()
}

/** A one-use loopback listener. Invalid state never consumes the pending login. */
export async function authorizeOAuth2(
  auth: HttpOAuth2Auth,
  onReady: (url: string) => void,
  signal: AbortSignal,
) {
  const redirect = oauthEndpoint(auth.redirectUri)
  if (
    redirect.protocol !== "http:" ||
    !["127.0.0.1", "[::1]"].includes(redirect.hostname) ||
    redirect.search ||
    redirect.port === "0"
  )
    throw new Error("OAuth2: callback deve usar HTTP de loopback sem query.")
  signal.throwIfAborted()
  const state = randomBytes(32).toString("base64url")
  const verifier = randomBytes(32).toString("base64url")
  let timer: ReturnType<typeof setTimeout> | undefined
  let abort: (() => void) | undefined
  const server = createServer()
  try {
    const code = await new Promise<string>((resolve, reject) => {
      let accepted = false
      abort = () => reject(new Error("OAuth2: operação cancelada."))
      signal.addEventListener("abort", abort, { once: true })
      timer = setTimeout(
        () => reject(new Error("OAuth2: autorização expirou. Tente novamente.")),
        180_000,
      )
      server.on("error", () =>
        reject(new Error("OAuth2: não foi possível abrir o callback local.")),
      )
      server.on("request", (request, response) => {
        response.setHeader("cache-control", "no-store")
        response.setHeader("content-type", "text/plain; charset=utf-8")
        response.setHeader("referrer-policy", "no-referrer")
        response.setHeader("content-security-policy", "default-src 'none'")
        let url: URL
        try {
          url = new URL(request.url ?? "/", redirect.origin)
        } catch {
          response.writeHead(400).end(translateUi("OAuth2: callback inválido."))
          return
        }
        const received = Buffer.from(url.searchParams.get("state") ?? "")
        const expected = Buffer.from(state)
        if (
          accepted ||
          request.method !== "GET" ||
          request.headers.host !== redirect.host ||
          url.pathname !== redirect.pathname ||
          url.searchParams.getAll("state").length !== 1 ||
          received.length !== expected.length ||
          !timingSafeEqual(received, expected)
        ) {
          response.writeHead(400).end(translateUi("OAuth2: callback inválido."))
          return
        }
        accepted = true
        const code = url.searchParams.get("code")
        if (
          url.searchParams.has("error") ||
          !code ||
          code.length > 8192 ||
          url.searchParams.getAll("code").length !== 1
        ) {
          response.writeHead(400).end(translateUi("OAuth2: autorização recusada."))
          reject(new Error("OAuth2: autorização recusada."))
          return
        }
        response.end(translateUi("Autorização recebida. Volte ao Tuiminal."))
        resolve(code)
      })
      server.listen(Number(redirect.port || 80), redirect.hostname.replace(/^\[|\]$/g, ""), () => {
        if (signal.aborted) return abort?.()
        try {
          onReady(oauthAuthorizationUrl(auth, state, verifier))
        } catch (error) {
          reject(error)
        }
      })
    })
    signal.throwIfAborted()
    return await exchangeOAuthToken(
      auth,
      {
        grant_type: "authorization_code",
        code,
        redirect_uri: auth.redirectUri,
        code_verifier: verifier,
      },
      signal,
    )
  } finally {
    clearTimeout(timer)
    if (abort) signal.removeEventListener("abort", abort)
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
}

export async function openOAuthBrowser(value: string) {
  const url = oauthEndpoint(value).toString()
  const command: [string, ...string[]] =
    process.platform === "darwin"
      ? ["open", url]
      : process.platform === "win32"
        ? ["rundll32.exe", "url.dll,FileProtocolHandler", url]
        : ["xdg-open", url]
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command[0], command.slice(1), { shell: false, stdio: "ignore" })
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error("OAuth2: abra o link de autorização no navegador."))
    }, 10_000)
    child.on("error", () => {
      clearTimeout(timer)
      reject(new Error("OAuth2: abra o link de autorização no navegador."))
    })
    child.on("exit", (code) => {
      clearTimeout(timer)
      if (code === 0) resolve()
      else reject(new Error("OAuth2: abra o link de autorização no navegador."))
    })
  })
}
