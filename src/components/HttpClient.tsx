import {
  RGBA,
  SyntaxStyle,
  type InputRenderable,
  type ScrollBoxRenderable,
  type SelectRenderable,
  type TextareaRenderable,
} from "@opentui/core"
import {
  useKeyboard,
  useRenderer,
  useTerminalDimensions,
} from "@opentui/react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  executeHttpRequest,
  HTTP_METHODS,
  type HttpMethod,
  type HttpRequestDraft,
  type HttpResponseSnapshot,
} from "../http"
import { COLORS } from "../theme"

type RequestSection = "headers" | "body"
type ResponseSection = "body" | "headers"

type HttpHistoryEntry = {
  id: string
  createdAt: number
  request: HttpRequestDraft
  response: HttpResponseSnapshot | null
  error: string | null
}

const HTTP_SYNTAX_STYLE = SyntaxStyle.fromStyles({
  default: { fg: COLORS.text },
  keyword: { fg: "#c792ea", bold: true },
  string: { fg: "#c3e88d" },
  comment: { fg: COLORS.muted, italic: true },
  number: { fg: "#f78c6c" },
  property: { fg: "#80cbc4" },
  constant: { fg: "#f78c6c" },
  punctuation: { fg: "#a6accd" },
  operator: { fg: "#89ddff" },
})

function formatDuration(milliseconds: number) {
  if (milliseconds < 1_000) return `${Math.round(milliseconds)} ms`
  return `${(milliseconds / 1_000).toFixed(2)} s`
}

function formatBytes(bytes: number) {
  if (bytes < 1_024) return `${bytes} B`
  if (bytes < 1_048_576) return `${(bytes / 1_024).toFixed(1)} KB`
  return `${(bytes / 1_048_576).toFixed(1)} MB`
}

function statusColor(status: number) {
  if (status >= 200 && status < 300) return COLORS.success
  if (status >= 300 && status < 400) return COLORS.warning
  return COLORS.danger
}

function responseFiletype(contentType: string) {
  if (contentType.includes("json")) return "json"
  if (contentType.includes("html")) return "html"
  if (contentType.includes("xml")) return "xml"
  if (contentType.includes("javascript")) return "javascript"
  return "text"
}

function errorMessage(error: unknown) {
  if (error instanceof DOMException && error.name === "TimeoutError") {
    return "Tempo limite de 30 segundos excedido."
  }
  if (error instanceof DOMException && error.name === "AbortError") {
    return "Requisição cancelada."
  }
  if (error instanceof Error) return error.message
  return String(error)
}

export function HttpClient({ active }: { active: boolean }) {
  const renderer = useRenderer()
  const terminal = useTerminalDimensions()
  const urlRef = useRef<InputRenderable | null>(null)
  const requestEditorRef = useRef<TextareaRenderable | null>(null)
  const responseScrollRef = useRef<ScrollBoxRenderable | null>(null)
  const historyRef = useRef<SelectRenderable | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const [method, setMethod] = useState<HttpMethod>("GET")
  const [url, setUrl] = useState("")
  const [headersText, setHeadersText] = useState("Accept: application/json")
  const [bodyText, setBodyText] = useState("")
  const [requestSection, setRequestSection] = useState<RequestSection>("headers")
  const [responseSection, setResponseSection] = useState<ResponseSection>("body")
  const [response, setResponse] = useState<HttpResponseSnapshot | null>(null)
  const [requestError, setRequestError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [history, setHistory] = useState<HttpHistoryEntry[]>([])
  const [historyOpen, setHistoryOpen] = useState(false)

  const allowsBody = method !== "GET" && method !== "HEAD"
  const requestPanelWidth = Math.min(
    48,
    Math.max(31, Math.floor(terminal.width * 0.4)),
  )
  const urlWidth = Math.max(16, terminal.width - 36)
  const responseText = responseSection === "headers"
    ? (response?.headers.map(([name, value]) => `${name}: ${value}`).join("\n") ?? "")
    : (response?.body ?? "")
  const responseLineCount = Math.max(1, responseText.split("\n").length)

  const historyOptions = useMemo(
    () => history.map((entry) => ({
      name: `${entry.request.method.padEnd(7)} ${entry.request.url}`,
      description: entry.response
        ? `${entry.response.status} ${entry.response.statusText} · ${formatDuration(entry.response.durationMs)} · ${new Date(entry.createdAt).toLocaleTimeString("pt-BR")}`
        : `${entry.error ?? "Falhou"} · ${new Date(entry.createdAt).toLocaleTimeString("pt-BR")}`,
      value: entry.id,
    })),
    [history],
  )

  const syncCurrentEditor = useCallback(() => {
    const value = requestEditorRef.current?.plainText
    if (value === undefined) return { headersText, bodyText }

    if (requestSection === "headers") {
      setHeadersText(value)
      return { headersText: value, bodyText }
    }

    setBodyText(value)
    return { headersText, bodyText: value }
  }, [bodyText, headersText, requestSection])

  const focusRequestSection = useCallback(
    (section: RequestSection) => {
      syncCurrentEditor()
      setRequestSection(section)
      setTimeout(() => requestEditorRef.current?.focus(), 0)
    },
    [syncCurrentEditor],
  )

  const sendRequest = useCallback(async () => {
    if (loading) return

    const editorValues = syncCurrentEditor()
    const request: HttpRequestDraft = {
      method,
      url: urlRef.current?.plainText ?? url,
      headersText: editorValues.headersText,
      body: editorValues.bodyText,
    }
    const historyId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    const controller = new AbortController()
    abortRef.current = controller
    setLoading(true)
    setRequestError(null)
    responseScrollRef.current?.scrollTo(0)

    try {
      const nextResponse = await executeHttpRequest(request, controller.signal)
      setResponse(nextResponse)
      setResponseSection("body")
      setHistory((current) => [{
        id: historyId,
        createdAt: Date.now(),
        request,
        response: nextResponse,
        error: null,
      }, ...current].slice(0, 30))
    } catch (error) {
      const message = errorMessage(error)
      setResponse(null)
      setRequestError(message)
      setHistory((current) => [{
        id: historyId,
        createdAt: Date.now(),
        request,
        response: null,
        error: message,
      }, ...current].slice(0, 30))
    } finally {
      if (abortRef.current === controller) abortRef.current = null
      setLoading(false)
    }
  }, [loading, method, syncCurrentEditor, url])

  const cycleMethod = useCallback((direction = 1) => {
    setMethod((current) => {
      const currentIndex = HTTP_METHODS.indexOf(current)
      return HTTP_METHODS[
        (currentIndex + direction + HTTP_METHODS.length) % HTTP_METHODS.length
      ] ?? "GET"
    })
  }, [])

  const restoreHistory = useCallback((id: string) => {
    const entry = history.find((item) => item.id === id)
    if (!entry) return

    setMethod(entry.request.method)
    setUrl(entry.request.url)
    setHeadersText(entry.request.headersText)
    setBodyText(entry.request.body)
    setResponse(entry.response)
    setRequestError(entry.error)
    setRequestSection("headers")
    setResponseSection("body")
    setHistoryOpen(false)
  }, [history])

  useEffect(() => {
    if (!active) return
    const timer = setTimeout(() => {
      if (historyOpen) historyRef.current?.focus()
      else urlRef.current?.focus()
    }, 0)
    return () => clearTimeout(timer)
  }, [active, historyOpen])

  useEffect(() => () => abortRef.current?.abort(), [])

  useKeyboard((key) => {
    if (!active) return
    const focusedId = renderer.currentFocusedRenderable?.id

    if (focusedId === "http-url-input") {
      if (key.name === "escape") {
        key.preventDefault()
        urlRef.current?.blur()
        responseScrollRef.current?.focus()
      }
      return
    }

    if (focusedId === "http-request-editor") {
      if (key.name === "escape") {
        key.preventDefault()
        syncCurrentEditor()
        requestEditorRef.current?.blur()
        urlRef.current?.focus()
      }
      return
    }

    if (historyOpen) {
      if (key.name === "escape" || key.name === "y") {
        setHistoryOpen(false)
      }
      return
    }

    if (key.name === "/") {
      key.preventDefault()
      urlRef.current?.focus()
    } else if (key.name === "s") {
      void sendRequest()
    } else if (key.name === "x" && loading) {
      abortRef.current?.abort()
    } else if (key.name === "m") {
      cycleMethod(key.shift ? -1 : 1)
    } else if (key.name === "h") {
      focusRequestSection("headers")
    } else if (key.name === "b") {
      focusRequestSection("body")
    } else if (key.name === "v") {
      setResponseSection((current) => current === "body" ? "headers" : "body")
      responseScrollRef.current?.scrollTo(0)
    } else if (key.name === "y") {
      setHistoryOpen(true)
    }
  })

  return (
    <box
      style={{
        flexGrow: 1,
        backgroundColor: COLORS.canvas,
        padding: 1,
      }}
    >
      <box
        style={{
          height: 3,
          flexShrink: 0,
          flexDirection: "row",
          alignItems: "center",
          border: true,
          borderStyle: "rounded",
          borderColor: active ? COLORS.http : COLORS.border,
          backgroundColor: COLORS.panel,
          paddingLeft: 1,
          paddingRight: 1,
          marginBottom: 1,
        }}
      >
        <text
          content={` ${method.padEnd(7)} `}
          style={{ fg: COLORS.canvas, bg: COLORS.http }}
        />
        <text content=" " />
        <input
          ref={urlRef}
          id="http-url-input"
          value={url}
          placeholder="http://localhost:8000/api"
          onInput={setUrl}
          onSubmit={() => void sendRequest()}
          width={urlWidth}
          style={{
            backgroundColor: COLORS.panelRaised,
            focusedBackgroundColor: COLORS.panelRaised,
            textColor: COLORS.text,
            focusedTextColor: COLORS.text,
            cursorColor: COLORS.http,
          }}
        />
        <text content="  " />
        <text
          content={loading ? "◐ ENVIANDO  [X]" : "▶ ENVIAR  [S]"}
          style={{ fg: loading ? COLORS.warning : COLORS.http }}
        />
      </box>

      {historyOpen ? (
        <box
          style={{
            flexGrow: 1,
            border: true,
            borderStyle: "rounded",
            borderColor: COLORS.http,
            backgroundColor: COLORS.panel,
            paddingLeft: 1,
            paddingRight: 1,
          }}
        >
          <box
            style={{
              height: 1,
              flexShrink: 0,
              flexDirection: "row",
              justifyContent: "space-between",
            }}
          >
            <text
              content="HISTÓRICO HTTP"
              style={{ width: 20, flexShrink: 0, fg: COLORS.http }}
            />
            <text
              content={`${history.length}/30  ·  [Y/ESC] VOLTAR`}
              style={{ width: 26, flexShrink: 0, fg: COLORS.muted }}
            />
          </box>
          {historyOptions.length ? (
            <select
              ref={historyRef}
              id="http-history-list"
              options={historyOptions}
              onSelect={(_index, option) => {
                if (typeof option?.value === "string") restoreHistory(option.value)
              }}
              showDescription
              showScrollIndicator
              wrapSelection
              style={{
                flexGrow: 1,
                backgroundColor: COLORS.panel,
                focusedBackgroundColor: COLORS.panel,
                textColor: COLORS.muted,
                focusedTextColor: COLORS.text,
                selectedBackgroundColor: COLORS.panelRaised,
                selectedTextColor: COLORS.http,
                descriptionColor: COLORS.muted,
                selectedDescriptionColor: COLORS.text,
              }}
            />
          ) : (
            <box style={{ flexGrow: 1, alignItems: "center", justifyContent: "center" }}>
              <text content="Nenhuma requisição nesta sessão." style={{ fg: COLORS.text }} />
              <text content="Envie uma URL para começar o histórico." style={{ fg: COLORS.muted }} />
            </box>
          )}
        </box>
      ) : (
        <box style={{ flexGrow: 1, flexDirection: "row", gap: 1 }}>
          <box
            style={{
              width: requestPanelWidth,
              flexShrink: 0,
              border: true,
              borderStyle: "rounded",
              borderColor: COLORS.border,
              backgroundColor: COLORS.panel,
              paddingLeft: 1,
              paddingRight: 1,
            }}
          >
            <box
              style={{
                height: 1,
                flexShrink: 0,
                flexDirection: "row",
                justifyContent: "space-between",
              }}
            >
              <text content="REQUISIÇÃO" style={{ fg: COLORS.http }} />
              <text content="[M] MÉTODO" style={{ fg: COLORS.muted }} />
            </box>
            <box
              style={{
                height: 1,
                flexShrink: 0,
                flexDirection: "row",
                backgroundColor: COLORS.panelRaised,
                marginBottom: 1,
              }}
            >
              <text
                content=" [H] HEADERS "
                style={{
                  fg: requestSection === "headers" ? COLORS.http : COLORS.muted,
                  bg: requestSection === "headers" ? COLORS.canvas : COLORS.panelRaised,
                }}
              />
              <text
                content=" [B] BODY "
                style={{
                  fg: requestSection === "body" ? COLORS.http : COLORS.muted,
                  bg: requestSection === "body" ? COLORS.canvas : COLORS.panelRaised,
                }}
              />
            </box>
            {requestSection === "body" && !allowsBody ? (
              <box style={{ flexGrow: 1, alignItems: "center", justifyContent: "center" }}>
                <text content={`${method} não envia body.`} style={{ fg: COLORS.warning }} />
                <text content="Troque o método com [M]." style={{ fg: COLORS.muted }} />
              </box>
            ) : (
              <textarea
                key={requestSection}
                ref={requestEditorRef}
                id="http-request-editor"
                initialValue={requestSection === "headers" ? headersText : bodyText}
                placeholder={requestSection === "headers"
                  ? "Authorization: Bearer token\nContent-Type: application/json"
                  : '{\n  "name": "Tuiminal"\n}'}
                onContentChange={() => {
                  const value = requestEditorRef.current?.plainText ?? ""
                  if (requestSection === "headers") setHeadersText(value)
                  else setBodyText(value)
                }}
                onSubmit={() => void sendRequest()}
                style={{
                  flexGrow: 1,
                  backgroundColor: COLORS.canvas,
                  focusedBackgroundColor: COLORS.canvas,
                  textColor: COLORS.text,
                  focusedTextColor: COLORS.text,
                  cursorColor: COLORS.http,
                  selectionBg: RGBA.fromHex("#5a351d"),
                  wrapMode: "word",
                }}
              />
            )}
            <text
              content={requestSection === "headers"
                ? "Uma linha por header · linhas com # são ignoradas"
                : "JSON recebe Content-Type automaticamente"}
              style={{ height: 1, flexShrink: 0, fg: COLORS.muted }}
            />
          </box>

          <box
            style={{
              flexGrow: 1,
              border: true,
              borderStyle: "rounded",
              borderColor: requestError ? COLORS.danger : COLORS.border,
              backgroundColor: COLORS.panel,
              paddingLeft: 1,
              paddingRight: 1,
            }}
          >
            <box style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <text content="RESPOSTA" style={{ fg: COLORS.http }} />
              {response ? (
                <box style={{ flexDirection: "row" }}>
                  <text
                    content={`${response.status} ${response.statusText}`}
                    style={{ fg: statusColor(response.status) }}
                  />
                  <text
                    content={`  ${formatDuration(response.durationMs)}  ${formatBytes(response.size)}`}
                    style={{ fg: COLORS.muted }}
                  />
                </box>
              ) : (
                <text content={loading ? "◐ AGUARDANDO" : "◇ SEM RESPOSTA"} style={{ fg: COLORS.muted }} />
              )}
            </box>
            <box
              style={{
                height: 1,
                flexShrink: 0,
                flexDirection: "row",
                justifyContent: "space-between",
                backgroundColor: COLORS.panelRaised,
                marginBottom: 1,
              }}
            >
              <box style={{ flexDirection: "row" }}>
                <text
                  content=" [V] BODY "
                  style={{
                    fg: responseSection === "body" ? COLORS.http : COLORS.muted,
                    bg: responseSection === "body" ? COLORS.canvas : COLORS.panelRaised,
                  }}
                />
                <text
                  content=" HEADERS "
                  style={{
                    fg: responseSection === "headers" ? COLORS.http : COLORS.muted,
                    bg: responseSection === "headers" ? COLORS.canvas : COLORS.panelRaised,
                  }}
                />
              </box>
              <text
                content={response?.contentType.split(";")[0] ?? ""}
                style={{ fg: COLORS.muted }}
              />
            </box>

            {requestError ? (
              <box style={{ flexGrow: 1, alignItems: "center", justifyContent: "center" }}>
                <text content="× FALHA NA REQUISIÇÃO" style={{ fg: COLORS.danger }} />
                <text content={requestError} style={{ fg: COLORS.text }} />
                <text content="Confira a URL, o servidor e os headers." style={{ fg: COLORS.muted }} />
              </box>
            ) : response ? (
              <scrollbox
                ref={responseScrollRef}
                id="http-response-scroll"
                scrollY
                scrollX
                viewportCulling
                style={{
                  flexGrow: 1,
                  backgroundColor: COLORS.canvas,
                }}
              >
                <code
                  content={responseText || "(resposta vazia)"}
                  filetype={responseSection === "body"
                    ? responseFiletype(response.contentType)
                    : "text"}
                  syntaxStyle={HTTP_SYNTAX_STYLE}
                  bg={COLORS.canvas}
                  wrapMode="none"
                  style={{
                    width: "100%",
                    height: responseLineCount,
                  }}
                />
                {response.truncated ? (
                  <text
                    content="… resposta limitada a 1,5 MB"
                    style={{ fg: COLORS.warning }}
                  />
                ) : null}
              </scrollbox>
            ) : (
              <box style={{ flexGrow: 1, alignItems: "center", justifyContent: "center" }}>
                <text content="Digite uma URL e pressione Enter." style={{ fg: COLORS.text }} />
                <text content="A resposta aparecerá aqui." style={{ fg: COLORS.muted }} />
              </box>
            )}
          </box>
        </box>
      )}

      <box
        style={{
          height: 1,
          flexShrink: 0,
          flexDirection: "row",
          justifyContent: "space-between",
          marginTop: 1,
        }}
      >
        <text content="[/] URL  [S] ENVIAR  [M] MÉTODO  [H/B] EDITAR" style={{ fg: COLORS.muted }} />
        <text content="[V] RESPOSTA  [Y] HISTÓRICO" style={{ fg: COLORS.http }} />
      </box>
    </box>
  )
}
