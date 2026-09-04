import { SyntaxStyle, type ScrollBoxRenderable } from "@opentui/core"
import { useMemo, useRef, type RefObject } from "react"
import { COLORS, panelBorder } from "../../../core/settings/theme"
import { translateUi } from "../../../shared/i18n/index"
import { InlineButton } from "../../../shared/ui/InlineButton"
import type { HttpDocumentState, HttpResponseView } from "../model/types"
import { responseBodyText } from "../services/response-reader"
import { formatHttpBytes, formatHttpDuration, responseFiletype } from "./format"

const RESPONSE_SYNTAX = SyntaxStyle.fromStyles({
  default: { fg: COLORS.text },
  string: { fg: "#c3e88d" },
  number: { fg: "#f78c6c" },
  property: { fg: "#80cbc4" },
  constant: { fg: "#f78c6c" },
  punctuation: { fg: "#a6accd" },
  keyword: { fg: "#c792ea", bold: true },
})

function statusColor(status: number) {
  if (status >= 200 && status < 300) return COLORS.success
  if (status >= 300 && status < 400) return COLORS.warning
  return COLORS.danger
}

function responseViewLabel(view: HttpResponseView) {
  switch (view) {
    case "pretty":
      return "Pretty"
    case "raw":
      return "Raw"
    case "headers":
      return "Headers"
    case "timing":
      return "Timing"
    case "more":
      return "Mais"
  }
}

function responseContent(document: HttpDocumentState) {
  if (document.execution.status !== "success") return ""
  const response = document.execution.response
  switch (document.responseView) {
    case "pretty":
      return translateUi(responseBodyText(response, true))
    case "raw":
      return translateUi(responseBodyText(response, false))
    case "headers":
      return response.headers.map(([name, value]) => `${name}: ${value}`).join("\n")
    case "timing":
      return [
        `${translateUi("Headers")}   ${formatHttpDuration(response.timings.headersMs)}`,
        `${translateUi("Download")}  ${formatHttpDuration(response.timings.downloadMs)}`,
        `${translateUi("Total")}     ${formatHttpDuration(response.timings.totalMs)}`,
      ].join("\n")
    case "more":
      return [
        `${translateUi("URL final")}  ${response.url}`,
        `${translateUi("Tipo")}       ${response.contentType || translateUi("desconhecido")}`,
        `${translateUi("Capturado")}  ${formatHttpBytes(response.capturedBytes)}`,
        response.declaredBytes === undefined
          ? `${translateUi("Declarado")}   ${translateUi("desconhecido")}`
          : `${translateUi("Declarado")}   ${formatHttpBytes(response.declaredBytes)}`,
      ].join("\n")
  }
}

function HttpResponseContent({
  document,
  content,
  stale,
  scrollRef,
  registerScroll,
}: {
  document: HttpDocumentState
  content: string
  stale: boolean
  scrollRef: RefObject<ScrollBoxRenderable | null>
  registerScroll: (scroll: ScrollBoxRenderable | null) => void
}) {
  const execution = document.execution
  switch (execution.status) {
    case "running":
      return (
        <box style={{ flexGrow: 1, alignItems: "center", justifyContent: "center" }}>
          <text
            content={translateUi("ENVIANDO · AGUARDANDO RESPOSTA")}
            style={{ fg: COLORS.http }}
          />
          <text content={translateUi("[X] Cancelar")} style={{ fg: COLORS.muted }} />
        </box>
      )
    case "error":
      return (
        <box style={{ flexGrow: 1, alignItems: "center", justifyContent: "center" }}>
          <text content={translateUi("× FALHA NA REQUISIÇÃO")} style={{ fg: COLORS.danger }} />
          <text content={translateUi(execution.message)} style={{ fg: COLORS.text }} />
        </box>
      )
    case "cancelled":
      return (
        <box style={{ flexGrow: 1, alignItems: "center", justifyContent: "center" }}>
          <text content={translateUi("REQUISIÇÃO CANCELADA")} style={{ fg: COLORS.warning }} />
        </box>
      )
    case "success":
      return (
        <scrollbox
          ref={(scroll) => {
            scrollRef.current = scroll
            registerScroll(scroll)
          }}
          id={`http-response-scroll-${document.request.id}`}
          scrollY
          scrollX
          viewportCulling
          style={{ flexGrow: 1, backgroundColor: COLORS.canvas }}
        >
          <code
            content={content || translateUi("(resposta vazia)")}
            filetype={responseFiletype(execution.response)}
            syntaxStyle={RESPONSE_SYNTAX}
            bg={COLORS.canvas}
            wrapMode="none"
            style={{ width: "100%", height: Math.max(1, content.split("\n").length) }}
          />
          {stale ? (
            <text
              content={translateUi("RESPOSTA DE UMA REVISÃO ANTERIOR")}
              style={{ fg: COLORS.warning }}
            />
          ) : null}
          {execution.response.truncated ? (
            <text
              content={translateUi("TRUNCADO · limite de captura atingido")}
              style={{ fg: COLORS.warning }}
            />
          ) : null}
        </scrollbox>
      )
    case "idle":
      return (
        <box style={{ flexGrow: 1, alignItems: "center", justifyContent: "center" }}>
          <text content={translateUi("PRONTO PARA ENVIAR")} style={{ fg: COLORS.text }} />
          <text
            content={translateUi("Informe uma URL e use [S] Enviar.")}
            style={{ fg: COLORS.muted }}
          />
        </box>
      )
  }
}

export function HttpResponsePane({
  document,
  visible,
  focused,
  position,
  registerScroll,
  onSelectView,
  onFocus,
}: {
  document: HttpDocumentState
  visible: boolean
  focused: boolean
  position: { left: number; top: number; width: number; height: number }
  registerScroll: (scroll: ScrollBoxRenderable | null) => void
  onSelectView: (view: HttpResponseView) => void
  onFocus: () => void
}) {
  const scrollRef = useRef<ScrollBoxRenderable | null>(null)
  const execution = document.execution
  const response = execution.status === "success" ? execution.response : null
  const content = useMemo(() => responseContent(document), [document])
  const stale = response ? response.requestRevision !== document.revision : false

  return (
    <box
      visible={visible}
      style={{
        position: "absolute",
        ...position,
        ...panelBorder(focused ? COLORS.http : COLORS.border),
        backgroundColor: COLORS.panelAlt,
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
        <text content={translateUi("RESPOSTA")} style={{ fg: COLORS.http }} />
        {response ? (
          <box style={{ flexDirection: "row" }}>
            <text
              content={`${response.status} ${response.statusText}`}
              style={{ fg: statusColor(response.status) }}
            />
            <text
              content={` · ${formatHttpDuration(response.timings.totalMs)} · ${formatHttpBytes(response.capturedBytes)}`}
              style={{ fg: COLORS.muted }}
            />
          </box>
        ) : (
          <text
            content={
              execution.status === "running" ? translateUi("ENVIANDO") : translateUi("SEM RESPOSTA")
            }
            style={{ fg: execution.status === "error" ? COLORS.danger : COLORS.muted }}
          />
        )}
      </box>
      <box
        style={{
          height: 1,
          flexShrink: 0,
          flexDirection: "row",
          backgroundColor: COLORS.panelRaised,
          overflow: "hidden",
        }}
      >
        {(["pretty", "raw", "headers", "timing", "more"] as const).map((view) => (
          <InlineButton
            key={view}
            label={responseViewLabel(view)}
            accent={COLORS.http}
            active={document.responseView === view}
            onPress={() => {
              onFocus()
              onSelectView(view)
              scrollRef.current?.scrollTo(0)
            }}
          />
        ))}
      </box>
      <HttpResponseContent
        document={document}
        content={content}
        stale={stale}
        scrollRef={scrollRef}
        registerScroll={registerScroll}
      />
    </box>
  )
}
