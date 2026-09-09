import type { BoxRenderable } from "@opentui/core"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import { Button } from "@tuiparts/react/button"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { COLORS, focusedPanelBorder, LAYOUT, panelBorder } from "../../core/settings/theme"
import { translateUi } from "../../shared/i18n"
import { useNotificationFromValue } from "../../shared/notifications/index"
import { InlineButton } from "../../shared/ui/InlineButton"
import { PlasmaLoadingOverlay } from "../../shared/ui/PlasmaLoadingOverlay"
import { ShortcutText } from "../../shared/ui/ShortcutText"
import { useGitDiffTarget } from "./hooks/use-git-diff-target"
import { useGitPreviewFocus } from "./hooks/use-git-preview-focus"
import { useGitSnapshot } from "./hooks/use-git-snapshot"
import { useLocalConfigurationShortcut } from "./hooks/use-local-configuration-shortcut"
import {
  compactGitActionFooter,
  gitActionLabel,
  gitBaseShortcutHint,
  gitFileTreeIsActive,
  gitHistoryNavigationDelta,
  gitMiniGraphLayout,
  gitPaneFocusTarget,
  isGitHistoryFocused,
} from "./model/base-navigation"
import type { DiffLayout, FileTreeOption, NarrowGitPane, ViewMode } from "./model/view"
import {
  authorInitials,
  buildCommitGraph,
  commitLaneColor,
  formatDecorations,
  formatGraph,
  styledGraph,
} from "./rendering/commit-graph"
import { DIFF_SYNTAX_STYLE, FILES_PANEL_WIDTH, LOADING_FRAMES } from "./rendering/constants"
import {
  documentLineCount,
  fillLine,
  fitLine,
  InlineDiffLine,
  parseDiffDocuments,
  parseUnifiedDiff,
} from "./rendering/diff"
import {
  createFileTreeOptions,
  displayPath,
  FOLDER_OPTION_PREFIX,
  fileOptionValue,
} from "./rendering/file-tree"
import { commitTitle } from "./rendering/presentation"
import {
  GIT_LAUNCH_DIRECTORY,
  loadCommitDiff,
  loadGitDiff,
  toggleAllGitFiles,
  toggleGitFile,
} from "./services/git"
import { GitDiffsHeader } from "./ui/base/GitDiffsHeader"
import { GitFileTree, gitFileTreeRowId, isGitFileTreeFocused } from "./ui/base/GitFileTree"
import { GitPaneSwitcher } from "./ui/base/GitPaneSwitcher"

function gitDiffLayoutLabel(current: DiffLayout, target: DiffLayout, label: string) {
  return `${current === target ? "[V] " : ""}${label}`
}

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
  const loadedDiffTargetRef = useRef<string | null>(null)
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
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  useNotificationFromValue(message, { source: "Git" })
  const [motionFrame, setMotionFrame] = useState(0)
  const [narrowPane, setNarrowPane] = useState<NarrowGitPane>("files")
  const [focusedPane, setFocusedPane] = useState<NarrowGitPane>("files")
  const [filesPanelSize, setFilesPanelSize] = useState({ width: 0, height: 0 })
  const handlePreviewFocus = useCallback(() => setFocusedPane("preview"), [])
  const { setDiffScrollRef, setHistoryPanelRef, focusDiff, focusHistory, scrollDiff } =
    useGitPreviewFocus(handlePreviewFocus)
  const { snapshot, loading, error, setError, refreshSequence, refresh } = useGitSnapshot({
    active,
    targetDirectory,
    refreshRequest,
    selectedPath,
    view,
    setters: { setSelectedPath, setSelectedCommitIndex, setDiff, setCommitDiff },
  })
  useNotificationFromValue(error, { source: "Git", kind: "error" })
  useLocalConfigurationShortcut(active, onOpenLocalConfiguration)
  useEffect(() => {
    void targetDirectory
    loadedDiffTargetRef.current = null
    setLoadedDiffPath(null)
    setSelectedTreeValue(null)
  }, [targetDirectory])
  const selectedFile = useMemo(
    () => snapshot?.files.find((file) => file.path === selectedPath) ?? null,
    [selectedPath, snapshot],
  )
  const diffTarget = useGitDiffTarget(selectedFile)
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
    [narrowGit, view],
  )
  const commitByHash = useMemo(
    () => new Map((snapshot?.commits ?? []).map((commit) => [commit.fullHash, commit])),
    [snapshot?.commits],
  )
  const estimatedMainHeight = Math.max(4, terminal.height - (narrowGit ? 10 : 8))
  const visibleHeight = Math.max(3, estimatedMainHeight - 5)
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
    (pane: NarrowGitPane) => {
      setFocusedPane(pane)
      if (narrowGit) setNarrowPane(pane)
      setTimeout(() => {
        if (pane === "files") {
          renderer.root
            .findDescendantById(gitFileTreeRowId("git-file-list", selectedTreeIndex))
            ?.focus()
        } else {
          if (view === "log" || view === "graph") focusHistory()
          else focusDiff()
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
    if (!active) return
    void refreshSequence
    const root = snapshot?.root
    if (!root || !diffTarget) {
      loadedDiffTargetRef.current = null
      setLoadedDiffPath(null)
      setDiff("")
      return
    }

    const targetKey = `${root}:${diffTarget.path}:${diffTarget.indexStatus}:${diffTarget.worktreeStatus}`
    const targetChanged = loadedDiffTargetRef.current !== targetKey
    let cancelled = false
    if (targetChanged) {
      setDiffOffset(0)
      setDiffLoading(true)
    }
    void loadGitDiff(root, diffTarget)
      .then((nextDiff) => {
        if (!cancelled) {
          setDiff(nextDiff)
          setLoadedDiffPath(diffTarget.path)
        }
      })
      .catch((loadError: unknown) => {
        if (!cancelled) {
          setDiff(
            loadError instanceof Error ? loadError.message : "Não foi possível carregar o diff.",
          )
          setLoadedDiffPath(diffTarget.path)
        }
      })
      .finally(() => {
        if (!cancelled) {
          loadedDiffTargetRef.current = targetKey
          if (targetChanged) setDiffLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [active, diffTarget, refreshSequence, snapshot?.root])

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

  const runStageAction = useCallback(
    async (allFiles: boolean) => {
      const targetFile = selectedFile
      if (!snapshot?.root || busy) return
      if (!allFiles && selectedTreeValue?.startsWith(FOLDER_OPTION_PREFIX)) {
        setMessage("Selecione um arquivo para alterar o stage.")
        return
      }
      if (!allFiles && !targetFile) return
      setBusy(true)
      setError(null)
      setMessage(null)
      try {
        let nextMessage: string
        if (allFiles) {
          nextMessage = await toggleAllGitFiles(snapshot.root, snapshot.files)
        } else {
          if (!targetFile) return
          nextMessage = await toggleGitFile(snapshot.root, targetFile)
        }
        setMessage(nextMessage)
        await refresh(false)
      } catch (stageError) {
        setError(
          stageError instanceof Error ? stageError.message : "Não foi possível alterar o stage.",
        )
      } finally {
        setBusy(false)
      }
    },
    [busy, refresh, selectedFile, selectedTreeValue, setError, snapshot],
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
  const additions = parsedDiff.filter((line) => line.kind === "added").length
  const deletions = parsedDiff.filter((line) => line.kind === "removed").length
  const diffRowCount = diffDocuments.reduce(
    (total, document) => total + Math.max(2, documentLineCount(document, diffLayout) + 1),
    0,
  )
  const maxDiffOffset = Math.max(0, diffRowCount - visibleHeight)
  const maxCommitRows = Math.max(1, Math.floor(visibleHeight / 2))
  const commitWindowStart = Math.max(
    0,
    Math.min(
      selectedCommitIndex - Math.floor(maxCommitRows / 2),
      (snapshot?.commits.length ?? 0) - maxCommitRows,
    ),
  )
  const visibleCommits =
    snapshot?.commits.slice(commitWindowStart, commitWindowStart + maxCommitRows) ?? []
  const graphRows = useMemo(() => buildCommitGraph(snapshot?.commits ?? []), [snapshot?.commits])
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
    scrollDiff(diffOffset)
  }, [diffOffset, scrollDiff])

  useKeyboard((key) => {
    if (!active) return

    const focusedId = renderer.currentFocusedRenderable?.id ?? ""
    const fileTreeFocused = isGitFileTreeFocused(focusedId, "git-file-list")
    const historyFocused = isGitHistoryFocused(focusedId)
    const previewFocused = focusedId === "git-base-diff" || historyFocused
    const paneTarget = gitPaneFocusTarget(key.name, fileTreeFocused, previewFocused)
    if (paneTarget) {
      key.preventDefault()
      key.stopPropagation()
      focusGitPane(paneTarget)
      return
    }

    const historyDelta = gitHistoryNavigationDelta(key.name)
    if (historyDelta && (view === "log" || view === "graph") && historyFocused) {
      key.preventDefault()
      key.stopPropagation()
      setSelectedCommitIndex((current) =>
        Math.max(0, Math.min((snapshot?.commits.length ?? 1) - 1, current + historyDelta)),
      )
      return
    }

    switch (key.name) {
      case "r":
        void refresh()
        break
      case "space":
        if (view === "diff") {
          key.preventDefault()
          void runStageAction(false)
        }
        break
      case "a":
        if (view === "diff") void runStageAction(true)
        break
      case "d":
        setView("diff")
        showPreviewPane()
        setDiffOffset(0)
        break
      case "o":
        setView("log")
        showPreviewPane()
        setDiffOffset(0)
        break
      case "g":
        setView((current) => (current === "graph" ? "diff" : "graph"))
        showPreviewPane()
        setDiffOffset(0)
        break
      case "v":
        if (view !== "log" && view !== "graph") {
          setDiffLayout((current) =>
            current === "unified" ? "split" : current === "split" ? "inline" : "unified",
          )
          setDiffOffset(0)
        }
        break
      case "return":
      case "enter":
      case "linefeed":
        if ((view === "log" || view === "graph") && historyFocused && selectedCommit) {
          setView("commit")
          showPreviewPane()
        }
        break
      case "[":
        if (view !== "log" && view !== "graph") {
          setDiffOffset((current) => Math.max(0, current - 5))
        }
        break
      case "]":
        if (view !== "log" && view !== "graph") {
          setDiffOffset((current) => Math.min(maxDiffOffset, current + 5))
        }
        break
    }
  })

  const headerTitle =
    view === "graph"
      ? "ÁRVORE DE COMMITS  ·  TODOS OS BRANCHES"
      : view === "log"
        ? "HISTÓRICO DO BRANCH"
        : view === "commit" && selectedCommit
          ? `● ${selectedCommit.hash}  ${selectedCommit.subject}`
          : selectedFile
            ? `∆ ${displayPath(selectedFile.path)}`
            : "DIFF"
  const headerMeta =
    view === "graph" || view === "log"
      ? `${Math.min(selectedCommitIndex + 1, snapshot?.commits.length ?? 0)}/${snapshot?.commits.length ?? 0}  [J/K/↑/↓]`
      : `${diffLoading || commitLoading ? "◌ " : ""}+${additions}  −${deletions}  ${Math.min(diffOffset + 1, Math.max(1, diffRowCount))}/${Math.max(1, diffRowCount)}`
  return (
    <box
      style={{
        position: "relative",
        flexGrow: 1,
        backgroundColor: COLORS.canvas,
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
          <GitPaneSwitcher narrow={narrowGit} pane={narrowPane} onFocus={focusGitPane} />
          {!narrowGit || narrowPane === "files" ? (
            // biome-ignore lint/a11y/noStaticElementInteractions: the panel mirrors descendant mouse focus.
            <box
              id="git-base-files-panel"
              key={LAYOUT.compact ? "git-files-compact" : "git-files-framed"}
              onSizeChange={measureFilesPanel}
              onMouseDown={() => setFocusedPane("files")}
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
                  active={gitFileTreeIsActive(active, narrowGit, narrowPane)}
                  id="git-file-list"
                  options={fileOptions}
                  selectedIndex={selectedTreeIndex}
                  width={miniGraphLayout.filesContentWidth}
                  height={miniGraphLayout.fileTreeHeight}
                  onMove={selectFileTreeOption}
                  onActivate={activateFileTreeOption}
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
                <text
                  content={fitLine(headerTitle, Math.max(12, previewWidth - headerMeta.length - 1))}
                  style={{ fg: COLORS.git }}
                />
                <text content={headerMeta} style={{ fg: COLORS.muted }} />
              </box>

              {view !== "log" && view !== "graph" ? (
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
                  {narrowGit ? (
                    <>
                      <text
                        content={`VIEW · ${diffLayout === "unified" ? "UNIFICADO" : diffLayout === "split" ? "2 COLUNAS" : "INTRALINHA"}`}
                        style={{ fg: COLORS.database }}
                      />
                      <InlineButton
                        label="[V] Alterar"
                        accent={COLORS.database}
                        onPress={() => {
                          setDiffLayout((current) =>
                            current === "unified"
                              ? "split"
                              : current === "split"
                                ? "inline"
                                : "unified",
                          )
                          setDiffOffset(0)
                        }}
                      />
                    </>
                  ) : (
                    <>
                      <text content="VIEW" style={{ fg: COLORS.border }} />
                      <InlineButton
                        label={gitDiffLayoutLabel(diffLayout, "unified", translateUi("Unificado"))}
                        accent={COLORS.database}
                        active={diffLayout === "unified"}
                        onPress={() => {
                          setDiffLayout("unified")
                          setDiffOffset(0)
                        }}
                      />
                      <InlineButton
                        label={gitDiffLayoutLabel(diffLayout, "split", translateUi("2 colunas"))}
                        accent={COLORS.database}
                        active={diffLayout === "split"}
                        onPress={() => {
                          setDiffLayout("split")
                          setDiffOffset(0)
                        }}
                      />
                      <InlineButton
                        label={gitDiffLayoutLabel(diffLayout, "inline", translateUi("Intralinha"))}
                        accent={COLORS.database}
                        active={diffLayout === "inline"}
                        onPress={() => {
                          setDiffLayout("inline")
                          setDiffOffset(0)
                        }}
                      />
                    </>
                  )}
                </box>
              ) : null}

              <box
                ref={setHistoryPanelRef}
                id="git-base-history"
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
                style={{ position: "relative", flexGrow: 1 }}
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
                      const details = `│  ${commit.date} · ${commit.author}  +${commit.additions} −${commit.deletions}`
                      return (
                        <Button
                          key={commit.fullHash}
                          id={`git-base-log-row-${index}`}
                          onPress={() => {
                            setFocusedPane("preview")
                            setSelectedCommitIndex(index)
                            setTimeout(focusHistory, 0)
                          }}
                          height={2}
                          flexShrink={0}
                        >
                          <box>
                            <text
                              content={commitTitle(commit, selected, previewWidth)}
                              style={{
                                fg: selected ? COLORS.git : COLORS.text,
                                bg: selected ? COLORS.panelRaised : COLORS.panel,
                              }}
                            />
                            <text
                              content={fillLine(details, previewWidth)}
                              style={{
                                fg: selected ? COLORS.muted : COLORS.border,
                                bg: selected ? COLORS.panelRaised : COLORS.panel,
                              }}
                            />
                          </box>
                        </Button>
                      )
                    })
                  ) : (
                    <text
                      content="Este branch ainda não possui commits."
                      style={{ fg: COLORS.muted }}
                    />
                  )
                ) : (selectedFile || view === "commit") && diffDocuments.length ? (
                  <scrollbox
                    ref={setDiffScrollRef}
                    id="git-base-diff"
                    focusable
                    scrollY
                    scrollX
                    viewportCulling
                    style={{ flexGrow: 1, width: "100%", height: "100%" }}
                    verticalScrollbarOptions={{
                      trackOptions: {
                        backgroundColor: COLORS.panel,
                        foregroundColor: COLORS.border,
                      },
                    }}
                    horizontalScrollbarOptions={{
                      trackOptions: {
                        backgroundColor: COLORS.panel,
                        foregroundColor: COLORS.border,
                      },
                    }}
                  >
                    {diffDocuments.map((document) => (
                      <box
                        key={document.key}
                        style={{
                          width: "100%",
                          height: Math.max(2, documentLineCount(document, diffLayout) + 1),
                          flexShrink: 0,
                        }}
                      >
                        <text
                          content={`◆ ${document.path}  ·  ${document.section}  ·  ${document.filetype.toUpperCase()}`}
                          style={{ fg: COLORS.git, bg: COLORS.panelRaised }}
                        />
                        {document.unifiedLineCount && diffLayout === "inline" ? (
                          document.inlineRows.map((row) => (
                            <InlineDiffLine key={row.key} row={row} filetype={document.filetype} />
                          ))
                        ) : document.unifiedLineCount ? (
                          <diff
                            diff={document.source}
                            filetype={document.filetype}
                            syntaxStyle={DIFF_SYNTAX_STYLE}
                            view={diffLayout === "split" ? "split" : "unified"}
                            syncScroll={diffLayout === "split"}
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
                            style={{
                              width: "100%",
                              height: documentLineCount(document, diffLayout),
                              flexShrink: 0,
                            }}
                          />
                        ) : (
                          <text
                            content="Alteração binária ou sem linhas textuais."
                            style={{ fg: COLORS.muted }}
                          />
                        )}
                      </box>
                    ))}
                  </scrollbox>
                ) : (
                  <text
                    content="Selecione uma alteração para ver o diff."
                    style={{ fg: COLORS.muted }}
                  />
                )}
                <PlasmaLoadingOverlay
                  active={view !== "graph" && view !== "log" && (diffLoading || commitLoading)}
                  label="◌ MONTANDO PREVIEW"
                  accent={COLORS.git}
                  background={LAYOUT.alternatePanel}
                />
              </box>

              {busy || error || message ? (
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
                style={{
                  height: 1,
                  flexShrink: 0,
                  flexDirection: "row",
                  overflow: "hidden",
                  backgroundColor: COLORS.panelRaised,
                  zIndex: 20,
                }}
              >
                {view === "graph" || view === "log" ? (
                  <>
                    <InlineButton
                      label={gitActionLabel(compactPreviewActions, "[K/↑] ‹")}
                      accent={COLORS.git}
                      disabled={selectedCommitIndex === 0}
                      onPress={() => setSelectedCommitIndex((current) => Math.max(0, current - 1))}
                    />
                    <InlineButton
                      label={gitActionLabel(compactPreviewActions, "[J/↓] ›")}
                      accent={COLORS.git}
                      disabled={selectedCommitIndex >= (snapshot?.commits.length ?? 1) - 1}
                      onPress={() =>
                        setSelectedCommitIndex((current) =>
                          Math.min((snapshot?.commits.length ?? 1) - 1, current + 1),
                        )
                      }
                    />
                    <InlineButton
                      label={gitActionLabel(compactPreviewActions, "[↵] Abrir")}
                      accent={COLORS.git}
                      disabled={!selectedCommit}
                      onPress={() => setView("commit")}
                    />
                    <InlineButton
                      label={gitActionLabel(compactPreviewActions, "[D] Diff")}
                      accent={COLORS.git}
                      onPress={() => setView("diff")}
                    />
                    <InlineButton
                      label={gitActionLabel(
                        compactPreviewActions,
                        view === "graph" ? "[O] Lista" : "[G] Árvore",
                      )}
                      accent={COLORS.database}
                      onPress={() => setView(view === "graph" ? "log" : "graph")}
                    />
                  </>
                ) : (
                  <>
                    {view === "diff" ? (
                      <>
                        <InlineButton
                          label={gitActionLabel(compactPreviewActions, "[␠] Stage")}
                          accent={COLORS.git}
                          disabled={!selectedFile || busy}
                          onPress={() => void runStageAction(false)}
                        />
                        <InlineButton
                          label={gitActionLabel(compactPreviewActions, "[A] Todos")}
                          accent={COLORS.git}
                          disabled={!snapshot?.files.length || busy}
                          onPress={() => void runStageAction(true)}
                        />
                      </>
                    ) : null}
                    <InlineButton
                      label={gitActionLabel(compactPreviewActions, "[G] Árvore")}
                      accent={COLORS.database}
                      onPress={() => setView("graph")}
                    />
                    <InlineButton
                      label={gitActionLabel(compactPreviewActions, "[O] Log")}
                      accent={COLORS.git}
                      onPress={() => setView("log")}
                    />
                    {view === "commit" ? (
                      <InlineButton
                        label={gitActionLabel(compactPreviewActions, "[D] Diff")}
                        accent={COLORS.git}
                        onPress={() => setView("diff")}
                      />
                    ) : null}
                  </>
                )}
                <InlineButton
                  id="git-base-refresh"
                  label={gitActionLabel(compactPreviewActions, "[R] Sync")}
                  accent={COLORS.git}
                  disabled={loading}
                  onPress={() => void refresh()}
                />
              </box>
            </box>
          ) : null}
        </box>
      )}
      <PlasmaLoadingOverlay
        active={loading && !snapshot}
        label="CARREGANDO REPOSITÓRIO…"
        accent={COLORS.git}
        background={COLORS.canvas}
      />
      <ShortcutText
        id="git-base-shortcut-footer"
        content={translateUi(
          gitBaseShortcutHint(terminal.width, view === "log" || view === "graph"),
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
