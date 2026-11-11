import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { InputRenderable, TextareaRenderable } from "@opentui/core"
import { useKeyboard, useRenderer } from "@opentui/react"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import type { HttpOAuth2Auth } from "../model/oauth2"
import type { HttpVariableContext } from "../model/types"
import { httpOAuthSession } from "../services/oauth2-session"
import { openOAuthBrowser } from "../services/oauth2-authorization"

export type HttpOAuthContext = { variables: HttpVariableContext; environmentName: string | null }
const empty = {
  pending: false,
  authorized: false,
  expiresAt: null,
  authorizationUrl: "",
  error: "",
}
const subscribeEmpty = () => () => {}
const emptySnapshot = () => empty

export function HttpOAuth2Controls({
  auth,
  context,
  active,
  onFocus,
}: {
  auth: HttpOAuth2Auth
  context: HttpOAuthContext
  active: boolean
  onFocus: () => void
}) {
  const renderer = useRenderer()
  const operation = useRef<AbortController | null>(null)
  const [error, setError] = useState("")
  const { session, invalid } = useMemo(() => {
    try {
      return {
        session: httpOAuthSession(auth, context.variables, undefined, context.environmentName),
        invalid: "",
      }
    } catch (error) {
      return {
        session: null,
        invalid: error instanceof Error ? error.message : "OAuth2: resposta de token inválida.",
      }
    }
  }, [auth, context.variables, context.environmentName])
  const state = useSyncExternalStore(
    session?.subscribe ?? subscribeEmpty,
    session?.snapshot ?? emptySnapshot,
  )
  // biome-ignore lint/correctness/useExhaustiveDependencies: Changing OAuth configuration retires the UI-owned authorization.
  useEffect(() => {
    setError("")
    return () => {
      operation.current?.abort()
      operation.current = null
    }
  }, [session])
  const run = async (mode: "acquire" | "refresh") => {
    onFocus()
    if (operation.current) return
    if (!session) {
      setError(invalid)
      return
    }
    const controller = new AbortController()
    operation.current = controller
    setError("")
    try {
      await session.getToken(mode, controller.signal)
    } catch (error) {
      if (operation.current === controller)
        setError(error instanceof Error ? error.message : "OAuth2: resposta de token inválida.")
    } finally {
      if (operation.current === controller) operation.current = null
    }
  }
  useKeyboard((key) => {
    if (!active || key.defaultPrevented) return
    const input = renderer.currentFocusedRenderable
    if (
      key.name === "escape" &&
      operation.current &&
      !(input instanceof InputRenderable || input instanceof TextareaRenderable)
    ) {
      key.preventDefault()
      key.stopPropagation()
      operation.current.abort()
    } else if (key.ctrl && ["t", "r"].includes(key.name)) {
      key.preventDefault()
      key.stopPropagation()
      if (!state.pending && (key.name === "t" || state.authorized))
        void run(key.name === "t" ? "acquire" : "refresh")
    }
  })
  return (
    <box flexShrink={0}>
      <box flexDirection="row" flexWrap="wrap" minHeight={1} flexShrink={0}>
        <InlineButton
          id="http-oauth-acquire"
          label={state.pending && operation.current ? "[Esc] Cancelar" : "[Ctrl+T] Obter token"}
          disabled={state.pending && !operation.current}
          accent={COLORS.http}
          onPress={() => {
            if (state.pending) operation.current?.abort()
            else void run("acquire")
          }}
        />
        <InlineButton
          id="http-oauth-refresh"
          label="[Ctrl+R] Renovar token"
          disabled={state.pending || !state.authorized}
          accent={COLORS.http}
          onPress={() => void run("refresh")}
        />
        <InlineButton
          id="http-oauth-forget"
          label="Esquecer token"
          disabled={state.pending || !state.authorized}
          onPress={() => {
            session?.forget()
            setError("")
          }}
        />
      </box>
      <text
        content={translateUi(
          state.pending
            ? "OAuth2: aguardando autorização…"
            : state.authorized
              ? "OAuth2: token disponível nesta sessão."
              : "OAuth2: nenhum token nesta sessão.",
        )}
        fg={COLORS.muted}
      />
      {state.expiresAt ? (
        <text
          content={`${translateUi("Expira em")}: ${new Date(state.expiresAt).toISOString()}`}
          fg={COLORS.muted}
        />
      ) : null}
      {state.authorizationUrl ? (
        <>
          <text
            id="http-oauth-authorization-url"
            content={state.authorizationUrl}
            fg={COLORS.text}
          />
          <box flexDirection="row" flexWrap="wrap" flexShrink={0}>
            <InlineButton
              id="http-oauth-browser"
              label="Abrir navegador"
              onPress={() => {
                void openOAuthBrowser(state.authorizationUrl).catch(() =>
                  setError("OAuth2: abra o link de autorização no navegador."),
                )
              }}
            />
            <InlineButton
              id="http-oauth-copy"
              label="Copiar link"
              onPress={() => {
                renderer.copyToClipboardOSC52(state.authorizationUrl)
              }}
            />
          </box>
        </>
      ) : null}
      {error || state.error ? (
        <text content={translateUi(error || state.error)} fg={COLORS.danger} />
      ) : null}
    </box>
  )
}
