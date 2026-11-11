import { useMemo } from "react"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { createUiSyntaxStyle } from "@xupon/tuiminal-core/ui/syntax-style"
import type { HttpJsonTree } from "../model/json-tree"
import type { HttpResponseSnapshot } from "../model/types"
import { responseFiletype } from "./format"
import { buildHttpJsonDocument } from "./http-json-document"

const RESPONSE_SYNTAX = createUiSyntaxStyle()
const MAX_HIGHLIGHTED_RESPONSE_BYTES = 500_000

function textLineCount(content: string) {
  let lines = 1
  for (let index = 0; index < content.length; index += 1) {
    if (content.charCodeAt(index) === 10) lines += 1
  }
  return lines
}

export function HttpResponseDocument({
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
