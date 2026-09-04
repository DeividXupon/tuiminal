import type { ScrollBoxRenderable, SelectRenderable } from "@opentui/core"
import { useKeyboard, useTerminalDimensions } from "@opentui/react"
import { Button } from "@tuiparts/react/button"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { COLORS, LAYOUT, panelBorder } from "../../core/settings/theme"
import { InlineButton } from "../../shared/ui/InlineButton"
import { handleSelectMouseDown, handleSelectMouseScroll } from "../../shared/ui/selectMouse"
import type { DiffLayout, NarrowGitPane, ViewMode } from "./model/view"
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
  FILE_OPTION_PREFIX,
  FOLDER_OPTION_PREFIX,
  fileOptionValue,
} from "./rendering/file-tree"
import { commitTitle, gitSnapshotSignature } from "./rendering/presentation"
import {
  type GitFile,
  type GitSnapshot,
  loadCommitDiff,
  loadGitDiff,
  loadGitSnapshot,
  toggleAllGitFiles,
  toggleGitFile,
} from "./services/git"

export function GitBaseWorkspace({
  active,
  refreshRequest = 0,
}: {
  active: boolean
  refreshRequest?: number
}) {
  const terminal = useTerminalDimensions()
  const narrowGit = terminal.width < 78
  const fileListRef = useRef<SelectRenderable | null>(null)
  const diffScrollRef = useRef<ScrollBoxRenderable | null>(null)
  const loadedDiffTargetRef = useRef<string | null>(null)
  const refreshInFlightRef = useRef<Promise<void> | null>(null)
  const snapshotSignatureRef = useRef<string | null>(null)
  const selectedPathRef = useRef<string | null>(null)
  const viewRef = useRef<ViewMode>("diff")
  const [snapshot, setSnapshot] = useState<GitSnapshot | null>(null)
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [selectedTreeValue, setSelectedTreeValue] = useState<string | null>(null)
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(() => new Set())
  const [selectedCommitIndex, setSelectedCommitIndex] = useState(0)
  const [diff, setDiff] = useState("")
  const [commitDiff, setCommitDiff] = useState("")
  const [view, setView] = useState<ViewMode>("diff")
  const [diffLayout, setDiffLayout] = useState<DiffLayout>("unified")
  const [diffOffset, setDiffOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [diffLoading, setDiffLoading] = useState(false)
  const [commitLoading, setCommitLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [motionFrame, setMotionFrame] = useState(0)
  const [refreshSequence, setRefreshSequence] = useState(0)
  const [narrowPane, setNarrowPane] = useState<NarrowGitPane>("files")
  selectedPathRef.current = selectedPath
  viewRef.current = view
  const selectedFile = useMemo(
    () => snapshot?.files.find((file) => file.path === selectedPath) ?? null,
    [selectedPath, snapshot],
  )
  const selectedFilePath = selectedFile?.path
  const selectedFileIndexStatus = selectedFile?.indexStatus
  const selectedFileWorktreeStatus = selectedFile?.worktreeStatus
  const selectedFileStaged = selectedFile?.staged
  const selectedFileUnstaged = selectedFile?.unstaged
  const selectedFileUntracked = selectedFile?.untracked
  const diffTarget = useMemo<GitFile | null>(() => {
    if (!selectedFilePath) return null
    return {
      path: selectedFilePath,
      indexStatus: selectedFileIndexStatus ?? " ",
      worktreeStatus: selectedFileWorktreeStatus ?? " ",
      staged: selectedFileStaged ?? false,
      unstaged: selectedFileUnstaged ?? false,
      untracked: selectedFileUntracked ?? false,
    }
  }, [
    selectedFileIndexStatus,
    selectedFilePath,
    selectedFileStaged,
    selectedFileUnstaged,
    selectedFileUntracked,
    selectedFileWorktreeStatus,
  ])
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
  const commitByHash = useMemo(
    () => new Map((snapshot?.commits ?? []).map((commit) => [commit.fullHash, commit])),
    [snapshot?.commits],
  )
  const estimatedMainHeight = Math.max(4, terminal.height - (narrowGit ? 10 : 8))
  const visibleHeight = Math.max(3, estimatedMainHeight - 5)
  const previewWidth = narrowGit
    ? Math.max(16, terminal.width - 6)
    : Math.max(24, terminal.width - FILES_PANEL_WIDTH - 9)
  const filesContentWidth = narrowGit ? Math.max(16, terminal.width - 8) : FILES_PANEL_WIDTH - 4
  const showMiniGraph = terminal.height >= 22
  const compactGraphHeight = showMiniGraph
    ? Math.max(5, Math.min(8, Math.floor(estimatedMainHeight * 0.4)))
    : 0
  const compactGraphRowLimit = Math.max(1, compactGraphHeight - 3)
  const fileTreeHeight = Math.max(2, estimatedMainHeight - compactGraphHeight - 3)

  const refresh = useCallback(async (showLoading = true) => {
    if (refreshInFlightRef.current) return refreshInFlightRef.current
    const operation = (async () => {
      if (showLoading) setLoading(true)
      setError(null)
      try {
        const nextSnapshot = await loadGitSnapshot()
        const nextSignature = gitSnapshotSignature(nextSnapshot)
        const snapshotChanged = snapshotSignatureRef.current !== nextSignature

        if (snapshotChanged) {
          snapshotSignatureRef.current = nextSignature
          setSnapshot(nextSnapshot)
          setRefreshSequence((current) => current + 1)
          setSelectedPath((current) => {
            if (current && nextSnapshot.files.some((file) => file.path === current)) {
              return current
            }
            return nextSnapshot.files[0]?.path ?? null
          })
          setSelectedCommitIndex((current) =>
            Math.min(current, Math.max(0, nextSnapshot.commits.length - 1)),
          )
        } else if (nextSnapshot.root && viewRef.current === "diff") {
          const selected = nextSnapshot.files.find((file) => file.path === selectedPathRef.current)
          if (selected) {
            const nextDiff = await loadGitDiff(nextSnapshot.root, selected)
            setDiff((current) => (current === nextDiff ? current : nextDiff))
          }
        }
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Não foi possível carregar o repositório.",
        )
      } finally {
        if (showLoading) setLoading(false)
      }
    })()
    refreshInFlightRef.current = operation
    try {
      await operation
    } finally {
      if (refreshInFlightRef.current === operation) refreshInFlightRef.current = null
    }
  }, [])
  useEffect(() => {
    if (!active || snapshot) return
    void refresh()
  }, [active, refresh, snapshot])
  useEffect(() => {
    if (active && refreshRequest > 0) void refresh(false)
  }, [active, refresh, refreshRequest])
  useEffect(() => {
    if (!active || !snapshot) return
    const interval = setInterval(() => void refresh(false), 8000)
    return () => clearInterval(interval)
  }, [active, refresh, snapshot])
  useEffect(() => {
    if (active && snapshot?.isRepository) fileListRef.current?.focus()
  }, [active, snapshot?.isRepository])

  useEffect(() => {
    if (!message) return
    const timeout = setTimeout(() => setMessage(null), 2200)
    return () => clearTimeout(timeout)
  }, [message])

  useEffect(() => {
    if (!active || (!loading && !diffLoading && !commitLoading && !busy)) {
      setMotionFrame(0)
      return
    }

    const interval = setInterval(() => {
      setMotionFrame((current) => (current + 1) % LOADING_FRAMES.length)
    }, 80)
    return () => clearInterval(interval)
  }, [active, busy, commitLoading, diffLoading, loading])

  useEffect(() => {
    if (!active) return
    void refreshSequence
    const root = snapshot?.root
    if (!root || !diffTarget) {
      loadedDiffTargetRef.current = null
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
        if (!cancelled) setDiff(nextDiff)
      })
      .catch((loadError: unknown) => {
        if (!cancelled) {
          setDiff(
            loadError instanceof Error ? loadError.message : "Não foi possível carregar o diff.",
          )
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
    [busy, refresh, selectedFile, selectedTreeValue, snapshot],
  )

  const activeDiff = view === "commit" ? commitDiff : diff
  const parsedDiff = useMemo(() => parseUnifiedDiff(activeDiff), [activeDiff])
  const diffDocuments = useMemo(
    () => parseDiffDocuments(activeDiff, view === "diff" ? selectedFile?.path : undefined),
    [activeDiff, selectedFile?.path, view],
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
  const compactGraphRows = graphRows.slice(0, compactGraphRowLimit)
  const compactGraphColumnWidth = Math.min(
    8,
    Math.max(3, ...compactGraphRows.map((row) => formatGraph(row.graph).length)),
  )
  const fullGraphColumnWidth = Math.min(
    14,
    Math.max(3, ...visibleGraphRows.map((row) => formatGraph(row.graph).length)),
  )

  useEffect(() => {
    diffScrollRef.current?.scrollTo({ x: 0, y: diffOffset })
  }, [diffOffset])

  useKeyboard((key) => {
    if (!active) return

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
        if (narrowGit) setNarrowPane("preview")
        setDiffOffset(0)
        break
      case "l":
        setView("log")
        if (narrowGit) setNarrowPane("preview")
        setDiffOffset(0)
        break
      case "g":
        setView((current) => (current === "graph" ? "diff" : "graph"))
        if (narrowGit) setNarrowPane("preview")
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
      case "n":
        if (view === "log" || view === "graph") {
          setSelectedCommitIndex((current) =>
            Math.min((snapshot?.commits.length ?? 1) - 1, current + 1),
          )
        }
        break
      case "p":
        if (view === "log" || view === "graph") {
          setSelectedCommitIndex((current) => Math.max(0, current - 1))
        }
        break
      case "return":
      case "enter":
      case "linefeed":
        if ((view === "log" || view === "graph") && selectedCommit) {
          setView("commit")
          if (narrowGit) setNarrowPane("preview")
        }
        break
      case "tab":
        if (narrowGit) {
          key.preventDefault()
          setNarrowPane((current) => {
            const next = current === "files" ? "preview" : "files"
            setTimeout(() => {
              if (next === "files") fileListRef.current?.focus()
              else diffScrollRef.current?.focus()
            }, 0)
            return next
          })
        }
        break
      case "[":
      case "left":
        if (view !== "log" && view !== "graph") {
          setDiffOffset((current) => Math.max(0, current - 5))
        }
        break
      case "]":
      case "right":
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
      ? `${Math.min(selectedCommitIndex + 1, snapshot?.commits.length ?? 0)}/${snapshot?.commits.length ?? 0}  [N/P]`
      : `+${additions}  −${deletions}  ${Math.min(diffOffset + 1, Math.max(1, diffRowCount))}/${Math.max(1, diffRowCount)}`
  return (
    <box
      style={{
        flexGrow: 1,
        backgroundColor: COLORS.canvas,
        padding: LAYOUT.outerPadding,
        gap: LAYOUT.gap,
      }}
    >
      <box
        key={LAYOUT.compact ? "git-header-compact" : "git-header-framed"}
        style={{
          ...panelBorder(),
          backgroundColor: COLORS.panel,
          paddingLeft: 1,
          paddingRight: 1,
          flexDirection: "row",
          justifyContent: "space-between",
        }}
      >
        <text
          content={fitLine(
            snapshot?.isRepository
              ? `◆ ${snapshot.repositoryName}  /  ${snapshot.branch}`
              : "◆ GIT WORKSPACE",
            narrowGit ? Math.max(12, terminal.width - 20) : Math.max(24, terminal.width - 38),
          )}
          style={{ fg: COLORS.git }}
        />
        <text
          content={
            loading
              ? `${LOADING_FRAMES[motionFrame]} ATUALIZANDO`
              : snapshot?.isRepository
                ? narrowGit
                  ? `●${stagedCount} ○${unstagedCount}`
                  : `${snapshot.files.length} ALT  ●${stagedCount} ○${unstagedCount}  ↑${snapshot.ahead} ↓${snapshot.behind}`
                : "◇ FORA DE UM REPOSITÓRIO"
          }
          style={{ fg: loading ? COLORS.git : COLORS.muted }}
        />
      </box>

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
          {narrowGit ? (
            <box
              style={{
                height: 1,
                flexShrink: 0,
                flexDirection: "row",
                backgroundColor: COLORS.panel,
                marginBottom: LAYOUT.headerSpacing,
              }}
            >
              <InlineButton
                label="[Tab] Arquivos"
                accent={COLORS.git}
                active={narrowPane === "files"}
                onPress={() => {
                  setNarrowPane("files")
                  setTimeout(() => fileListRef.current?.focus(), 0)
                }}
              />
              <InlineButton
                label="[Tab] Preview"
                accent={COLORS.git}
                active={narrowPane === "preview"}
                onPress={() => setNarrowPane("preview")}
              />
              <text content=" · um painel por vez" style={{ fg: COLORS.muted }} />
            </box>
          ) : null}
          {!narrowGit || narrowPane === "files" ? (
            <box
              key={LAYOUT.compact ? "git-files-compact" : "git-files-framed"}
              style={{
                width: narrowGit ? "100%" : FILES_PANEL_WIDTH,
                flexGrow: narrowGit ? 1 : 0,
                ...panelBorder(active ? COLORS.git : COLORS.border),
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
                <select
                  ref={fileListRef}
                  id="git-file-list"
                  options={fileOptions}
                  selectedIndex={selectedTreeIndex}
                  onChange={(_index, option) => {
                    if (typeof option?.value === "string") {
                      setSelectedTreeValue(option.value)
                      if (option.value.startsWith(FILE_OPTION_PREFIX)) {
                        setSelectedPath(option.value.slice(FILE_OPTION_PREFIX.length))
                        setView("diff")
                      }
                    }
                  }}
                  onSelect={(_index, option) => {
                    if (
                      narrowGit &&
                      typeof option?.value === "string" &&
                      option.value.startsWith(FILE_OPTION_PREFIX)
                    ) {
                      setNarrowPane("preview")
                      return
                    }
                    if (
                      view !== "diff" ||
                      typeof option?.value !== "string" ||
                      !option.value.startsWith(FOLDER_OPTION_PREFIX)
                    ) {
                      return
                    }
                    const folder = option.value.slice(FOLDER_OPTION_PREFIX.length)
                    setCollapsedFolders((current) => {
                      const next = new Set(current)
                      if (next.has(folder)) next.delete(folder)
                      else next.add(folder)
                      return next
                    })
                  }}
                  onMouseDown={(event) =>
                    handleSelectMouseDown(event, fileListRef.current, {
                      optionCount: fileOptions.length,
                      activateOnClick: true,
                    })
                  }
                  onMouseScroll={(event) => handleSelectMouseScroll(event, fileListRef.current)}
                  showDescription={false}
                  showScrollIndicator
                  wrapSelection
                  style={{
                    width: filesContentWidth,
                    height: fileTreeHeight,
                    backgroundColor: COLORS.panel,
                    focusedBackgroundColor: COLORS.panel,
                    textColor: COLORS.muted,
                    focusedTextColor: COLORS.text,
                    selectedBackgroundColor: COLORS.panelRaised,
                    selectedTextColor: COLORS.git,
                  }}
                />
              ) : (
                <box style={{ height: fileTreeHeight, justifyContent: "center" }}>
                  <text content="✓ Working tree limpo" style={{ fg: COLORS.success }} />
                </box>
              )}

              {showMiniGraph ? (
                <box
                  key={LAYOUT.compact ? "git-mini-graph-compact" : "git-mini-graph-framed"}
                  style={{
                    height: compactGraphHeight,
                    flexShrink: 0,
                    ...panelBorder(view === "graph" ? COLORS.database : COLORS.border),
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
                        setDiffOffset(0)
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
                          onPress={() => {
                            if (row.commitHash) selectCommitByHash(row.commitHash)
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
                                Math.max(4, filesContentWidth - compactGraphColumnWidth - 6),
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
            <box
              key={LAYOUT.compact ? "git-preview-compact" : "git-preview-framed"}
              style={{
                flexGrow: 1,
                ...panelBorder(),
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
                        label="Unificado"
                        accent={COLORS.database}
                        active={diffLayout === "unified"}
                        onPress={() => {
                          setDiffLayout("unified")
                          setDiffOffset(0)
                        }}
                      />
                      <InlineButton
                        label="2 colunas"
                        accent={COLORS.database}
                        active={diffLayout === "split"}
                        onPress={() => {
                          setDiffLayout("split")
                          setDiffOffset(0)
                        }}
                      />
                      <InlineButton
                        label="Intralinha"
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
                  event.preventDefault()
                  event.stopPropagation()
                }}
                style={{ flexGrow: 1 }}
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
                          onPress={() => {
                            if (row.commitHash) selectCommitByHash(row.commitHash)
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
                          onPress={() => setSelectedCommitIndex(index)}
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
                ) : diffLoading || commitLoading ? (
                  <text
                    content={`${LOADING_FRAMES[motionFrame]} MONTANDO PREVIEW`}
                    style={{ fg: COLORS.git }}
                  />
                ) : (selectedFile || view === "commit") && diffDocuments.length ? (
                  <scrollbox
                    ref={diffScrollRef}
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
              ) : (
                <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
                  {view === "graph" || view === "log" ? (
                    <>
                      <InlineButton
                        label="[P] ‹"
                        accent={COLORS.git}
                        disabled={selectedCommitIndex === 0}
                        onPress={() =>
                          setSelectedCommitIndex((current) => Math.max(0, current - 1))
                        }
                      />
                      <InlineButton
                        label="[N] ›"
                        accent={COLORS.git}
                        disabled={selectedCommitIndex >= (snapshot?.commits.length ?? 1) - 1}
                        onPress={() =>
                          setSelectedCommitIndex((current) =>
                            Math.min((snapshot?.commits.length ?? 1) - 1, current + 1),
                          )
                        }
                      />
                      <InlineButton
                        label="[↵] Abrir"
                        accent={COLORS.git}
                        disabled={!selectedCommit}
                        onPress={() => setView("commit")}
                      />
                      <InlineButton
                        label="[D] Diff"
                        accent={COLORS.git}
                        onPress={() => setView("diff")}
                      />
                      <InlineButton
                        label={view === "graph" ? "[L] Lista" : "[G] Árvore"}
                        accent={COLORS.database}
                        onPress={() => setView(view === "graph" ? "log" : "graph")}
                      />
                    </>
                  ) : (
                    <>
                      {view === "diff" ? (
                        <>
                          <InlineButton
                            label="[␠] Stage"
                            accent={COLORS.git}
                            disabled={!selectedFile || busy}
                            onPress={() => void runStageAction(false)}
                          />
                          <InlineButton
                            label="[A] Todos"
                            accent={COLORS.git}
                            disabled={!snapshot?.files.length || busy}
                            onPress={() => void runStageAction(true)}
                          />
                        </>
                      ) : null}
                      <InlineButton
                        label="[G] Árvore"
                        accent={COLORS.database}
                        onPress={() => setView("graph")}
                      />
                      <InlineButton
                        label="[L] Log"
                        accent={COLORS.git}
                        onPress={() => setView("log")}
                      />
                      {view === "commit" ? (
                        <InlineButton
                          label="[D] Diff"
                          accent={COLORS.git}
                          onPress={() => setView("diff")}
                        />
                      ) : null}
                    </>
                  )}
                  <InlineButton
                    label="[R] Sync"
                    accent={COLORS.git}
                    disabled={loading}
                    onPress={() => void refresh()}
                  />
                </box>
              )}
            </box>
          ) : null}
        </box>
      )}
    </box>
  )
}
