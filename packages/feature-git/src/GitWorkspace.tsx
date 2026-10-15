import type { BoxRenderable } from "@opentui/core"
import { useRenderer, useTerminalDimensions } from "@opentui/react"
import { Button } from "@tuiparts/react/button"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  COLORS,
  focusedPanelBorder,
  LAYOUT,
  panelBorder,
} from "@xupon/tuiminal-core/settings/theme"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { useNotificationFromValue } from "@xupon/tuiminal-core/notifications/index"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { PlasmaLoadingOverlay } from "@xupon/tuiminal-core/ui/PlasmaLoadingOverlay"
import { ShortcutText } from "@xupon/tuiminal-core/ui/ShortcutText"
import { useGitBaseKeyboard } from "./hooks/use-git-base-keyboard"
import { useGitCommandConsole } from "./hooks/use-git-command-console"
import { useGitDiffLoader } from "./hooks/use-git-diff-loader"
import { useGitDiffTarget } from "./hooks/use-git-diff-target"
import { useGitFileActions } from "./hooks/use-git-file-actions"
import { useGitPartialStage } from "./hooks/use-git-partial-stage"
import { useGitPreviewFocus } from "./hooks/use-git-preview-focus"
import { useGitSnapshot } from "./hooks/use-git-snapshot"
import { useLocalConfigurationShortcut } from "./hooks/use-local-configuration-shortcut"
import {
  compactGitActionFooter,
  gitBaseShortcutHint,
  gitFileTreeIsActiveOutsidePartialStage,
  gitMiniGraphLayout,
  gitPartialStageHeaderMeta,
  gitPartialStagePreviewLoading,
  gitPreviewChromeHeight,
  gitPreviewContentStyle,
  showGitActionStatus,
  showGitDiffToolbar,
} from "./model/base-navigation"
import { gitCommitLogWindow } from "./model/git-commit-log"
import type {
  DiffLayout,
  FileTreeOption,
  GitFocusPane,
  NarrowGitPane,
  ViewMode,
} from "./model/view"
import {
  authorInitials,
  buildCommitGraph,
  commitLaneColor,
  formatDecorations,
  formatGraph,
  styledGraph,
} from "./rendering/commit-graph"
import { FILES_PANEL_WIDTH, LOADING_FRAMES } from "./rendering/constants"
import {
  documentLineCount,
  fillLine,
  fitLine,
  parseDiffDocuments,
  parseUnifiedDiff,
} from "./rendering/diff"
import { createFileTreeOptions, displayPath, fileOptionValue } from "./rendering/file-tree"
import { GIT_LAUNCH_DIRECTORY, loadCommitDiff } from "./services/git"
import { GitBaseActionControls } from "./ui/base/GitBaseActionControls"
import { GitCommandConsole, gitCommandConsoleHeight } from "./ui/base/GitCommandConsole"
import { GitCommitLogRow } from "./ui/base/GitCommitLogRow"
import { GitDiffDocumentList } from "./ui/base/GitDiffDocumentList"
import { GitDiffLayoutToolbar } from "./ui/base/GitDiffLayoutToolbar"
import { GitDiffsHeader } from "./ui/base/GitDiffsHeader"
import { GitDiscardChangesModal } from "./ui/base/GitDiscardChangesModal"
import { GitFileTree, gitFileTreeRowId } from "./ui/base/GitFileTree"
import { GitPaneSwitcher } from "./ui/base/GitPaneSwitcher"
import {
  GitPartialStage,
  GitPartialStageActionSlot,
  GitPartialStageToolbarSlot,
} from "./ui/base/GitPartialStage"

export function GitBaseWorkspace({
  active,
  refreshRequest = 0,
  targetDirectory = GIT_LAUNCH_DIRECTORY,
  onOpenLocalConfiguration,
}: {
  active: boolean
  refreshRequest?: number
  targetDirectory?: string
  onOpenLocalConfiguration?: (() => void) | undefined
}) {
  const terminal = useTerminalDimensions()
  const renderer = useRenderer()
  const narrowGit = terminal.width < 78
  const selectedTreeIndexRef = useRef(0)
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [selectedTreeValue, setSelectedTreeValue] = useState<string | null>(null)
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(() => new Set())
  const [selectedCommitIndex, setSelectedCommitIndex] = useState(0)
  const [diff, setDiff] = useState("")
  const [loadedDiffPath, setLoadedDiffPath] = useState<string | null>(null)
  const [commitDiff, setCommitDiff] = useState("")
  const [view, setView] = useState<ViewMode>("diff")
  const [diffLayout, setDiffLayout] = useState<DiffLayout>("unified")
  const [diffOffset, setDiffOffset] = useState(0)
  const [diffLoading, setDiffLoading] = useState(false)
  const [commitLoading, setCommitLoading] = useState(false)
  const [terminalExpanded, setTerminalExpanded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  useNotificationFromValue(message, { source: "Git" })
  const [motionFrame, setMotionFrame] = useState(0)
  const [narrowPane, setNarrowPane] = useState<NarrowGitPane>("files")
  const [focusedPane, setFocusedPane] = useState<GitFocusPane>("files")
  const [filesPanelSize, setFilesPanelSize] = useState({ width: 0, height: 0 })
  const handlePreviewFocus = useCallback(() => setFocusedPane("preview"), [])
  const {
    setDiffScrollRef,
    setHistoryPanelRef,
    focusDiff,
    focusHistory,
    scrollDiff,
    scrollDiffHorizontally,
  } = useGitPreviewFocus(handlePreviewFocus)
  const {
    snapshot,
    loading,
    error,
    setError,
    refreshSequence,
    refresh,
    refreshFiles,
    updateFiles,
  } = useGitSnapshot({
    active,
    targetDirectory,
    refreshRequest,
    selectedPath,
    view,
    setters: { setSelectedPath, setSelectedCommitIndex, setDiff, setCommitDiff },
  })
  const commandPaths = useMemo(
    () => snapshot?.files.map((file) => file.path) ?? [],
    [snapshot?.files],
  )
  const commandConsole = useGitCommandConsole({
    root: snapshot?.root,
    paths: commandPaths,
    refresh,
    onError: setError,
  })
  useNotificationFromValue(error, { source: "Git", kind: "error" })
  useLocalConfigurationShortcut(active, onOpenLocalConfiguration)
  useEffect(() => {
    void targetDirectory
    setLoadedDiffPath(null)
    setSelectedTreeValue(null)
    setTerminalExpanded(false)
  }, [targetDirectory])
  const selectedFile = useMemo(
    () => snapshot?.files.find((file) => file.path === selectedPath) ?? null,
    [selectedPath, snapshot],
  )
  const diffTarget = useGitDiffTarget(selectedFile)
  useGitDiffLoader({
    active,
    root: snapshot?.root,
    target: diffTarget,
    refreshSequence,
    setDiff,
    setLoadedDiffPath,
    setDiffOffset,
    setDiffLoading,
  })
  const selectedCommit = snapshot?.commits[selectedCommitIndex] ?? null
  const stagedCount = snapshot?.files.filter((file) => file.staged).length ?? 0
  const unstagedCount = snapshot?.files.filter((file) => file.unstaged).length ?? 0
  const selectCommitByHash = useCallback(
    (hash: string, nextView: ViewMode = "graph") => {
      const index = snapshot?.commits.findIndex((commit) => commit.fullHash === hash) ?? -1
      if (index < 0) return
      setSelectedCommitIndex(index)
      setView(nextView)
      if (narrowGit) setNarrowPane("preview")
      setDiffOffset(0)
    },
    [narrowGit, snapshot?.commits],
  )
  const fileOptions = useMemo(
    () => createFileTreeOptions(snapshot?.files ?? [], collapsedFolders),
    [collapsedFolders, snapshot?.files],
  )
  const selectedTreeIndex = Math.max(
    0,
    fileOptions.findIndex(
      (option) =>
        option.value === selectedTreeValue ||
        (!selectedTreeValue && option.value === fileOptionValue(selectedPath ?? "")),
    ),
  )
  selectedTreeIndexRef.current = selectedTreeIndex
  const selectFileTreeOption = useCallback((index: number, option: FileTreeOption) => {
    void index
    setFocusedPane("files")
    setSelectedTreeValue(option.value)
    if (option.kind === "file") {
      setSelectedPath(option.path)
      setView("diff")
    }
  }, [])
  const activateFileTreeOption = useCallback(
    (index: number, option: FileTreeOption) => {
      void index
      if (option.kind === "file") {
        if (narrowGit) setNarrowPane("preview")
        setFocusedPane("preview")
        setTimeout(() => {
          focusDiff()
          renderer.root.findDescendantById("git-base-diff")?.focus()
        }, 0)
        return
      }
      if (view !== "diff") return
      setCollapsedFolders((current) => {
        const next = new Set(current)
        if (next.has(option.path)) next.delete(option.path)
        else next.add(option.path)
        return next
      })
    },
    [focusDiff, narrowGit, renderer, view],
  )
  const commitByHash = useMemo(
    () => new Map((snapshot?.commits ?? []).map((commit) => [commit.fullHash, commit])),
    [snapshot?.commits],
  )
  const estimatedMainHeight = Math.max(4, terminal.height - (narrowGit ? 10 : 8))
  const visibleHeight = Math.max(
    3,
    estimatedMainHeight - 5 - gitCommandConsoleHeight(LAYOUT.compact) - LAYOUT.gap,
  )
  const previewWidth = narrowGit
    ? Math.max(16, terminal.width - 6)
    : Math.max(24, terminal.width - FILES_PANEL_WIDTH - 9)
  const compactPreviewActions = compactGitActionFooter(previewWidth)
  const miniGraphLayout = gitMiniGraphLayout({
    panelWidth: filesPanelSize.width || (narrowGit ? terminal.width : FILES_PANEL_WIDTH),
    panelHeight: filesPanelSize.height,
    fallbackHeight: estimatedMainHeight,
    compact: LAYOUT.compact,
    focused: active && focusedPane === "files",
    allowGraph: terminal.height >= 22,
  })
  const measureFilesPanel = useCallback(function (this: BoxRenderable) {
    setFilesPanelSize((current) =>
      current.width === this.width && current.height === this.height
        ? current
        : { width: this.width, height: this.height },
    )
  }, [])
  const showPreviewPane = useCallback(() => {
    if (narrowGit) setNarrowPane("preview")
  }, [narrowGit])
  const focusGitPane = useCallback(
    (pane: GitFocusPane) => {
      setFocusedPane(pane)
      if (narrowGit) setNarrowPane(pane === "files" ? "files" : "preview")
      setTimeout(() => {
        if (pane === "files") {
          renderer.root
            .findDescendantById(gitFileTreeRowId("git-file-list", selectedTreeIndex))
            ?.focus()
        } else if (pane === "preview") {
          if (view === "log" || view === "graph") focusHistory()
          else {
            focusDiff()
            renderer.root.findDescendantById("git-base-diff")?.focus()
          }
        } else {
          renderer.root.findDescendantById("git-command-input")?.focus()
        }
      }, 0)
    },
    [focusDiff, focusHistory, narrowGit, renderer, selectedTreeIndex, view],
  )
  const repositoryRoot = snapshot?.root
  useEffect(() => {
    if (!active || !snapshot?.isRepository || !repositoryRoot) return
    setFocusedPane("files")
    const timeout = setTimeout(
      () =>
        renderer.root
          .findDescendantById(gitFileTreeRowId("git-file-list", selectedTreeIndexRef.current))
          ?.focus(),
      0,
    )
    return () => clearTimeout(timeout)
  }, [active, renderer, repositoryRoot, snapshot?.isRepository])

  useEffect(() => {
    if (!message) return
    const timeout = setTimeout(() => setMessage(null), 2200)
    return () => clearTimeout(timeout)
  }, [message])

  useEffect(() => {
    if (!active || (!loading && !busy)) {
      setMotionFrame(0)
      return
    }

    const interval = setInterval(() => {
      setMotionFrame((current) => (current + 1) % LOADING_FRAMES.length)
    }, 80)
    return () => clearInterval(interval)
  }, [active, busy, loading])

  useEffect(() => {
    const commitHash = selectedCommit?.fullHash
    if (!active || view !== "commit" || !snapshot?.root || !commitHash) return
    let cancelled = false
    setDiffOffset(0)
    setCommitLoading(true)
    void loadCommitDiff(snapshot.root, commitHash)
      .then((nextDiff) => {
        if (!cancelled) setCommitDiff(nextDiff)
      })
      .catch((loadError: unknown) => {
        if (!cancelled) {
          setCommitDiff(
            loadError instanceof Error ? loadError.message : "Não foi possível carregar o commit.",
          )
        }
      })
      .finally(() => {
        if (!cancelled) setCommitLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [active, selectedCommit?.fullHash, snapshot?.root, view])

  const {
    discardTarget,
    setDiscardTarget,
    selectedActionFiles,
    selectedFolder,
    stagePending,
    runStageAction,
    openDiscardTarget,
    runDiscardAction,
  } = useGitFileActions({
    snapshot,
    selectedFile,
    selectedTreeValue,
    busy,
    consoleRunning: commandConsole.running,
    setBusy,
    setError,
    setMessage,
    updateFiles,
    refreshFiles,
    recordCommand: commandConsole.recordCommand,
    recordResult: commandConsole.recordResult,
    focusFiles: () => focusGitPane("files"),
  })

  const partialStage = useGitPartialStage({
    root: snapshot?.root,
    selectedFile,
    blocked: busy || stagePending || commandConsole.running,
    setDiffLayout,
    setTerminalExpanded,
    setError,
    setMessage,
    refreshFiles,
    recordCommand: commandConsole.recordCommand,
    recordResult: commandConsole.recordResult,
    focusPreview: () => focusGitPane("preview"),
  })
  const leavePartialStage = useCallback(
    (pane: GitFocusPane) => {
      if (!partialStage.active) {
        focusGitPane(pane)
        return
      }
      partialStage.cancel()
      setTimeout(() => focusGitPane(pane), 0)
    },
    [focusGitPane, partialStage.active, partialStage.cancel],
  )

  const activeDiff = view === "commit" ? commitDiff : diff
  const parsedDiff = useMemo(() => parseUnifiedDiff(activeDiff), [activeDiff])
  const diffDocuments = useMemo(
    () =>
      parseDiffDocuments(
        activeDiff,
        view === "diff" ? (loadedDiffPath ?? selectedFile?.path) : undefined,
      ),
    [activeDiff, loadedDiffPath, selectedFile?.path, view],
  )
  useEffect(() => {
    if (!active || focusedPane !== "preview" || partialStage.active || !diffDocuments.length) return
    const timeout = setTimeout(() => {
      focusDiff()
      renderer.root.findDescendantById("git-base-diff")?.focus()
    }, 0)
    return () => clearTimeout(timeout)
  }, [active, diffDocuments.length, focusDiff, focusedPane, partialStage.active, renderer])
  const additions = parsedDiff.filter((line) => line.kind === "added").length
  const deletions = parsedDiff.filter((line) => line.kind === "removed").length
  const diffRowCount = diffDocuments.reduce(
    (total, document) => total + Math.max(2, documentLineCount(document, diffLayout) + 1),
    0,
  )
  const maxDiffOffset = Math.max(0, diffRowCount - visibleHeight)
  const commitWindow = gitCommitLogWindow(
    snapshot?.commits ?? [],
    selectedCommitIndex,
    visibleHeight,
  )
  const commitWindowStart = commitWindow.start
  const visibleCommits = snapshot?.commits.slice(commitWindow.start, commitWindow.end) ?? []
  const graphRows = useMemo(() => buildCommitGraph(snapshot?.commits ?? []), [snapshot?.commits])
  const graphByCommitHash = useMemo(
    () => new Map(graphRows.map((row) => [row.commitHash, row.graph])),
    [graphRows],
  )
  const selectedGraphRowIndex = Math.max(
    0,
    graphRows.findIndex((row) => row.commitHash === selectedCommit?.fullHash),
  )
  const maxGraphRows = Math.max(4, visibleHeight + 1)
  const graphWindowStart = Math.max(
    0,
    Math.min(selectedGraphRowIndex - Math.floor(maxGraphRows / 2), graphRows.length - maxGraphRows),
  )
  const visibleGraphRows = graphRows.slice(graphWindowStart, graphWindowStart + maxGraphRows)
  const compactGraphRows = graphRows.slice(0, miniGraphLayout.compactGraphRowLimit)
  const compactGraphColumnWidth = Math.min(
    8,
    Math.max(3, ...compactGraphRows.map((row) => formatGraph(row.graph).length)),
  )
  const fullGraphColumnWidth = Math.min(
    14,
    Math.max(3, ...visibleGraphRows.map((row) => formatGraph(row.graph).length)),
  )

  useEffect(() => {
    if (!partialStage.active) scrollDiff(diffOffset)
  }, [diffOffset, partialStage.active, scrollDiff])

  useGitBaseKeyboard({
    active,
    discardOpen: Boolean(discardTarget),
    autocompleteOpen: commandConsole.autocomplete.open,
    dismissAutocomplete: commandConsole.autocomplete.dismiss,
    focusedPane,
    view,
    commitCount: snapshot?.commits.length ?? 0,
    selectedCommit,
    maxDiffOffset,
    scrollDiffHorizontally,
    focusGitPane,
    refresh: async () => {
      if (!stagePending) await refresh()
    },
    runStageAction,
    openDiscardTarget,
    showPreviewPane,
    setSelectedCommitIndex,
    setView,
    setDiffOffset,
    setDiffLayout,
    partialStage,
  })

  const headerTitle =
    view === "graph"
      ? "ÁRVORE DE COMMITS  ·  TODOS OS BRANCHES"
      : view === "log"
        ? translateUi("HISTÓRICO DE COMMITS · TODOS OS BRANCHES")
        : view === "commit" && selectedCommit
          ? `● ${selectedCommit.hash}  ${selectedCommit.subject}`
          : selectedFile
            ? `∆ ${displayPath(selectedFile.path)}`
            : "DIFF"
  const defaultHeaderMeta =
    view === "graph" || view === "log"
      ? `${Math.min(selectedCommitIndex + 1, snapshot?.commits.length ?? 0)}/${snapshot?.commits.length ?? 0}  [J/K/↑/↓]`
      : `${diffLoading || commitLoading ? "◌ " : ""}+${additions}  −${deletions}  ${Math.min(diffOffset + 1, Math.max(1, diffRowCount))}/${Math.max(1, diffRowCount)}`
  const headerMeta = gitPartialStageHeaderMeta({
    active: partialStage.active,
    cursor: partialStage.cursor,
    targetCount:
      partialStage.pane === "available"
        ? partialStage.availableTargets.length
        : partialStage.selectedTargets.length,
    selectedCount: partialStage.selectedCount,
    selectedLabel: translateUi("selecionado(s)"),
    fallback: defaultHeaderMeta,
  })
  return (
    <box
      id="git-diffs-workspace"
      style={{
        position: "relative",
        flexGrow: 1,
        backgroundColor: LAYOUT.workspaceBackground,
        padding: LAYOUT.outerPadding,
        gap: LAYOUT.gap,
      }}
    >
      <GitDiffsHeader
        key={LAYOUT.compact ? "git-header-compact" : "git-header-framed"}
        snapshot={snapshot}
        loading={loading}
        motionFrame={loading ? motionFrame : 0}
        stagedCount={stagedCount}
        unstagedCount={unstagedCount}
        narrow={narrowGit}
        terminalWidth={terminal.width}
        onConfigure={onOpenLocalConfiguration}
      />

      {!loading && snapshot && !snapshot.isRepository ? (
        <box
          key={LAYOUT.compact ? "git-empty-compact" : "git-empty-framed"}
          style={{
            flexGrow: 1,
            ...panelBorder(),
            backgroundColor: COLORS.panel,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <text content="Nenhum repositório Git encontrado" style={{ fg: COLORS.text }} />
          <text
            content="Inicie o Tuiminal dentro de um projeto versionado."
            style={{ fg: COLORS.muted }}
          />
          <text content={snapshot.launchDirectory} style={{ fg: COLORS.git }} />
        </box>
      ) : (
        <box
          style={{
            flexGrow: 1,
            flexDirection: narrowGit ? "column" : "row",
            gap: narrowGit ? 0 : LAYOUT.gap,
          }}
        >
          <GitPaneSwitcher narrow={narrowGit} pane={narrowPane} onFocus={leavePartialStage} />
          {!narrowGit || narrowPane === "files" ? (
            // biome-ignore lint/a11y/noStaticElementInteractions: the panel mirrors descendant mouse focus.
            <box
              id="git-base-files-panel"
              key={LAYOUT.compact ? "git-files-compact" : "git-files-framed"}
              onSizeChange={measureFilesPanel}
              onMouseDown={() => {
                partialStage.cancel()
                setFocusedPane("files")
              }}
              style={{
                width: narrowGit ? "100%" : FILES_PANEL_WIDTH,
                flexGrow: narrowGit ? 1 : 0,
                ...focusedPanelBorder(active && focusedPane === "files", COLORS.git),
                backgroundColor: COLORS.panel,
                paddingLeft: 1,
                paddingRight: 1,
              }}
            >
              <text
                content={`ARQUIVOS ${snapshot?.files.length ?? 0}  ●${stagedCount}  ○${unstagedCount}`}
                style={{ height: 1, flexShrink: 0, fg: COLORS.git }}
              />
              {fileOptions.length ? (
                <GitFileTree
                  active={gitFileTreeIsActiveOutsidePartialStage(
                    active,
                    partialStage.active,
                    narrowGit,
                    narrowPane,
                  )}
                  id="git-file-list"
                  options={fileOptions}
                  selectedIndex={selectedTreeIndex}
                  width={miniGraphLayout.filesContentWidth}
                  height={miniGraphLayout.fileTreeHeight}
                  onMove={selectFileTreeOption}
                  onActivate={activateFileTreeOption}
                  onToggleStage={(option) => void runStageAction("file", option.value)}
                />
              ) : (
                <box style={{ height: miniGraphLayout.fileTreeHeight, justifyContent: "center" }}>
                  <text content="✓ Working tree limpo" style={{ fg: COLORS.success }} />
                </box>
              )}

              {miniGraphLayout.showMiniGraph ? (
                <box
                  id="git-base-mini-graph"
                  key={LAYOUT.compact ? "git-mini-graph-compact" : "git-mini-graph-framed"}
                  style={{
                    width: miniGraphLayout.miniGraphWidth,
                    height: miniGraphLayout.compactGraphHeight,
                    flexShrink: 0,
                    overflow: "hidden",
                    ...panelBorder(),
                    backgroundColor: COLORS.canvas,
                    paddingLeft: 1,
                    paddingRight: 1,
                  }}
                >
                  <box style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <text content="ÁRVORE GIT" style={{ fg: COLORS.database }} />
                    <InlineButton
                      label="[G] Abrir"
                      accent={COLORS.database}
                      active={view === "graph"}
                      onPress={() => {
                        setView((current) => (current === "graph" ? "diff" : "graph"))
                        if (narrowGit) setNarrowPane("preview")
                        setFocusedPane("preview")
                        setDiffOffset(0)
                        setTimeout(focusHistory, 0)
                      }}
                    />
                  </box>
                  {compactGraphRows.length ? (
                    compactGraphRows.map((row) => {
                      const commit = row.commitHash ? commitByHash.get(row.commitHash) : undefined
                      const selected = row.commitHash === selectedCommit?.fullHash
                      const rowBackground = selected ? COLORS.panelRaised : COLORS.canvas
                      const graph = styledGraph(row.graph, compactGraphColumnWidth, rowBackground)
                      const initials = commit ? authorInitials(commit.author) : ""
                      const label = commit ? `${commit.hash} ${commit.subject}` : ""
                      const commitColor = commitLaneColor(row.graph)
                      return (
                        <Button
                          key={row.id}
                          id={`git-base-mini-graph-row-${row.id}`}
                          onPress={() => {
                            if (row.commitHash) {
                              setFocusedPane("files")
                              selectCommitByHash(row.commitHash)
                            }
                          }}
                          height={1}
                          flexShrink={0}
                        >
                          <box style={{ flexDirection: "row", height: 1, flexShrink: 0 }}>
                            <text
                              content={graph}
                              style={{
                                width: compactGraphColumnWidth,
                                flexShrink: 0,
                                bg: rowBackground,
                              }}
                            />
                            <text
                              content={commit ? ` ${initials.padEnd(2, " ")} ` : "    "}
                              style={{
                                fg: commitColor,
                                bg: commit && !selected ? COLORS.diffHunkBg : rowBackground,
                              }}
                            />
                            <text
                              content={fillLine(
                                label,
                                Math.max(
                                  4,
                                  miniGraphLayout.miniGraphContentWidth -
                                    compactGraphColumnWidth -
                                    4,
                                ),
                              )}
                              style={{
                                fg: selected ? COLORS.text : COLORS.muted,
                                bg: selected ? COLORS.panelRaised : COLORS.canvas,
                              }}
                            />
                          </box>
                        </Button>
                      )
                    })
                  ) : (
                    <text content="Sem commits" style={{ fg: COLORS.muted }} />
                  )}
                </box>
              ) : null}
            </box>
          ) : null}

          {!narrowGit || narrowPane === "preview" ? (
            // biome-ignore lint/a11y/noStaticElementInteractions: the panel mirrors descendant mouse focus.
            <box
              id="git-base-preview-panel"
              key={LAYOUT.compact ? "git-preview-compact" : "git-preview-framed"}
              onMouseDown={() => setFocusedPane("preview")}
              style={{
                flexGrow: 1,
                ...focusedPanelBorder(active && focusedPane === "preview", COLORS.git),
                backgroundColor: LAYOUT.alternatePanel,
                paddingLeft: 1,
                paddingRight: 1,
              }}
            >
              <box
                visible={!terminalExpanded}
                style={{
                  height: gitPreviewChromeHeight(terminalExpanded),
                  flexShrink: 0,
                  flexDirection: "row",
                  overflow: "hidden",
                  justifyContent: "space-between",
                  backgroundColor: COLORS.panelRaised,
                  paddingLeft: 1,
                  paddingRight: 1,
                }}
              >
                <text
                  content={fitLine(headerTitle, Math.max(12, previewWidth - headerMeta.length - 1))}
                  style={{ fg: COLORS.git }}
                />
                <text content={headerMeta} style={{ fg: COLORS.muted }} />
              </box>

              {showGitDiffToolbar(terminalExpanded, view) ? (
                <box
                  style={{
                    height: 1,
                    flexShrink: 0,
                    flexDirection: "row",
                    justifyContent: "space-between",
                    backgroundColor: COLORS.diffGutterBg,
                    paddingLeft: 1,
                    paddingRight: 1,
                  }}
                >
                  <GitPartialStageToolbarSlot
                    active={partialStage.active}
                    granularity={partialStage.granularity}
                    disabled={partialStage.interactionBlocked}
                    onToggleGranularity={partialStage.toggleGranularity}
                  >
                    <GitDiffLayoutToolbar
                      narrow={narrowGit}
                      layout={diffLayout}
                      onSelect={(nextLayout) => {
                        setDiffLayout(nextLayout)
                        setDiffOffset(0)
                      }}
                    />
                  </GitPartialStageToolbarSlot>
                </box>
              ) : null}

              <box
                ref={setHistoryPanelRef}
                id="git-base-history"
                visible={!terminalExpanded}
                focusable={view === "log" || view === "graph"}
                onMouseScroll={(event) => {
                  if ((view !== "graph" && view !== "log") || !event.scroll) return
                  const delta = Math.max(1, Math.round(event.scroll.delta))
                  const direction =
                    event.scroll.direction === "up" || event.scroll.direction === "left" ? -1 : 1
                  setSelectedCommitIndex((current) =>
                    Math.max(
                      0,
                      Math.min((snapshot?.commits.length ?? 1) - 1, current + direction * delta),
                    ),
                  )
                  setFocusedPane("preview")
                  focusHistory()
                  event.preventDefault()
                  event.stopPropagation()
                }}
                style={{
                  position: "relative",
                  ...gitPreviewContentStyle(terminalExpanded),
                }}
              >
                {view === "graph" ? (
                  visibleGraphRows.length ? (
                    visibleGraphRows.map((row) => {
                      const commit = row.commitHash ? commitByHash.get(row.commitHash) : undefined
                      const selected = row.commitHash === selectedCommit?.fullHash
                      const rowBackground = selected ? COLORS.panelRaised : COLORS.panel
                      const graph = styledGraph(row.graph, fullGraphColumnWidth, rowBackground)
                      const initials = commit ? authorInitials(commit.author) : ""
                      const refs = commit ? formatDecorations(commit.decorations) : ""
                      const label = commit
                        ? `${commit.hash}${refs ? `  ‹${refs}›` : ""}  ${commit.subject}`
                        : ""
                      const metaWidth = Math.min(24, Math.max(0, Math.floor(previewWidth * 0.25)))
                      const meta = commit
                        ? fitLine(`${commit.date} · ${commit.author}`, metaWidth)
                        : ""
                      const labelWidth = Math.max(
                        4,
                        previewWidth - fullGraphColumnWidth - metaWidth - 6,
                      )
                      const commitColor = commitLaneColor(row.graph)
                      return (
                        <Button
                          key={row.id}
                          id={`git-base-graph-row-${row.id}`}
                          onPress={() => {
                            if (row.commitHash) {
                              setFocusedPane("preview")
                              selectCommitByHash(row.commitHash)
                              setTimeout(focusHistory, 0)
                            }
                          }}
                          height={1}
                          flexShrink={0}
                        >
                          <box style={{ flexDirection: "row", height: 1, flexShrink: 0 }}>
                            <text
                              content={graph}
                              style={{
                                width: fullGraphColumnWidth,
                                flexShrink: 0,
                                bg: rowBackground,
                              }}
                            />
                            <text
                              content={commit ? ` ${initials.padEnd(2, " ")} ` : "    "}
                              style={{
                                fg: commitColor,
                                bg: commit && !selected ? COLORS.diffHunkBg : rowBackground,
                              }}
                            />
                            <text
                              content={` ${fillLine(label, labelWidth)} `}
                              style={{
                                fg: COLORS.text,
                                bg: rowBackground,
                              }}
                            />
                            <text
                              content={fillLine(meta, metaWidth)}
                              style={{ fg: COLORS.muted, bg: rowBackground }}
                            />
                          </box>
                        </Button>
                      )
                    })
                  ) : (
                    <text
                      content="Este repositório ainda não possui commits."
                      style={{ fg: COLORS.muted }}
                    />
                  )
                ) : view === "log" ? (
                  visibleCommits.length ? (
                    visibleCommits.map((commit, windowIndex) => {
                      const index = commitWindowStart + windowIndex
                      const selected = index === selectedCommitIndex
                      return (
                        <GitCommitLogRow
                          key={commit.fullHash}
                          id={`git-base-log-row-${index}`}
                          commit={commit}
                          graph={graphByCommitHash.get(commit.fullHash) ?? "*"}
                          graphWidth={fullGraphColumnWidth}
                          width={previewWidth}
                          selected={selected}
                          onPress={() => {
                            setFocusedPane("preview")
                            setSelectedCommitIndex(index)
                            setTimeout(focusHistory, 0)
                          }}
                        />
                      )
                    })
                  ) : (
                    <text
                      content="Este branch ainda não possui commits."
                      style={{ fg: COLORS.muted }}
                    />
                  )
                ) : partialStage.active ? (
                  <GitPartialStage
                    documents={partialStage.documents}
                    loading={partialStage.loading}
                    granularity={partialStage.granularity}
                    pane={partialStage.pane}
                    availableTargets={partialStage.availableTargets}
                    selectedTargets={partialStage.selectedTargets}
                    currentTargetId={partialStage.currentTarget?.id ?? null}
                    width={previewWidth}
                    setDiffScrollRef={setDiffScrollRef}
                    onPaneChange={partialStage.selectPane}
                    onTransfer={partialStage.transferTarget}
                    onFocus={handlePreviewFocus}
                  />
                ) : (selectedFile || view === "commit") && diffDocuments.length ? (
                  <GitDiffDocumentList
                    documents={diffDocuments}
                    layout={diffLayout}
                    setScrollRef={setDiffScrollRef}
                  />
                ) : (
                  <text
                    content="Selecione uma alteração para ver o diff."
                    style={{ fg: COLORS.muted }}
                  />
                )}
                <PlasmaLoadingOverlay
                  active={gitPartialStagePreviewLoading(
                    partialStage.active,
                    view,
                    diffLoading,
                    commitLoading,
                  )}
                  label="◌ MONTANDO PREVIEW"
                  accent={COLORS.git}
                  background={LAYOUT.alternatePanel}
                />
              </box>

              {showGitActionStatus(terminalExpanded, busy, error, message) ? (
                <text
                  content={fitLine(
                    busy
                      ? `${LOADING_FRAMES[motionFrame]} APLICANDO ALTERAÇÃO`
                      : (error ?? message ?? ""),
                    previewWidth,
                  )}
                  style={{
                    fg: error ? COLORS.danger : busy ? COLORS.git : COLORS.success,
                  }}
                />
              ) : null}
              <box
                id="git-base-action-footer"
                visible={!terminalExpanded}
                style={{
                  height: gitPreviewChromeHeight(terminalExpanded),
                  flexShrink: 0,
                  flexDirection: "row",
                  overflow: "hidden",
                  backgroundColor: COLORS.panelRaised,
                  zIndex: 20,
                }}
              >
                <GitPartialStageActionSlot
                  active={partialStage.active}
                  compact={compactPreviewActions}
                  pane={partialStage.pane}
                  cursor={partialStage.cursor}
                  targetCount={
                    partialStage.pane === "available"
                      ? partialStage.availableTargets.length
                      : partialStage.selectedTargets.length
                  }
                  loading={partialStage.loading}
                  running={partialStage.running}
                  onMove={partialStage.move}
                  onTransfer={partialStage.transferTarget}
                  onApply={() => void partialStage.apply()}
                  onCancel={() => void partialStage.apply()}
                >
                  <GitBaseActionControls
                    compact={compactPreviewActions}
                    view={view}
                    busy={busy}
                    commandRunning={commandConsole.running}
                    stagePending={stagePending}
                    setView={setView}
                    selectedCommitIndex={selectedCommitIndex}
                    commitCount={snapshot?.commits.length ?? 0}
                    hasSelectedCommit={Boolean(selectedCommit)}
                    setSelectedCommitIndex={setSelectedCommitIndex}
                    selectedActionFileCount={selectedActionFiles.length}
                    selectedFolder={Boolean(selectedFolder)}
                    repositoryFileCount={snapshot?.files.length ?? 0}
                    partialStageDisabled={partialStage.startDisabled}
                    loading={loading}
                    onStage={() => void runStageAction("file")}
                    onStageSelection={() => void runStageAction("selection")}
                    onPartialStage={() => void partialStage.start()}
                    onDiscard={openDiscardTarget}
                    onFocusTerminal={() => leavePartialStage("terminal")}
                    onRefresh={() => void refresh()}
                  />
                </GitPartialStageActionSlot>
              </box>
              {!partialStage.active ? (
                <GitCommandConsole
                  width={previewWidth}
                  focused={active && focusedPane === "terminal"}
                  expanded={terminalExpanded}
                  running={commandConsole.running || stagePending}
                  lines={commandConsole.lines}
                  value={commandConsole.value}
                  onInput={commandConsole.setValue}
                  autocomplete={commandConsole.autocomplete}
                  onSubmit={() => {
                    if (!stagePending) void commandConsole.submit()
                  }}
                  onFocus={() => leavePartialStage("terminal")}
                  onNavigate={leavePartialStage}
                  onToggleExpanded={() => {
                    setTerminalExpanded((current) => !current)
                    focusGitPane("terminal")
                  }}
                />
              ) : null}
            </box>
          ) : null}
        </box>
      )}
      {discardTarget ? (
        <GitDiscardChangesModal
          target={discardTarget.label}
          fileCount={discardTarget.files.length}
          onClose={() => {
            setDiscardTarget(null)
            focusGitPane("files")
          }}
          onConfirm={() => {
            setSelectedTreeValue(null)
            void runDiscardAction()
          }}
        />
      ) : null}
      <PlasmaLoadingOverlay
        active={loading && !snapshot}
        label="CARREGANDO REPOSITÓRIO…"
        accent={COLORS.git}
        background={COLORS.canvas}
      />
      <ShortcutText
        id="git-base-shortcut-footer"
        content={translateUi(
          gitBaseShortcutHint(
            terminal.width,
            view === "log" || view === "graph",
            partialStage.active,
          ),
        )}
        style={{
          width: "100%",
          height: 1,
          flexShrink: 0,
          overflow: "hidden",
          fg: COLORS.muted,
          bg: COLORS.panelRaised,
          zIndex: 30,
        }}
      />
    </box>
  )
}
