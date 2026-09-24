import type { InputRenderable, ScrollBoxRenderable } from "@opentui/core"
import { translateUi, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import { COLORS, focusedPanelBorder } from "@xupon/tuiminal-core/settings/theme"
import { createUiSyntaxStyle } from "@xupon/tuiminal-core/ui/syntax-style"
import { useEffect, useMemo, useRef } from "react"
import {
  type HttpJsonTree,
  httpJsonPathAtLine,
  httpJsonTreeActionForKey,
  httpJsonTreeForDocument,
  updateHttpJsonTree,
} from "../model/json-tree"
import { findHttpTextMatches } from "../model/response"
import type { HttpDocumentState, HttpResponseSnapshot, HttpResponseView } from "../model/types"
import type { HttpCookie } from "../services/cookies"
import { responseFiletype } from "./format"
import { HttpResponseHeader } from "./HttpResponseHeader"
import { HttpResponseState } from "./HttpResponseState"
import { HttpResponseToolbar } from "./HttpResponseToolbar"
import { buildHttpJsonDocument } from "./http-json-document"
import { httpResponseContent } from "./http-response-content"

const RESPONSE_SYNTAX = createUiSyntaxStyle()
const MAX_HIGHLIGHTED_RESPONSE_BYTES = 500_000

function textLineCount(content: string) {
  let lines = 1
  for (let index = 0; index < content.length; index += 1) {
    if (content.charCodeAt(index) === 10) lines += 1
  }
  return lines
}

function matchedTextLine(content: string, match: { start: number; end: number; column: number }) {
  const start = Math.max(0, match.start - match.column + 1)
  const nextBreak = content.indexOf("\n", match.end)
  return content.slice(start, nextBreak < 0 ? content.length : nextBreak)
}

function responseContentForCopy(
  document: HttpDocumentState,
  cookies: HttpCookie[],
  renderedContent: string,
  structured: boolean,
) {
  return structured ? httpResponseContent(document, cookies) : renderedContent
}

function renderedResponseContent(
  document: HttpDocumentState,
  cookies: HttpCookie[],
  structured: boolean,
) {
  return structured ? "" : httpResponseContent(document, cookies)
}

function HttpResponseDocument({
  content,
  response,
  wrap,
  jsonTree,
  lineNumbers,
  focused,
}: {
  content: string
  response: HttpResponseSnapshot
  wrap: boolean
  jsonTree: HttpJsonTree | null
  lineNumbers: boolean
  focused: boolean
}) {
  const paletteKey = [
    COLORS.canvas,
    COLORS.panelAlt,
    COLORS.panelRaised,
    COLORS.text,
    COLORS.muted,
    COLORS.focus,
    COLORS.http,
    COLORS.success,
    COLORS.warning,
  ].join("\u0000")
  const jsonLines = jsonTree?.lines
  const jsonDocument = useMemo(() => {
    void paletteKey
    return jsonLines
      ? buildHttpJsonDocument(
          { lines: jsonLines, selectedPath: "" },
          {
            palette: COLORS,
            lineNumbers,
            focused: false,
            highlightSelection: false,
          },
        )
      : null
  }, [jsonLines, lineNumbers, paletteKey])
  if (jsonDocument && jsonTree) {
    const selectedLine = jsonTree.lines[jsonTree.selectedLine]
    const selectedContent = `${
      lineNumbers
        ? `${String(jsonTree.selectedLine + 1).padStart(String(jsonTree.lines.length).length)} │ `
        : ""
    }${selectedLine?.tokens.map((token) => token.text).join("") ?? ""}`
    return (
      <box style={{ width: "100%", height: Math.max(1, jsonTree.lines.length), flexShrink: 0 }}>
        <text
          id={`http-response-json-${response.requestId}`}
          content={jsonDocument}
          wrapMode={wrap ? "word" : "none"}
          style={{ width: "100%", height: Math.max(1, jsonTree.lines.length), bg: COLORS.canvas }}
        />
        {focused ? (
          <box
            id={`http-response-json-selection-${response.requestId}`}
            style={{
              position: "absolute",
              left: 0,
              top: jsonTree.selectedLine,
              width: "100%",
              height: 1,
              zIndex: 1,
              backgroundColor: COLORS.http,
            }}
          >
            <text
              content={selectedContent}
              wrapMode="none"
              style={{ width: "100%", height: 1, bg: COLORS.http, fg: COLORS.canvas }}
            />
          </box>
        ) : null}
      </box>
    )
  }
  const filetype = responseFiletype(response)
  const height = textLineCount(content)
  const displayedContent = content || translateUi("(resposta vazia)")
  if (filetype === "text" || response.capturedBytes > MAX_HIGHLIGHTED_RESPONSE_BYTES) {
    return (
      <text
        content={displayedContent}
        wrapMode={wrap ? "word" : "none"}
        style={{ width: "100%", height, bg: COLORS.canvas, fg: COLORS.text }}
      />
    )
  }
  return (
    <code
      content={displayedContent}
      filetype={filetype}
      syntaxStyle={RESPONSE_SYNTAX}
      bg={COLORS.canvas}
      wrapMode={wrap ? "word" : "none"}
      style={{ width: "100%", height }}
    />
  )
}

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
  const jsonTree = useMemo(() => httpJsonTreeForDocument(document), [document])
  // The structured JSON document owns rendering while its tree is active. Build
  // the separate plain/pretty string only when a view or action actually needs it.
  const content = renderedResponseContent(document, cookies, jsonTree !== null)
  const matches = useMemo(
    () => findHttpTextMatches(content, presentation.searchQuery),
    [content, presentation.searchQuery],
  )
  const stale = response ? response.requestRevision !== document.revision : false
  const activeMatch = matches.length
    ? matches[presentation.searchMatchIndex % matches.length]
    : undefined
  const matchedLine = activeMatch ? matchedTextLine(content, activeMatch) : undefined
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

  useEffect(() => {
    if (!focused || !jsonTree) return
    const scroll = scrollRef.current
    if (!scroll) return
    if (!presentation.searchOpen && !presentation.jsonPathOpen) scroll.focus()
    const top = scroll.scrollTop
    const rows = Math.max(1, scroll.viewport.height)
    if (jsonTree.selectedLine < top) {
      scroll.scrollTo(Math.max(0, jsonTree.selectedLine - 1))
    } else if (jsonTree.selectedLine >= top + rows) {
      scroll.scrollTo(Math.max(0, jsonTree.selectedLine - rows + 1))
    }
  }, [focused, jsonTree, presentation.searchOpen, presentation.jsonPathOpen])

  const cycleSearch = () => {
    if (!matches.length) return
    onPresentationChange({ searchMatchIndex: (presentation.searchMatchIndex + 1) % matches.length })
  }

  const handleJsonTreeKey = (event: {
    name: string
    preventDefault: () => void
    stopPropagation: () => void
  }) => {
    if (!jsonTree) return
    const action = httpJsonTreeActionForKey(event.name)
    if (!action) return
    event.preventDefault()
    event.stopPropagation()
    const patch = updateHttpJsonTree(document, action, jsonTree)
    if (patch) onPresentationChange(patch)
  }

  return (
    <box
      id={`http-response-pane-${document.request.id}`}
      visible={visible}
      style={{
        position: "absolute",
        ...position,
        ...focusedPanelBorder(focused, COLORS.http),
        backgroundColor: COLORS.panelAlt,
        paddingLeft: 1,
        paddingRight: 1,
        overflow: "hidden",
      }}
    >
      <HttpResponseHeader document={document} response={response} />
      <HttpResponseToolbar
        document={document}
        response={response}
        jsonTreeActive={jsonTree !== null}
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
        onCopy={() =>
          onCopy(responseContentForCopy(document, cookies, content, jsonTree !== null), copyLabel)
        }
        onCopyLine={matchedLine ? () => onCopy(matchedLine, "LINHA") : null}
        onSave={onSave}
        onOpen={onOpen}
        onDownload={onDownload}
        onCancelDownload={onCancelDownload}
        downloading={downloading}
        active={visible && focused}
      />
      {jsonTree ? (
        <text
          content={truncateDisplay(
            `JSON ${(jsonTree.nodeIndexes.get(jsonTree.selectedPath) ?? 0) + 1}/${jsonTree.nodes.length}  ${jsonTree.selectedPath || "/"}`,
            Math.max(1, position.width - 4),
          )}
          style={{ height: 1, flexShrink: 0, fg: COLORS.http, bg: COLORS.panelRaised }}
        />
      ) : null}
      {response ? (
        // biome-ignore lint/a11y/noStaticElementInteractions: the OpenTUI scrollbox is the focusable response viewport and owns structural JSON keyboard/mouse navigation.
        <scrollbox
          ref={(scroll) => {
            scrollRef.current = scroll
            registerScroll(scroll)
          }}
          id={`http-response-scroll-${document.request.id}`}
          scrollY
          scrollX={jsonTree !== null || !presentation.wrap}
          viewportCulling
          onKeyDown={handleJsonTreeKey}
          onMouseDown={(event) => {
            onFocus()
            scrollRef.current?.focus()
            if (!jsonTree || !scrollRef.current) return
            const line = Math.max(
              0,
              Math.floor(scrollRef.current.scrollTop + event.y - scrollRef.current.screenY),
            )
            const jsonSelectedPath = httpJsonPathAtLine(jsonTree, line)
            if (jsonSelectedPath !== null) onPresentationChange({ jsonSelectedPath })
          }}
          style={{ flexGrow: 1, backgroundColor: COLORS.canvas }}
        >
          <HttpResponseDocument
            content={content}
            response={response}
            wrap={jsonTree ? false : presentation.wrap}
            jsonTree={jsonTree}
            lineNumbers={presentation.lineNumbers}
            focused={focused}
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
