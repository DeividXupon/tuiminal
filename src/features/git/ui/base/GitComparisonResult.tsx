import type { ScrollBoxRenderable, SelectRenderable } from "@opentui/core"
import { useKeyboard, useRenderer } from "@opentui/react"
import { useEffect, useMemo, useRef, useState } from "react"
import { COLORS, panelBorder } from "../../../../core/settings/theme"
import { translateUi } from "../../../../shared/i18n"
import { PlasmaLoadingOverlay } from "../../../../shared/ui/PlasmaLoadingOverlay"
import type { GitBranchComparison } from "../../model/branch-comparison"
import type { DiffLayout } from "../../model/view"
import { documentLineCount, fitLine, parseDiffDocuments } from "../../rendering/diff"
import {
  createPathTreeOptions,
  FILE_OPTION_PREFIX,
  FOLDER_OPTION_PREFIX,
  fileOptionValue,
} from "../../rendering/file-tree"
import {
  type ComparisonDocumentSelection,
  GitComparisonContent,
  GitComparisonToolbar,
} from "./GitComparisonDiffPane"

function useDocumentSelection(
  comparison: GitBranchComparison | null,
  active: boolean,
  fileListRef: React.RefObject<SelectRenderable | null>,
): ComparisonDocumentSelection {
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [selectedTreeValue, setSelectedTreeValue] = useState<string | null>(null)
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(() => new Set())
  const documents = useMemo(() => parseDiffDocuments(comparison?.patch ?? ""), [comparison?.patch])
  const paths = useMemo(() => documents.map((document) => document.path), [documents])
  const fileOptions = useMemo(
    () => createPathTreeOptions(paths, collapsedFolders),
    [collapsedFolders, paths],
  )
  const selectedDocument =
    documents.find((document) => document.path === selectedPath) ?? documents[0] ?? null
  const selectedTreeIndex = Math.max(
    0,
    fileOptions.findIndex(
      (option) =>
        option.value === selectedTreeValue ||
        (selectedDocument !== null && option.value === fileOptionValue(selectedDocument.path)),
    ),
  )

  useEffect(() => {
    const selectedStillExists = documents.some((document) => document.path === selectedPath)
    const nextPath = selectedStillExists ? selectedPath : (documents[0]?.path ?? null)
    setSelectedPath(nextPath)
    setSelectedTreeValue(nextPath ? fileOptionValue(nextPath) : null)
    if (!active || !nextPath) return
    const timeout = setTimeout(() => fileListRef.current?.focus(), 0)
    return () => clearTimeout(timeout)
  }, [active, documents, fileListRef, selectedPath])

  const selectFile = (value: string) => {
    setSelectedTreeValue(value)
    if (value.startsWith(FILE_OPTION_PREFIX)) {
      setSelectedPath(value.slice(FILE_OPTION_PREFIX.length))
    }
  }
  const toggleFolder = (value: string) => {
    if (!value.startsWith(FOLDER_OPTION_PREFIX)) return
    const folder = value.slice(FOLDER_OPTION_PREFIX.length)
    setCollapsedFolders((current) => {
      const next = new Set(current)
      if (next.has(folder)) next.delete(folder)
      else next.add(folder)
      return next
    })
  }

  return { documents, fileOptions, selectedDocument, selectedTreeIndex, selectFile, toggleFolder }
}

type NavigationAction =
  | "toggle-pane"
  | "focus-tree"
  | "focus-diff"
  | "file-next"
  | "file-previous"
  | "scroll-down"
  | "scroll-up"

function navigationAction(keyName: string, fileTreeFocused: boolean): NavigationAction | null {
  if (keyName === "tab") return "toggle-pane"
  if (fileTreeFocused && (keyName === "l" || keyName === "right")) return "focus-diff"
  if (!fileTreeFocused && (keyName === "h" || keyName === "left")) return "focus-tree"
  if (fileTreeFocused && keyName === "j") return "file-next"
  if (fileTreeFocused && keyName === "k") return "file-previous"
  if (keyName === "j" || keyName === "down") return "scroll-down"
  if (keyName === "k" || keyName === "up") return "scroll-up"
  return null
}

function paneForDiffFocus(focusDiff: boolean): "files" | "diff" {
  return focusDiff ? "diff" : "files"
}

function ComparisonBody({
  comparison,
  loading,
  error,
  selection,
  layout,
  terminalWidth,
  fileListRef,
  scrollRef,
  focusedPane,
  onFocusPane,
}: {
  comparison: GitBranchComparison | null
  loading: boolean
  error: string
  selection: ComparisonDocumentSelection
  layout: DiffLayout
  terminalWidth: number
  fileListRef: React.RefObject<SelectRenderable | null>
  scrollRef: React.RefObject<ScrollBoxRenderable | null>
  focusedPane: "files" | "diff"
  onFocusPane: (pane: "files" | "diff") => void
}) {
  if (loading)
    return <text content={translateUi("◷ COMPARANDO BRANCHES…")} style={{ fg: COLORS.git }} />
  if (error) return <text content={error} style={{ fg: COLORS.danger }} />
  if (comparison?.patch && selection.documents.length) {
    return (
      <GitComparisonContent
        selection={selection}
        layout={layout}
        narrow={terminalWidth < 82}
        terminalWidth={terminalWidth}
        fileListRef={fileListRef}
        scrollRef={scrollRef}
        focusedPane={focusedPane}
        onFocusPane={onFocusPane}
      />
    )
  }
  return (
    <box style={{ flexGrow: 1, alignItems: "center", justifyContent: "center" }}>
      <text
        content={translateUi("✓ As branches não possuem diferenças.")}
        style={{ fg: COLORS.success }}
      />
    </box>
  )
}

export function GitComparisonResult({
  active,
  comparison,
  loading,
  error,
  baseName,
  comparedName,
  layout,
  onLayout,
  terminalHeight,
  terminalWidth,
}: {
  active: boolean
  comparison: GitBranchComparison | null
  loading: boolean
  error: string
  baseName: string
  comparedName: string
  layout: DiffLayout
  onLayout: (layout: DiffLayout) => void
  terminalHeight: number
  terminalWidth: number
}) {
  const renderer = useRenderer()
  const fileListRef = useRef<SelectRenderable | null>(null)
  const scrollRef = useRef<ScrollBoxRenderable | null>(null)
  const [offset, setOffset] = useState(0)
  const [focusedPane, setFocusedPane] = useState<"files" | "diff">("files")
  const selection = useDocumentSelection(comparison, active, fileListRef)
  const rowCount = selection.selectedDocument
    ? documentLineCount(selection.selectedDocument, layout) + 1
    : 0
  const maxOffset = Math.max(0, rowCount - Math.max(4, terminalHeight - 18))

  useEffect(() => {
    void baseName
    void comparedName
    void layout
    void selection.selectedDocument?.path
    setOffset(0)
  }, [baseName, comparedName, layout, selection.selectedDocument?.path])
  useEffect(() => scrollRef.current?.scrollTo({ x: 0, y: offset }), [offset])
  useEffect(() => {
    if (active && selection.documents.length) setFocusedPane("files")
  }, [active, selection.documents])

  useKeyboard((key) => {
    if (!active || key.ctrl || key.meta || key.super) return
    const fileTreeFocused = renderer.currentFocusedRenderable?.id === "git-compare-file-list"
    const action = navigationAction(key.name, fileTreeFocused)
    if (!action) return
    key.preventDefault()
    if (action === "toggle-pane" || action === "focus-tree" || action === "focus-diff") {
      key.stopPropagation()
      const focusDiff = action === "focus-diff" || (action === "toggle-pane" && fileTreeFocused)
      setFocusedPane(paneForDiffFocus(focusDiff))
      setTimeout(() => {
        if (focusDiff) scrollRef.current?.focus()
        else fileListRef.current?.focus()
      }, 0)
    } else if (action === "file-next") fileListRef.current?.moveDown(1)
    else if (action === "file-previous") fileListRef.current?.moveUp(1)
    else {
      const delta = action === "scroll-down" ? 3 : -3
      setOffset((current) => Math.max(0, Math.min(maxOffset, current + delta)))
    }
  })

  return (
    <box
      style={{
        ...panelBorder(),
        position: "relative",
        flexGrow: 1,
        backgroundColor: COLORS.panel,
        minHeight: 7,
      }}
    >
      <box
        style={{
          height: 1,
          flexShrink: 0,
          flexDirection: "row",
          justifyContent: "space-between",
          backgroundColor: COLORS.panelRaised,
          paddingLeft: 1,
          paddingRight: 1,
        }}
      >
        <text content={fitLine(`${baseName} → ${comparedName}`, 52)} style={{ fg: COLORS.git }} />
        <text
          content={
            comparison
              ? `${comparison.fileCount} ${translateUi("ARQUIVOS")}  +${comparison.additions} −${comparison.deletions}`
              : ""
          }
          style={{ fg: COLORS.muted }}
        />
      </box>
      <GitComparisonToolbar layout={layout} onLayout={onLayout} />
      <ComparisonBody
        comparison={comparison}
        loading={loading}
        error={error}
        selection={selection}
        layout={layout}
        terminalWidth={terminalWidth}
        fileListRef={fileListRef}
        scrollRef={scrollRef}
        focusedPane={focusedPane}
        onFocusPane={setFocusedPane}
      />
      <PlasmaLoadingOverlay active={loading} label="◷ COMPARANDO BRANCHES…" accent={COLORS.git} />
    </box>
  )
}
