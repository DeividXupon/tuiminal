import { HttpBoxSelection } from "./HttpBoxSelection"
import { useWorkspaceRepaint } from "@xupon/tuiminal-core/ui/workspace-repaint"
import type { InputRenderable, ScrollBoxRenderable } from "@opentui/core"
import { translateUi, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import { COLORS, focusedPanelBorder } from "@xupon/tuiminal-core/settings/theme"
import { useEffect, useRef } from "react"
import {
  httpJsonPathAtLine,
  httpJsonTreeActionForKey,
  updateHttpJsonTree,
} from "../model/json-tree"
import type { HttpDocumentState, HttpResponseView } from "../model/types"
import type { HttpCookie } from "../services/cookies"
import { HttpResponseDocument } from "./HttpResponseDocument"
import { HttpResponseTableDocument } from "./HttpResponseTableDocument"
import { useHttpResponseContent } from "./use-http-response-content"
import { HttpResponseHeader } from "./HttpResponseHeader"
import { HttpResponseState } from "./HttpResponseState"
import { HttpResponseToolbar } from "./HttpResponseToolbar"
import { httpResponseCopyContent } from "./http-response-content"

function responseCopyLabel(document: HttpDocumentState) {
  if (document.responseView === "headers") return "HEADERS"
  if (
    document.responseView === "pretty" &&
    document.execution.status === "success" &&
    document.execution.response.bodyKind === "json" &&
    document.responsePresentation.jsonPath.trim()
  ) {
    return "VALOR JSONPATH"
  }
  if (document.responseView !== "pretty" && document.responseView !== "raw") return "CONTEÚDO"
  return "BODY DA RESPOSTA"
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
  onCancel,
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
  onCancel: () => void
  onCancelDownload: () => void
  downloading: boolean
}) {
  const scrollRef = useRef<ScrollBoxRenderable | null>(null)
  const previousView = useRef("")
  const presentation = document.responsePresentation
  const { response, jsonTree, table, content, matches, activeMatch, matchedLine, stale } =
    useHttpResponseContent(document, cookies, position.width)

  useEffect(() => {
    const key = `${document.responseView}:${presentation.moreView}`
    if (previousView.current === key) return
    previousView.current = key
    scrollRef.current?.scrollTo(0)
  }, [document.responseView, presentation.moreView])

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

  useWorkspaceRepaint(
    JSON.stringify([document.responseView, presentation.moreView, document.execution.status]),
    visible,
  )
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
      focusable
      visible={visible}
      style={{
        position: "absolute",
        ...position,
        ...focusedPanelBorder(focused, COLORS.http),
        backgroundColor: COLORS.panel,
        paddingLeft: 1,
        paddingRight: 1,
        overflow: "hidden",
      }}
    >
      <HttpBoxSelection id={`http-response-pane-${document.request.id}`} />
      <HttpResponseHeader document={document} response={response} onFocus={onFocus} />
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
          onCopy(httpResponseCopyContent(document, cookies), responseCopyLabel(document))
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
          scrollX={table !== null || jsonTree !== null || !presentation.wrap}
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
          {table ? (
            <HttpResponseTableDocument
              document={table}
              id={`http-response-table-${document.request.id}`}
              selectedLine={presentation.searchOpen ? activeMatch?.line : undefined}
            />
          ) : (
            <HttpResponseDocument
              content={content}
              response={response}
              wrap={jsonTree ? false : presentation.wrap}
              jsonTree={jsonTree}
              lineNumbers={presentation.lineNumbers}
              focused={focused}
            />
          )}
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
        <box style={{ flexGrow: 1, backgroundColor: COLORS.canvas }}>
          <HttpResponseState document={document} onCancel={onCancel} />
        </box>
      )}
    </box>
  )
}
