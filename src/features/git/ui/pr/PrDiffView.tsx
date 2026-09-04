import type { ScrollBoxRenderable } from "@opentui/core"
import { useKeyboard, useTerminalDimensions } from "@opentui/react"
import { Button } from "@tuiparts/react/button"
import { useEffect, useMemo, useRef, useState } from "react"
import { COLORS, LAYOUT, panelBorder } from "../../../../core/settings/theme"
import { translateUi, truncateDisplay } from "../../../../shared/i18n"
import { InlineButton } from "../../../../shared/ui/InlineButton"
import { ShortcutText } from "../../../../shared/ui/ShortcutText"
import {
  adjacentPullRequestHunkOffset,
  type PullRequestDiffFocus,
  type PullRequestDiffMode,
  type PullRequestDiffTarget,
  pullRequestDiffHunkOffsets,
  pullRequestDiffKeyboardAction,
} from "../../model/pr/diff"
import type { PullRequestDetails, PullRequestSummary } from "../../model/pr/types"
import type { DiffDocument } from "../../model/view"
import { DIFF_SYNTAX_STYLE } from "../../rendering/constants"
import { documentLineCount, InlineDiffLine, parseDiffDocuments } from "../../rendering/diff"
import { type PullRequestDiffState, usePullRequestDiff } from "./usePullRequestDiff"

function nextMode(mode: PullRequestDiffMode): PullRequestDiffMode {
  return mode === "unified" ? "split" : mode === "split" ? "inline" : "unified"
}

function targetLabel(target: PullRequestDiffTarget) {
  if (target.kind === "commit") return `commit ${target.sha.slice(0, 10)}`
  if (target.kind === "file") return target.path
  return "Pull Request"
}

function applyDiffMove({
  focus,
  delta,
  documentCount,
  setFileIndex,
  setOffset,
}: {
  focus: PullRequestDiffFocus
  delta: -1 | 1
  documentCount: number
  setFileIndex: React.Dispatch<React.SetStateAction<number>>
  setOffset: React.Dispatch<React.SetStateAction<number>>
}) {
  if (focus === "files") {
    setFileIndex((current) => Math.max(0, Math.min(documentCount - 1, current + delta)))
    setOffset(0)
    return
  }
  setOffset((current) => Math.max(0, current + delta))
}

function useDiffControls({
  focus,
  documentCount,
  selectedPath,
  setFocus,
  setFileIndex,
  setMode,
  setOffset,
  hunkOffsets,
  offset,
  onClose,
  onCopy,
}: {
  focus: PullRequestDiffFocus
  documentCount: number
  selectedPath: string | null
  setFocus: (focus: PullRequestDiffFocus) => void
  setFileIndex: React.Dispatch<React.SetStateAction<number>>
  setMode: React.Dispatch<React.SetStateAction<PullRequestDiffMode>>
  setOffset: React.Dispatch<React.SetStateAction<number>>
  hunkOffsets: number[]
  offset: number
  onClose: () => void
  onCopy: (value: string, message: string) => void
}) {
  useKeyboard((key) => {
    const action = pullRequestDiffKeyboardAction(key.name)
    if (!action) return
    key.preventDefault()
    if (action.type === "close") {
      key.stopPropagation()
      onClose()
    } else if (action.type === "toggle-focus") {
      setFocus(focus === "files" ? "document" : "files")
    } else if (action.type === "focus") setFocus(action.target)
    else if (action.type === "cycle-mode") {
      setMode((current) => nextMode(current))
      setOffset(0)
    } else if (action.type === "copy-path" && selectedPath) {
      onCopy(selectedPath, translateUi("Caminho do arquivo copiado."))
    } else if (action.type === "move-hunk") {
      setFocus("document")
      setOffset(adjacentPullRequestHunkOffset(offset, hunkOffsets, action.delta))
    } else if (action.type === "move") {
      applyDiffMove({ focus, delta: action.delta, documentCount, setFileIndex, setOffset })
    }
  })
}

function FilePanel({
  documents,
  selectedIndex,
  width,
  focused,
  onSelect,
}: {
  documents: DiffDocument[]
  selectedIndex: number
  width: number
  focused: boolean
  onSelect: (index: number) => void
}) {
  return (
    <box
      style={{
        ...panelBorder(focused ? COLORS.git : undefined),
        width,
        flexGrow: 0,
        backgroundColor: COLORS.panel,
      }}
    >
      <text content={`${translateUi("ARQUIVOS")} ${documents.length}`} style={{ fg: COLORS.git }} />
      {documents.map((document, index) => (
        <Button key={document.key} height={1} onPress={() => onSelect(index)}>
          <text
            content={`${index === selectedIndex ? "▶" : " "} ${truncateDisplay(document.path, width - 4)}`}
            style={{
              fg: index === selectedIndex ? COLORS.text : COLORS.muted,
              bg: index === selectedIndex ? COLORS.panelRaised : COLORS.panel,
            }}
          />
        </Button>
      ))}
    </box>
  )
}

function DiffDocumentContent({
  document,
  mode,
}: {
  document: DiffDocument
  mode: PullRequestDiffMode
}) {
  if (!document.unifiedLineCount) {
    return (
      <text
        content={translateUi("Arquivo binário, renomeado ou sem patch textual disponível.")}
        style={{ fg: COLORS.warning }}
      />
    )
  }
  if (mode === "inline") {
    return document.inlineRows.map((row) => (
      <InlineDiffLine key={row.key} row={row} filetype={document.filetype} />
    ))
  }
  return (
    <diff
      diff={document.source}
      filetype={document.filetype}
      syntaxStyle={DIFF_SYNTAX_STYLE}
      view={mode === "split" ? "split" : "unified"}
      syncScroll={mode === "split"}
      wrapMode="none"
      showLineNumbers
      lineNumberFg={COLORS.muted}
      lineNumberBg={COLORS.diffGutterBg}
      addedBg={COLORS.diffAddedBg}
      removedBg={COLORS.diffRemovedBg}
      contextBg={COLORS.panel}
      addedSignColor={COLORS.success}
      removedSignColor={COLORS.danger}
      addedLineNumberBg={COLORS.diffAddedBg}
      removedLineNumberBg={COLORS.diffRemovedBg}
      style={{ width: "100%", height: documentLineCount(document, mode), flexShrink: 0 }}
    />
  )
}

function DiffDocumentPane({
  document,
  mode,
  focused,
  scrollRef,
}: {
  document: DiffDocument | undefined
  mode: PullRequestDiffMode
  focused: boolean
  scrollRef: React.RefObject<ScrollBoxRenderable | null>
}) {
  return (
    <box
      style={{
        ...panelBorder(focused ? COLORS.git : undefined),
        flexGrow: 1,
        backgroundColor: COLORS.panel,
      }}
    >
      {document ? (
        <scrollbox
          ref={scrollRef}
          scrollY
          scrollX
          viewportCulling
          style={{ flexGrow: 1, width: "100%" }}
        >
          <text
            content={`◆ ${document.path} · ${document.filetype.toUpperCase()}`}
            style={{ fg: COLORS.git, bg: COLORS.panelRaised }}
          />
          <DiffDocumentContent document={document} mode={mode} />
        </scrollbox>
      ) : (
        <text
          content={translateUi("Nenhum patch disponível para este alvo.")}
          style={{ fg: COLORS.warning }}
        />
      )}
    </box>
  )
}

function DiffBody({
  state,
  documents,
  selectedIndex,
  focus,
  narrow,
  width,
  mode,
  scrollRef,
  onSelect,
}: {
  state: PullRequestDiffState
  documents: DiffDocument[]
  selectedIndex: number
  focus: PullRequestDiffFocus
  narrow: boolean
  width: number
  mode: PullRequestDiffMode
  scrollRef: React.RefObject<ScrollBoxRenderable | null>
  onSelect: (index: number) => void
}) {
  if (state.status === "loading") {
    return <text content={translateUi("CARREGANDO DIFF…")} style={{ fg: COLORS.git }} />
  }
  if (state.status === "error") {
    return (
      <text content={`${translateUi("ERRO")}: ${state.message}`} style={{ fg: COLORS.danger }} />
    )
  }
  return (
    <box style={{ flexGrow: 1, flexDirection: narrow ? "column" : "row", gap: LAYOUT.gap }}>
      {!narrow || focus === "files" ? (
        <FilePanel
          documents={documents}
          selectedIndex={selectedIndex}
          width={narrow ? width : 34}
          focused={focus === "files"}
          onSelect={onSelect}
        />
      ) : null}
      {!narrow || focus === "document" ? (
        <DiffDocumentPane
          document={documents[selectedIndex]}
          mode={mode}
          focused={focus === "document"}
          scrollRef={scrollRef}
        />
      ) : null}
    </box>
  )
}

export function PrDiffView({
  item,
  details,
  target,
  onClose,
  onCopy,
}: {
  item: PullRequestSummary
  details: PullRequestDetails
  target: PullRequestDiffTarget
  onClose: () => void
  onCopy: (value: string, message: string) => void
}) {
  const terminal = useTerminalDimensions()
  const state = usePullRequestDiff(item, details, target)
  const [mode, setMode] = useState<PullRequestDiffMode>("unified")
  const [focus, setFocus] = useState<PullRequestDiffFocus>("files")
  const [fileIndex, setFileIndex] = useState(0)
  const [offset, setOffset] = useState(0)
  const scrollRef = useRef<ScrollBoxRenderable | null>(null)
  const documents = useMemo(() => {
    if (state.status !== "ready") return []
    const parsed = parseDiffDocuments(state.snapshot.source)
    return target.kind === "file"
      ? parsed.filter((document) => document.path === target.path)
      : parsed
  }, [state, target])
  const selectedIndex = Math.min(fileIndex, Math.max(0, documents.length - 1))
  const selectedDocument = documents[selectedIndex]
  const hunkOffsets = useMemo(
    () => (selectedDocument ? pullRequestDiffHunkOffsets(selectedDocument.source, mode) : []),
    [mode, selectedDocument],
  )

  useEffect(() => scrollRef.current?.scrollTo({ x: 0, y: offset }), [offset])
  useDiffControls({
    focus,
    documentCount: documents.length,
    selectedPath: documents[selectedIndex]?.path ?? null,
    setFocus,
    setFileIndex,
    setMode,
    setOffset,
    hunkOffsets,
    offset,
    onClose,
    onCopy,
  })

  const selectFile = (index: number) => {
    setFileIndex(index)
    setOffset(0)
    setFocus("document")
  }
  return (
    <box
      style={{
        flexGrow: 1,
        backgroundColor: COLORS.canvas,
        padding: LAYOUT.outerPadding,
        gap: LAYOUT.gap,
      }}
    >
      <box style={{ ...panelBorder(), height: 2, flexShrink: 0, backgroundColor: COLORS.panel }}>
        <text
          content={`DIFF · ${item.identity.owner}/${item.identity.repository} #${item.identity.number} · ${targetLabel(target)}`}
          style={{ fg: COLORS.git }}
        />
        <text
          content={`${details.baseSha.slice(0, 10)} ← base · head → ${item.headSha.slice(0, 10)}`}
          style={{ fg: COLORS.muted }}
        />
      </box>
      <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
        <InlineButton
          label={translateUi("[V] Unificado / Lado a lado / Intraline")}
          accent={COLORS.git}
          onPress={() => {
            setMode((current) => nextMode(current))
            setOffset(0)
          }}
        />
        <text content={` ${translateUi(mode.toUpperCase())}`} style={{ fg: COLORS.text }} />
      </box>
      <DiffBody
        state={state}
        documents={documents}
        selectedIndex={selectedIndex}
        focus={focus}
        narrow={terminal.width < 82}
        width={terminal.width}
        mode={mode}
        scrollRef={scrollRef}
        onSelect={selectFile}
      />
      {state.status === "ready" && state.snapshot.truncated ? (
        <text
          content={`${translateUi("Diff limitado a 2 MiB.")} ${state.snapshot.byteLength} bytes`}
          style={{ fg: COLORS.warning }}
        />
      ) : null}
      <ShortcutText
        content={translateUi(
          "[J/K] Navegar/rolar  [[/]] Hunk  [H/L] Foco  [V] Modo  [Y] Copiar caminho  [Esc] Voltar",
        )}
        style={{ height: 1, flexShrink: 0, fg: COLORS.muted }}
      />
    </box>
  )
}
