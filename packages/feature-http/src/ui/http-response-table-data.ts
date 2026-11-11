import { translateUi as t } from "@xupon/tuiminal-core/i18n/index"
import type { HttpDocumentState, HttpResponseSnapshot } from "../model/types"
import type { HttpCookie } from "../services/cookies"
import { formatHttpBytes, formatHttpDuration } from "./format"
import type { HttpResponseTable, HttpTableCell, HttpTableTone } from "./http-response-table-types"

const cell = (text: string, tone: HttpTableTone = "text"): HttpTableCell => ({ text, tone })
const property = (name: string, value: string, tone: HttpTableTone = "text") => [
  cell(t(name), "http"),
  cell(value, tone),
]
const statusTone = (status: number): HttpTableTone =>
  status >= 400 ? "danger" : status >= 300 ? "warning" : "success"
const fields = (rows: HttpTableCell[][]): HttpResponseTable => ({
  columns: [t("CAMPO"), t("VALOR")],
  rows,
  weights: [1, 2],
})

function timingTable(response: HttpResponseSnapshot): HttpResponseTable {
  const { headersMs, downloadMs, totalMs } = response.timings
  const percent = (duration: number) =>
    totalMs > 0 ? `${Math.round((duration / totalMs) * 100)}%` : "—"
  return {
    columns: [t("FASE"), t("DURAÇÃO"), t("DO TOTAL")],
    weights: [2, 1, 1],
    rows: [
      [
        cell(t("Até headers"), "http"),
        cell(formatHttpDuration(headersMs), "warning"),
        cell(percent(headersMs), "focus"),
      ],
      [
        cell(t("Download"), "http"),
        cell(formatHttpDuration(downloadMs), "warning"),
        cell(percent(downloadMs), "success"),
      ],
      [
        cell(t("Total"), "http"),
        cell(formatHttpDuration(totalMs), "success"),
        cell(totalMs > 0 ? "100%" : "—", "success"),
      ],
    ],
    note: t("DNS/TCP/TLS indisponível neste transporte."),
  }
}

function cookieTable(cookies: HttpCookie[]): HttpResponseTable {
  return {
    columns: [t("NOME"), t("VALOR"), t("ESCOPO E ATRIBUTOS")],
    weights: [1, 1, 2],
    rows: cookies.map((cookie) => [
      cell(cookie.name, "http"),
      cell(t("<mascarado>"), "warning"),
      cell(
        [
          `${t("Domínio")}: ${cookie.domain}`,
          `${t("Caminho")}: ${cookie.path}`,
          `Secure: ${t(cookie.secure ? "sim" : "não")} · HttpOnly: ${t(cookie.httpOnly ? "sim" : "não")}`,
          `HostOnly: ${t(cookie.hostOnly ? "sim" : "não")} · SameSite: ${cookie.sameSite ?? "—"}`,
          `${t("Expira")}: ${cookie.expiresAt === undefined ? t("Sessão") : new Date(cookie.expiresAt).toISOString()}`,
        ].join("\n"),
        "focus",
      ),
    ]),
    empty: t("Nenhum cookie ativo neste ambiente."),
  }
}

function summaryTable(response: HttpResponseSnapshot): HttpResponseTable {
  return fields([
    property("STATUS", `${response.status} ${response.statusText}`, statusTone(response.status)),
    property("URL final", response.url, "focus"),
    property("Tipo", response.contentType || t("desconhecido"), "success"),
    property("Encoding", response.encoding, "muted"),
    property("Capturado", formatHttpBytes(response.capturedBytes), "warning"),
    property(
      "Baixado conhecido",
      formatHttpBytes(response.downloadedBytes ?? response.capturedBytes),
      "warning",
    ),
    property(
      "Declarado",
      response.declaredBytes === undefined
        ? t("desconhecido")
        : formatHttpBytes(response.declaredBytes),
      "warning",
    ),
    property(
      "Truncado",
      t(response.truncated ? "sim" : "não"),
      response.truncated ? "danger" : "success",
    ),
  ])
}

function consoleTable(
  document: HttpDocumentState,
  response: HttpResponseSnapshot,
): HttpResponseTable {
  const rows = [
    [
      cell("HTTP", "focus"),
      cell(t("STATUS"), "http"),
      cell(`${response.status} ${response.statusText}`, statusTone(response.status)),
    ],
  ]
  if (response.truncated)
    rows.push([
      cell(t("AVISO"), "warning"),
      cell(t("Capturado"), "http"),
      cell(t("TRUNCADO · limite de captura atingido"), "warning"),
    ])
  if (response.requestRevision !== document.revision)
    rows.push([
      cell(t("AVISO"), "warning"),
      cell(t("RESPOSTA"), "http"),
      cell(t("RESPOSTA DE UMA REVISÃO ANTERIOR"), "warning"),
    ])
  for (const assertion of response.assertions ?? []) {
    if (!assertion.passed)
      rows.push([
        cell(t("FALHA"), "danger"),
        cell(assertion.expression, "http"),
        cell(`${t(assertion.message)}\n${t("Atual")}: ${assertion.actual}`, "danger"),
      ])
  }
  return {
    columns: [t("NÍVEL"), t("ORIGEM"), t("DIAGNÓSTICO")],
    rows,
    weights: [1, 1, 3],
    ...(rows.length === 1 ? { note: t("Nenhum diagnóstico adicional nesta execução.") } : {}),
  }
}

export function httpResponseTableData(
  document: HttpDocumentState,
  cookies: HttpCookie[],
  body = "",
): HttpResponseTable | null {
  if (document.execution.status !== "success") return null
  const response = document.execution.response
  if (document.responseView === "pretty" && response.bodyKind === "json") return null
  if (document.responseView === "raw" || document.responseView === "pretty") {
    if (response.bodyKind === "binary") return summaryTable(response)
    return {
      columns: [t("LINHA"), t("CONTEÚDO")],
      weights: [0, 1],
      rows: (body || t("(resposta vazia)"))
        .split("\n")
        .map((line, index) => [cell(String(index + 1), "muted"), cell(line, "focus")]),
    }
  }
  if (document.responseView === "headers")
    return {
      columns: [t("NOME"), t("VALOR")],
      weights: [1, 2],
      rows: response.headers.map(([name, value]) => [
        cell(name, "http"),
        cell(value, name.toLowerCase() === "content-type" ? "success" : "text"),
      ]),
      empty: t("Nenhum header na resposta."),
    }
  if (document.responseView === "timing") return timingTable(response)
  switch (document.responsePresentation.moreView) {
    case "cookies":
      return cookieTable(cookies)
    case "redirects":
      return {
        columns: [t("STATUS"), t("ORIGEM"), t("DESTINO")],
        weights: [1, 2, 2],
        rows: response.redirects.map((hop) => [
          cell(`${hop.status}${hop.crossOrigin ? `\n${t("outra origem")}` : ""}`, "warning"),
          cell(hop.url, "focus"),
          cell(hop.location, hop.crossOrigin ? "warning" : "success"),
        ]),
        empty: t("Nenhum redirect seguido."),
      }
    case "assertions":
      return {
        columns: [t("RESULTADO"), t("EXPRESSÃO"), t("ATUAL / DETALHE")],
        weights: [1, 2, 2],
        rows: (response.assertions ?? []).map((assertion) => [
          cell(
            t(assertion.passed ? "✓ PASSOU" : "× FALHOU"),
            assertion.passed ? "success" : "danger",
          ),
          cell(assertion.expression, "http"),
          cell(
            `${assertion.actual}${assertion.passed ? "" : `\n${t(assertion.message)}`}`,
            assertion.passed ? "success" : "warning",
          ),
        ]),
        empty: t("Nenhuma assertion definida para este request."),
      }
    case "console":
      return consoleTable(document, response)
    default:
      return summaryTable(response)
  }
}
