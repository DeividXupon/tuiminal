import { SyntaxStyle, type InputRenderable, type ScrollBoxRenderable } from "@opentui/core"
import { useEffect, useMemo, useRef } from "react"
import { COLORS, panelBorder } from "../../../core/settings/theme"
import { translateUi } from "../../../shared/i18n/index"
import { findHttpTextMatches } from "../model/response"
import type { HttpDocumentState, HttpResponseView } from "../model/types"
import type { HttpCookie } from "../services/cookies"
import { responseFiletype } from "./format"
import { httpResponseContent } from "./http-response-content"
import { HttpResponseState } from "./HttpResponseState"
import { HttpResponseToolbar } from "./HttpResponseToolbar"
import { HttpResponseHeader } from "./HttpResponseHeader"

const RESPONSE_SYNTAX = SyntaxStyle.fromStyles({
  default: { fg: COLORS.text },
  string: { fg: "#c3e88d" },
  number: { fg: "#f78c6c" },
  property: { fg: "#80cbc4" },
  constant: { fg: "#f78c6c" },
  punctuation: { fg: "#a6accd" },
  keyword: { fg: "#c792ea", bold: true },
})

export function HttpResponsePane({
  document,
  visible,
  focused,
  position,
  cookies,
  registerScroll,
  registerSearchInput,
  onSelectView,
  onPresentationChange,
  onFocus,
  onCopy,
  onSave,
  onOpen,
  onDownload,
  onCancelDownload,
  downloading,
}: {
  document: HttpDocumentState
  visible: boolean
  focused: boolean
  position: { left: number; top: number; width: number; height: number }
  cookies: HttpCookie[]
  registerScroll: (scroll: ScrollBoxRenderable | null) => void
  registerSearchInput: (input: InputRenderable | null) => void
  onSelectView: (view: HttpResponseView) => void
  onPresentationChange: (patch: Partial<HttpDocumentState["responsePresentation"]>) => void
  onFocus: () => void
  onCopy: (content: string, label: string) => void
  onSave: () => void
  onOpen: () => void
  onDownload: () => void
  onCancelDownload: () => void
  downloading: boolean
}) {
  const scrollRef = useRef<ScrollBoxRenderable | null>(null)
  const response = document.execution.status === "success" ? document.execution.response : null
  const presentation = document.responsePresentation
  const content = useMemo(() => httpResponseContent(document, cookies), [cookies, document])
  const matches = useMemo(
    () => findHttpTextMatches(content, presentation.searchQuery),
    [content, presentation.searchQuery],
  )
  const stale = response ? response.requestRevision !== document.revision : false
  const activeMatch = matches.length
    ? matches[presentation.searchMatchIndex % matches.length]
    : undefined
  const matchedLine = activeMatch ? content.split("\n")[activeMatch.line - 1] : undefined
  const copyLabel =
    document.responseView === "headers"
      ? "HEADERS"
      : presentation.jsonPath.trim()
        ? "VALOR JSONPATH"
        : "BODY DA RESPOSTA"

  useEffect(() => {
    if (!presentation.searchOpen || !matches.length) return
    const index = presentation.searchMatchIndex % matches.length
    scrollRef.current?.scrollTo(Math.max(0, (matches[index]?.line ?? 1) - 1))
  }, [matches, presentation.searchMatchIndex, presentation.searchOpen])

  const cycleSearch = () => {
    if (!matches.length) return
    onPresentationChange({ searchMatchIndex: (presentation.searchMatchIndex + 1) % matches.length })
  }

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
      <HttpResponseHeader document={document} response={response} />
      <HttpResponseToolbar
        document={document}
        response={response}
        cookies={cookies}
        matches={matches.length}
        registerSearchInput={registerSearchInput}
        onSelectView={(view) => {
          onSelectView(view)
          scrollRef.current?.scrollTo(0)
        }}
        onChange={onPresentationChange}
        onSearchNext={cycleSearch}
        onFocus={onFocus}
        onCopy={() => onCopy(content, copyLabel)}
        onCopyLine={matchedLine ? () => onCopy(matchedLine, "LINHA") : null}
        onSave={onSave}
        onOpen={onOpen}
        onDownload={onDownload}
        onCancelDownload={onCancelDownload}
        downloading={downloading}
        active={visible && focused}
      />
      {response ? (
        <scrollbox
          ref={(scroll) => {
            scrollRef.current = scroll
            registerScroll(scroll)
          }}
          id={`http-response-scroll-${document.request.id}`}
          scrollY
          scrollX={!presentation.wrap}
          viewportCulling
          style={{ flexGrow: 1, backgroundColor: COLORS.canvas }}
        >
          <code
            content={content || translateUi("(resposta vazia)")}
            filetype={responseFiletype(response)}
            syntaxStyle={RESPONSE_SYNTAX}
            bg={COLORS.canvas}
            wrapMode={presentation.wrap ? "word" : "none"}
            style={{ width: "100%", height: Math.max(1, content.split("\n").length) }}
          />
          {stale ? (
            <text
              content={translateUi("RESPOSTA DE UMA REVISÃO ANTERIOR")}
              style={{ fg: COLORS.warning }}
            />
          ) : null}
          {response.truncated ? (
            <text
              content={translateUi("TRUNCADO · limite de captura atingido")}
              style={{ fg: COLORS.warning }}
            />
          ) : null}
        </scrollbox>
      ) : (
        <HttpResponseState document={document} />
      )}
    </box>
  )
}
