import type { SelectRenderable } from "@opentui/core"
import { useKeyboard, useTerminalDimensions } from "@opentui/react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  loadGitDiff,
  loadGitSnapshot,
  toggleGitFile,
  type GitFile,
  type GitSnapshot,
} from "../git"
import { COLORS } from "../theme"

const LOADING_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]
const FILES_PANEL_WIDTH = 31

function fileMarker(file: GitFile) {
  if (file.untracked) return "?"
  if (file.staged && file.unstaged) return "◐"
  if (file.staged) return "●"
  return "○"
}

function fileCode(file: GitFile) {
  if (file.untracked) return "??"
  return `${file.indexStatus}${file.worktreeStatus}`
}

function fitLine(line: string, width: number) {
  const clean = line.replace(/\t/g, "  ").replace(/\r/g, "")
  if (clean.length <= width) return clean
  return `${clean.slice(0, Math.max(0, width - 1))}…`
}

function diffColor(line: string) {
  if (line.startsWith("+") && !line.startsWith("+++")) return COLORS.success
  if (line.startsWith("-") && !line.startsWith("---")) return COLORS.danger
  if (line.startsWith("@@")) return COLORS.database
  if (line.startsWith("──")) return COLORS.warning
  if (line.startsWith("diff ") || line.startsWith("index ")) return COLORS.muted
  return COLORS.text
}

export function GitViewer({ active }: { active: boolean }) {
  const terminal = useTerminalDimensions()
  const fileListRef = useRef<SelectRenderable | null>(null)
  const [snapshot, setSnapshot] = useState<GitSnapshot | null>(null)
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [diff, setDiff] = useState("")
  const [view, setView] = useState<"diff" | "log">("diff")
  const [diffOffset, setDiffOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [diffLoading, setDiffLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [motionFrame, setMotionFrame] = useState(0)

  const selectedFile = useMemo(
    () => snapshot?.files.find((file) => file.path === selectedPath) ?? null,
    [selectedPath, snapshot],
  )

  const fileOptions = useMemo(
    () =>
      (snapshot?.files ?? []).map((file) => ({
        name: `${fileMarker(file)} ${fileCode(file)} ${file.path}`,
        description: "",
        value: file.path,
      })),
    [snapshot],
  )

  const visibleHeight = Math.max(5, terminal.height - 12)
  const previewWidth = Math.max(24, terminal.width - FILES_PANEL_WIDTH - 9)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const nextSnapshot = await loadGitSnapshot()
      setSnapshot(nextSnapshot)
      setSelectedPath((current) => {
        if (current && nextSnapshot.files.some((file) => file.path === current)) {
          return current
        }
        return nextSnapshot.files[0]?.path ?? null
      })
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Não foi possível carregar o repositório.",
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (active && snapshot?.isRepository) fileListRef.current?.focus()
  }, [active, snapshot?.isRepository])

  useEffect(() => {
    if (!message) return
    const timeout = setTimeout(() => setMessage(null), 2200)
    return () => clearTimeout(timeout)
  }, [message])

  useEffect(() => {
    if ((!loading && !diffLoading && !busy)) {
      setMotionFrame(0)
      return
    }

    const interval = setInterval(() => {
      setMotionFrame((current) => (current + 1) % LOADING_FRAMES.length)
    }, 80)
    return () => clearInterval(interval)
  }, [busy, diffLoading, loading])

  useEffect(() => {
    setDiffOffset(0)
    if (!snapshot?.root || !selectedFile) {
      setDiff("")
      return
    }

    let cancelled = false
    setDiffLoading(true)
    void loadGitDiff(snapshot.root, selectedFile)
      .then((nextDiff) => {
        if (!cancelled) setDiff(nextDiff)
      })
      .catch((loadError: unknown) => {
        if (!cancelled) {
          setDiff(
            loadError instanceof Error
              ? loadError.message
              : "Não foi possível carregar o diff.",
          )
        }
      })
      .finally(() => {
        if (!cancelled) setDiffLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [selectedFile, snapshot?.root])

  const toggleSelectedFile = useCallback(async () => {
    if (!snapshot?.root || !selectedFile || busy) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const nextMessage = await toggleGitFile(snapshot.root, selectedFile)
      setMessage(nextMessage)
      await refresh()
    } catch (toggleError) {
      setError(
        toggleError instanceof Error
          ? toggleError.message
          : "Não foi possível alterar o stage.",
      )
    } finally {
      setBusy(false)
    }
  }, [busy, refresh, selectedFile, snapshot?.root])

  const maxDiffOffset = Math.max(0, diff.split("\n").length - visibleHeight)

  useKeyboard((key) => {
    if (!active) return

    switch (key.name) {
      case "r":
        void refresh()
        break
      case "space":
        key.preventDefault()
        void toggleSelectedFile()
        break
      case "d":
        setView("diff")
        break
      case "l":
        setView("log")
        break
      case "[":
      case "left":
        setDiffOffset((current) => Math.max(0, current - 5))
        break
      case "]":
      case "right":
        setDiffOffset((current) => Math.min(maxDiffOffset, current + 5))
        break
    }
  })

  const previewLines = diff
    .split("\n")
    .slice(diffOffset, diffOffset + visibleHeight)

  return (
    <box
      style={{
        flexGrow: 1,
        backgroundColor: COLORS.canvas,
        padding: 1,
        gap: 1,
      }}
    >
      <box
        style={{
          border: true,
          borderStyle: "rounded",
          borderColor: COLORS.border,
          backgroundColor: COLORS.panel,
          paddingLeft: 1,
          paddingRight: 1,
          flexDirection: "row",
          justifyContent: "space-between",
        }}
      >
        <text
          content={
            snapshot?.isRepository
              ? `◆ ${snapshot.repositoryName}  /  ${snapshot.branch}`
              : "◆ GIT WORKSPACE"
          }
          style={{ fg: COLORS.git }}
        />
        <text
          content={
            loading
              ? `${LOADING_FRAMES[motionFrame]} ATUALIZANDO`
              : snapshot?.isRepository
                ? `${snapshot.files.length} ALTERAÇÕES  ↑${snapshot.ahead} ↓${snapshot.behind}`
                : "◇ FORA DE UM REPOSITÓRIO"
          }
          style={{ fg: loading ? COLORS.git : COLORS.muted }}
        />
      </box>

      {!loading && snapshot && !snapshot.isRepository ? (
        <box
          style={{
            flexGrow: 1,
            border: true,
            borderStyle: "rounded",
            borderColor: COLORS.border,
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
          <text
            content={snapshot.launchDirectory}
            style={{ fg: COLORS.git }}
          />
        </box>
      ) : (
        <box style={{ flexGrow: 1, flexDirection: "row", gap: 1 }}>
          <box
            style={{
              width: FILES_PANEL_WIDTH,
              border: true,
              borderStyle: "rounded",
              borderColor: COLORS.border,
              backgroundColor: COLORS.panel,
              paddingLeft: 1,
              paddingRight: 1,
            }}
          >
            <text
              content={`ARQUIVOS  ${snapshot?.files.length ?? 0}`}
              style={{ fg: COLORS.git }}
            />
            {fileOptions.length ? (
              <select
                ref={fileListRef}
                id="git-file-list"
                options={fileOptions}
                selectedIndex={Math.max(
                  0,
                  snapshot?.files.findIndex((file) => file.path === selectedPath) ?? 0,
                )}
                onChange={(_index, option) => {
                  if (typeof option?.value === "string") {
                    setSelectedPath(option.value)
                    setView("diff")
                  }
                }}
                showDescription={false}
                showScrollIndicator
                wrapSelection
                style={{
                  width: FILES_PANEL_WIDTH - 4,
                  height: visibleHeight + 1,
                  backgroundColor: COLORS.panel,
                  focusedBackgroundColor: COLORS.panel,
                  textColor: COLORS.muted,
                  focusedTextColor: COLORS.text,
                  selectedBackgroundColor: COLORS.panelRaised,
                  selectedTextColor: COLORS.git,
                }}
              />
            ) : (
              <box style={{ flexGrow: 1, justifyContent: "center" }}>
                <text content="✓ Working tree limpo" style={{ fg: COLORS.success }} />
              </box>
            )}
          </box>

          <box
            style={{
              flexGrow: 1,
              border: true,
              borderStyle: "rounded",
              borderColor: COLORS.border,
              backgroundColor: COLORS.panel,
              paddingLeft: 1,
              paddingRight: 1,
            }}
          >
            <box style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <text
                content={view === "diff" ? "DIFF" : "COMMITS RECENTES"}
                style={{ fg: COLORS.git }}
              />
              <text
                content={
                  view === "diff"
                    ? selectedFile
                      ? fileCode(selectedFile)
                      : "—"
                    : snapshot?.upstream ?? "sem upstream"
                }
                style={{ fg: COLORS.muted }}
              />
            </box>

            <box style={{ flexGrow: 1 }}>
              {view === "log" ? (
                (snapshot?.commits.length ?? 0) > 0 ? (
                  snapshot?.commits.slice(0, visibleHeight).map((commit) => (
                    <text
                      key={commit.hash}
                      content={fitLine(
                        `${commit.hash}  ${commit.subject}  · ${commit.age}`,
                        previewWidth,
                      )}
                      style={{ fg: COLORS.text }}
                    />
                  ))
                ) : (
                  <text content="Este branch ainda não possui commits." style={{ fg: COLORS.muted }} />
                )
              ) : diffLoading ? (
                <text
                  content={`${LOADING_FRAMES[motionFrame]} MONTANDO PREVIEW`}
                  style={{ fg: COLORS.git }}
                />
              ) : selectedFile ? (
                previewLines.map((line, index) => (
                  <text
                    key={`${diffOffset}-${index}`}
                    content={fitLine(line, previewWidth)}
                    style={{ fg: diffColor(line) }}
                  />
                ))
              ) : (
                <text content="Selecione uma alteração para ver o diff." style={{ fg: COLORS.muted }} />
              )}
            </box>

            <text
              content={fitLine(
                busy
                  ? `${LOADING_FRAMES[motionFrame]} APLICANDO ALTERAÇÃO`
                  : error ?? message ?? "[␠] STG  [D/L] VIEW  [←/→] ROL  [R] SYNC",
                previewWidth,
              )}
              style={{
                fg: error
                  ? COLORS.danger
                  : busy
                    ? COLORS.git
                    : message
                      ? COLORS.success
                      : COLORS.muted,
              }}
            />
          </box>
        </box>
      )}
    </box>
  )
}
