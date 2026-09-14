import type { ScrollBoxRenderable } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/react"
import { Button } from "@tuiparts/react/button"
import { useEffect, useMemo, useRef, useState } from "react"
import {
  COLORS,
  focusedPanelBorder,
  LAYOUT,
  panelBorder,
} from "@xupon/tuiminal-core/settings/theme"
import { translateUi, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { PlasmaLoadingOverlay } from "@xupon/tuiminal-core/ui/PlasmaLoadingOverlay"
import { ShortcutText } from "@xupon/tuiminal-core/ui/ShortcutText"
import {
  nextPullRequestDiffMode,
  type PullRequestDiffFocus,
  type PullRequestDiffMode,
  type PullRequestDiffTarget,
  pullRequestDiffHunkOffsets,
} from "../../model/pr/diff"
import type { PullRequestDetails, PullRequestSummary } from "../../model/pr/types"
import type { DiffDocument } from "../../model/view"
import { parseDiffDocuments } from "../../rendering/diff"
import { GitDiffDocument } from "../shared/GitDiffDocument"
import { GitDiffViewport } from "../shared/GitDiffViewport"
import { usePrDiffControls } from "./usePrDiffControls"
import { type PullRequestDiffState, usePullRequestDiff } from "./usePullRequestDiff"

function targetLabel(target: PullRequestDiffTarget) {
  if (target.kind === "commit") return `commit ${target.sha.slice(0, 10)}`
  if (target.kind === "file") return target.path
  return "Pull Request"
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
        ...focusedPanelBorder(focused, COLORS.git),
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

function DiffDocumentPane({
  document,
  mode,
  focused,
  scrollRef,
  onFocus,
}: {
  document: DiffDocument | undefined
  mode: PullRequestDiffMode
  focused: boolean
  scrollRef: React.RefObject<ScrollBoxRenderable | null>
  onFocus: () => void
}) {
  return (
    <box
      style={{
        ...focusedPanelBorder(focused, COLORS.git),
        flexGrow: 1,
        backgroundColor: COLORS.panel,
      }}
    >
      {document ? (
        <GitDiffViewport
          id="git-pr-diff"
          scrollRef={scrollRef}
          focused={focused}
          onFocus={onFocus}
          resetKey={`${mode}:${document.key}`}
        >
          <GitDiffDocument document={document} layout={mode} />
        </GitDiffViewport>
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
  onFocus,
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
  onFocus: () => void
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
          onFocus={onFocus}
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

  useEffect(() => {
    const scrollbox = scrollRef.current
    if (scrollbox) scrollbox.scrollTo({ x: scrollbox.scrollLeft, y: offset })
  }, [offset])
  usePrDiffControls({
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
    scrollRef,
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
            setMode((current) => nextPullRequestDiffMode(current))
            setOffset(0)
          }}
        />
        <text content={` ${translateUi(mode.toUpperCase())}`} style={{ fg: COLORS.text }} />
      </box>
      <box style={{ position: "relative", flexGrow: 1 }}>
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
          onFocus={() => setFocus("document")}
        />
        <PlasmaLoadingOverlay
          active={state.status === "loading"}
          label="CARREGANDO DIFF…"
          accent={COLORS.git}
        />
      </box>
      {state.status === "ready" && state.snapshot.truncated ? (
        <text
          content={`${translateUi("Diff limitado a 2 MiB.")} ${state.snapshot.byteLength} bytes`}
          style={{ fg: COLORS.warning }}
        />
      ) : null}
      <ShortcutText
        content={translateUi(
          "[J/K] Vertical  [Shift+H/L/←/→] Lateral  [[]/[]] Hunk  [H/L] Foco  [V] Modo  [Y] Caminho  [Esc] Voltar",
        )}
        style={{ height: 1, flexShrink: 0, fg: COLORS.muted }}
      />
    </box>
  )
}
