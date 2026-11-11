import { useMemo } from "react"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { getLanguage } from "@xupon/tuiminal-core/i18n/index"
import { httpJsonTreeForDocument } from "../model/json-tree"
import { findHttpTextMatches } from "../model/response"
import type { HttpDocumentState } from "../model/types"
import type { HttpCookie } from "../services/cookies"
import { httpResponseTableData } from "./http-response-table-data"
import {
  buildHttpResponseTableDocument,
  findHttpResponseTableMatches,
} from "./http-response-table-document"
import { httpResponseContent } from "./http-response-content"

function matchedTextLine(content: string, match: { start: number; end: number; column: number }) {
  const start = Math.max(0, match.start - match.column + 1)
  const nextBreak = content.indexOf("\n", match.end)
  return content.slice(start, nextBreak < 0 ? content.length : nextBreak)
}

function renderedResponseContent(
  document: HttpDocumentState,
  cookies: HttpCookie[],
  structured: boolean,
) {
  return structured ? "" : httpResponseContent(document, cookies)
}

export function useHttpResponseContent(
  document: HttpDocumentState,
  cookies: HttpCookie[],
  width: number,
) {
  const response = document.execution.status === "success" ? document.execution.response : null
  const presentation = document.responsePresentation
  const jsonTree = useMemo(() => httpJsonTreeForDocument(document), [document])
  // The structured JSON document owns rendering while its tree is active. Build
  // the separate plain/pretty string only when a view or action actually needs it.
  const bodyDocument =
    document.responseView === "pretty"
      ? document
      : {
          ...document,
          responsePresentation: { ...presentation, lineNumbers: false },
        }
  const bodyContent = renderedResponseContent(bodyDocument, cookies, jsonTree !== null)
  const paletteKey = JSON.stringify(COLORS)
  const language = getLanguage()
  const table = useMemo(() => {
    void paletteKey
    void language
    const data = httpResponseTableData(document, cookies, bodyContent)
    return data ? buildHttpResponseTableDocument(data, width - 5, COLORS) : null
  }, [document, cookies, bodyContent, width, paletteKey, language])
  const content = table?.plain ?? bodyContent
  const matches = useMemo(
    () =>
      table
        ? findHttpResponseTableMatches(table, presentation.searchQuery)
        : findHttpTextMatches(content, presentation.searchQuery),
    [content, table, presentation.searchQuery],
  )
  const stale = response ? response.requestRevision !== document.revision : false
  const activeMatch = matches.length
    ? matches[presentation.searchMatchIndex % matches.length]
    : undefined
  const matchedLine = activeMatch
    ? "copyLine" in activeMatch
      ? String(activeMatch.copyLine)
      : matchedTextLine(content, activeMatch)
    : undefined

  return { response, jsonTree, table, content, matches, activeMatch, matchedLine, stale }
}
