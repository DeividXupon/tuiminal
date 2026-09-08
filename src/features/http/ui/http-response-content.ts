import { translateUi } from "../../../shared/i18n/index"
import { evaluateHttpJsonPath, foldHttpJson, withHttpLineNumbers } from "../model/response"
import type { HttpDocumentState } from "../model/types"
import type { HttpCookie } from "../services/cookies"
import { responseBodyText } from "../services/response-reader"
import { formatHttpBytes, formatHttpDuration } from "./format"

const MAX_HTTP_DISPLAY_CHARACTERS = 50_000

function limitedBodyContent(content: string) {
  if (content.length <= MAX_HTTP_DISPLAY_CHARACTERS) return content
  return `${content.slice(0, MAX_HTTP_DISPLAY_CHARACTERS)}\n\n${translateUi("EXIBIÇÃO LIMITADA · use Salvar para preservar todo o conteúdo capturado")}`
}

function jsonPathContent(source: string, path: string) {
  if (!path.trim()) return source
  try {
    const value = evaluateHttpJsonPath(source, path)
    if (value === undefined) return translateUi("JSONPath não encontrou um valor.")
    return typeof value === "string" ? value : JSON.stringify(value, null, 2)
  } catch (error) {
    return `${translateUi("JSONPath inválido")}: ${error instanceof Error ? error.message : String(error)}`
  }
}

function bodyContent(document: HttpDocumentState) {
  if (document.execution.status !== "success") return ""
  const response = document.execution.response
  const presentation = document.responsePresentation
  const prettyJson = document.responseView === "pretty" && response.bodyKind === "json"
  const explicitJsonInspection = presentation.jsonPath.trim() || presentation.foldDepth !== null
  const limitDefaultView =
    response.capturedBytes > MAX_HTTP_DISPLAY_CHARACTERS && !explicitJsonInspection
  let content = responseBodyText(response, !limitDefaultView && document.responseView === "pretty")
  if (prettyJson && !limitDefaultView) {
    if (presentation.jsonPath.trim()) {
      content = jsonPathContent(responseBodyText(response, false), presentation.jsonPath)
    }
    if (presentation.foldDepth !== null) content = foldHttpJson(content, presentation.foldDepth)
  }
  content = limitedBodyContent(content)
  return presentation.lineNumbers ? withHttpLineNumbers(content) : content
}

function maskedCookieLine(cookie: HttpCookie) {
  const flags = [
    cookie.domain,
    cookie.path,
    cookie.secure ? "Secure" : "",
    cookie.httpOnly ? "HttpOnly" : "",
    cookie.sameSite ? `SameSite=${cookie.sameSite}` : "",
  ].filter(Boolean)
  return `${cookie.name}=${translateUi("<mascarado>")} · ${flags.join(" · ")}`
}

function moreContent(document: HttpDocumentState, cookies: HttpCookie[]) {
  if (document.execution.status !== "success") return ""
  const response = document.execution.response
  if (document.responsePresentation.moreView === "cookies") {
    return cookies.length
      ? cookies.map(maskedCookieLine).join("\n")
      : translateUi("Nenhum cookie ativo neste ambiente.")
  }
  if (document.responsePresentation.moreView === "redirects") {
    return response.redirects.length
      ? response.redirects
          .map(
            (hop, index) =>
              `${index + 1}. ${hop.status} ${hop.url}\n   → ${hop.location}${hop.crossOrigin ? ` · ${translateUi("outra origem")}` : ""}`,
          )
          .join("\n")
      : translateUi("Nenhum redirect seguido.")
  }
  if (document.responsePresentation.moreView === "assertions") {
    return response.assertions?.length
      ? response.assertions
          .map(
            (assertion) =>
              `${assertion.passed ? "✓" : "×"} ${assertion.expression}${
                assertion.passed
                  ? ""
                  : `\n  ${translateUi(assertion.message)} ${translateUi("Atual")}: ${translateUi(assertion.actual)}`
              }`,
          )
          .join("\n")
      : translateUi("Nenhuma assertion definida para este request.")
  }
  if (document.responsePresentation.moreView === "console") {
    return translateUi("Nenhum diagnóstico adicional nesta execução.")
  }
  return [
    `${translateUi("URL final")}       ${response.url}`,
    `${translateUi("Tipo")}            ${response.contentType || translateUi("desconhecido")}`,
    `${translateUi("Encoding")}        ${response.encoding}`,
    `${translateUi("Capturado")}       ${formatHttpBytes(response.capturedBytes)}`,
    `${translateUi("Baixado conhecido")} ${formatHttpBytes(response.downloadedBytes ?? response.capturedBytes)}`,
    response.declaredBytes === undefined
      ? `${translateUi("Declarado")}       ${translateUi("desconhecido")}`
      : `${translateUi("Declarado")}       ${formatHttpBytes(response.declaredBytes)}`,
    `${translateUi("Truncado")}        ${translateUi(response.truncated ? "sim" : "não")}`,
  ].join("\n")
}

export function httpResponseContent(document: HttpDocumentState, cookies: HttpCookie[]) {
  if (document.execution.status !== "success") return ""
  const response = document.execution.response
  if (document.responseView === "pretty" || document.responseView === "raw") {
    return bodyContent(document)
  }
  if (document.responseView === "headers") {
    const content = response.headers.map(([name, value]) => `${name}: ${value}`).join("\n")
    return document.responsePresentation.lineNumbers ? withHttpLineNumbers(content) : content
  }
  if (document.responseView === "timing") {
    return [
      `${translateUi("Até headers")}  ${formatHttpDuration(response.timings.headersMs)}`,
      `${translateUi("Download")}     ${formatHttpDuration(response.timings.downloadMs)}`,
      `${translateUi("Total")}        ${formatHttpDuration(response.timings.totalMs)}`,
      translateUi("DNS/TCP/TLS indisponível neste transporte."),
    ].join("\n")
  }
  return moreContent(document, cookies)
}
