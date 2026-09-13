import type { ScrollBoxRenderable, SelectRenderable } from "@opentui/core"
import type React from "react"
import { COLORS, focusedPanelBorder } from "../../../../core/settings/theme"
import { translateUi } from "../../../../shared/i18n"
import { InlineButton } from "../../../../shared/ui/InlineButton"
import { handleSelectMouseDown, handleSelectMouseScroll } from "../../../../shared/ui/selectMouse"
import type { DiffDocument, DiffLayout, FileTreeOption } from "../../model/view"
import { GitDiffDocument } from "../shared/GitDiffDocument"
import { GitDiffViewport } from "../shared/GitDiffViewport"

export type ComparisonDocumentSelection = {
  documents: DiffDocument[]
  fileOptions: FileTreeOption[]
  selectedDocument: DiffDocument | null
  selectedTreeIndex: number
  selectFile: (value: string) => void
  toggleFolder: (value: string) => void
}

export function GitComparisonToolbar({
  layout,
  onLayout,
}: {
  layout: DiffLayout
  onLayout: (layout: DiffLayout) => void
}) {
  return (
    <box
      style={{
        height: 1,
        flexShrink: 0,
        flexDirection: "row",
        backgroundColor: COLORS.diffGutterBg,
      }}
    >
      <InlineButton
        label={`${layout === "unified" ? "[V] " : ""}${translateUi("Unificado")}`}
        accent={COLORS.database}
        active={layout === "unified"}
        onPress={() => onLayout("unified")}
      />
      <InlineButton
        label={`${layout === "split" ? "[V] " : ""}${translateUi("2 colunas")}`}
        accent={COLORS.database}
        active={layout === "split"}
        onPress={() => onLayout("split")}
      />
      <InlineButton
        label={`${layout === "inline" ? "[V] " : ""}${translateUi("Intralinha")}`}
        accent={COLORS.database}
        active={layout === "inline"}
        onPress={() => onLayout("inline")}
      />
    </box>
  )
}

function ComparisonFileTree({
  fileListRef,
  selection,
  width,
  height,
  focused,
  onFocus,
}: {
  fileListRef: React.RefObject<SelectRenderable | null>
  selection: ComparisonDocumentSelection
  width: number | "100%"
  height: number | "100%"
  focused: boolean
  onFocus: () => void
}) {
  return (
    <box
      id="git-compare-files-panel"
      style={{
        ...focusedPanelBorder(focused, COLORS.git),
        flexShrink: 0,
        width,
        height,
        backgroundColor: COLORS.panel,
        paddingLeft: 1,
        paddingRight: 1,
      }}
    >
      <text
        content={`${translateUi("ARQUIVOS")} ${selection.documents.length}`}
        style={{ height: 1, flexShrink: 0, fg: COLORS.git }}
      />
      <select
        ref={fileListRef}
        id="git-compare-file-list"
        options={selection.fileOptions}
        selectedIndex={selection.selectedTreeIndex}
        onChange={(_index, option) => {
          if (typeof option?.value === "string") selection.selectFile(option.value)
        }}
        onSelect={(_index, option) => {
          if (typeof option?.value === "string") selection.toggleFolder(option.value)
        }}
        onMouseDown={(event) => {
          onFocus()
          handleSelectMouseDown(event, fileListRef.current, {
            optionCount: selection.fileOptions.length,
            activateOnClick: true,
          })
        }}
        onMouseScroll={(event) => handleSelectMouseScroll(event, fileListRef.current)}
        showDescription={false}
        showScrollIndicator
        wrapSelection
        style={{
          flexGrow: 1,
          width: "100%",
          backgroundColor: COLORS.panel,
          focusedBackgroundColor: COLORS.panel,
          textColor: COLORS.muted,
          focusedTextColor: COLORS.text,
          selectedBackgroundColor: COLORS.panelRaised,
          selectedTextColor: COLORS.git,
        }}
      />
    </box>
  )
}

export function GitComparisonContent({
  selection,
  layout,
  narrow,
  terminalWidth,
  fileListRef,
  scrollRef,
  focusedPane,
  onFocusPane,
}: {
  selection: ComparisonDocumentSelection
  layout: DiffLayout
  narrow: boolean
  terminalWidth: number
  fileListRef: React.RefObject<SelectRenderable | null>
  scrollRef: React.RefObject<ScrollBoxRenderable | null>
  focusedPane: "files" | "diff"
  onFocusPane: (pane: "files" | "diff") => void
}) {
  if (!selection.selectedDocument) return null
  const treeWidth = Math.min(34, Math.max(24, Math.floor(terminalWidth * 0.28)))
  const treeHeight = Math.min(6, Math.max(3, selection.fileOptions.length + 2))
  return (
    <box style={{ flexGrow: 1, minHeight: 3, flexDirection: narrow ? "column" : "row", gap: 1 }}>
      <ComparisonFileTree
        fileListRef={fileListRef}
        selection={selection}
        width={narrow ? "100%" : treeWidth}
        height={narrow ? treeHeight : "100%"}
        focused={focusedPane === "files"}
        onFocus={() => onFocusPane("files")}
      />
      <box
        id="git-compare-diff-panel"
        style={{
          ...focusedPanelBorder(focusedPane === "diff", COLORS.git),
          flexGrow: 1,
          minHeight: 3,
          minWidth: 0,
          width: "100%",
        }}
      >
        <GitDiffViewport
          id="git-compare-diff"
          scrollRef={scrollRef}
          focused={focusedPane === "diff"}
          onFocus={() => onFocusPane("diff")}
          resetKey={`${layout}:${selection.selectedDocument.key}`}
        >
          <GitDiffDocument document={selection.selectedDocument} layout={layout} />
        </GitDiffViewport>
      </box>
    </box>
  )
}
