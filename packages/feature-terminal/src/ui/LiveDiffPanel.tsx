import {
  type BoxRenderable,
  type DiffRenderable,
  pathToFiletype,
  type ScrollBoxRenderable,
} from "@opentui/core"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { BRAND_COLOR } from "@xupon/tuiminal-core/ui/brand"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { NativeDiff } from "@xupon/tuiminal-core/ui/NativeDiff"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useLiveDiffFocus } from "../hooks/use-live-diff-focus"
import { useLiveDiffKeyboard } from "../hooks/use-live-diff-keyboard"
import { useLiveDiffPatch } from "../hooks/use-live-diff-patch"
import { useLiveDiffProjects } from "../hooks/use-live-diff-projects"
import { useRenderableFocus } from "../hooks/use-renderable-focus"
import { descendantProcesses } from "../model/agent-detection"
import { type LiveDiffFile, mergeLiveDiffFiles } from "../model/live-diff"
import { liveDiffUnwrappedHeight, liveDiffWrappedHeight } from "../rendering/live-diff-table"
import { terminalShortcutColor } from "../rendering/terminal-shortcut"
import { readTerminalProcesses } from "../services/agent-processes"
import {
  liveDiffRepositoryRoot,
  liveDiffWorktrees,
  readProcessDirectories,
} from "../services/live-diff"
import { collectLiveDiffSnapshot } from "../services/live-diff-snapshot"
import { LiveDiffFileTable } from "./LiveDiffFileTable"
import { LiveDiffInfo } from "./LiveDiffInfo"

const POLL_MS = 250
const DISCOVERY_MS = 2000
const DISCOVERY_ROUNDS = Math.max(1, Math.ceil(DISCOVERY_MS / POLL_MS))
const MAX_ROOTS = 4

const fileKey = (file: Pick<LiveDiffFile, "root" | "path">) => `${file.root}\0${file.path}`

function liveDiffPreviewGeometry(
  codeFocused: boolean,
  stacked: boolean,
  coversTerminal: boolean,
  stableContentWidth: number,
) {
  if (!codeFocused || coversTerminal) return { left: 0, width: "100%" as const }
  return {
    left: stacked ? 0 : -30,
    width: stableContentWidth + 30,
  }
}

type LiveDiffColors = Pick<
  typeof COLORS,
  "canvas" | "diffAddedBg" | "diffGutterBg" | "diffRecentBg" | "diffRemovedBg" | "panel"
>

function decoratedLineColors(
  patch: string,
  highlightedLines: ReadonlySet<number>,
  separatorLines: ReadonlySet<number>,
  colors: LiveDiffColors,
) {
  const result = new Map<number, { gutter: string; content: string }>()
  let inHunk = false
  let codeLine = 0
  for (const text of patch.split("\n")) {
    if (text.startsWith("@@ ")) {
      inHunk = true
      continue
    }
    if (!inHunk) continue
    const marker = text[0]
    if (marker === "+")
      result.set(codeLine++, { gutter: colors.diffAddedBg, content: colors.diffAddedBg })
    else if (marker === "-")
      result.set(codeLine++, { gutter: colors.diffRemovedBg, content: colors.diffRemovedBg })
    else if (marker === " ")
      result.set(codeLine++, { gutter: colors.diffGutterBg, content: colors.panel })
  }
  for (const line of separatorLines)
    result.set(line, { gutter: colors.canvas, content: colors.canvas })
  for (const line of highlightedLines)
    result.set(line, { gutter: colors.diffRecentBg, content: colors.diffRecentBg })
  return result
}

async function updateSnapshot(
  roots: readonly string[],
  filesRef: { current: LiveDiffFile[] },
  observedRoots: Set<string>,
  signal: AbortSignal,
  warning: string,
  setFiles: (files: LiveDiffFile[]) => void,
  setLastProject: (root: string) => void,
  setError: (message: string) => void,
) {
  if (!roots.length) return
  const snapshot = await collectLiveDiffSnapshot(roots, filesRef.current, signal)
  if (signal.aborted) return
  if (snapshot.changedRoot) setLastProject(snapshot.changedRoot)
  if (snapshot.changed) {
    const merged = mergeLiveDiffFiles(filesRef.current, snapshot.files, Date.now(), observedRoots)
    filesRef.current = merged
    setFiles(merged)
  }
  for (const root of roots) observedRoots.add(root)
  setError(
    snapshot.failed
      ? translateUi("Atualização parcial do Live Diff.")
      : snapshot.truncated
        ? translateUi("Live Diff limitado aos primeiros 1000 arquivos.")
        : warning,
  )
}

export function LiveDiffPanel({
  sessionId,
  agentKey,
  initialDirectory,
  manualDirectories,
  running,
  active,
  fileTableHeight,
  stableContentWidth,
  stacked,
  coversTerminal,
  focusRequest,
  onClose,
  onAddProject,
  onActivateSession,
  onReturnTerminal,
}: {
  sessionId: string
  agentKey: string
  initialDirectory: string
  manualDirectories: readonly string[]
  running: boolean
  active: boolean
  fileTableHeight: number
  stableContentWidth: number
  stacked: boolean
  coversTerminal: boolean
  onClose: (id: string) => void
  onAddProject: (id: string, roots: readonly string[]) => void
  focusRequest: number
  onActivateSession: () => void
  onReturnTerminal: () => void
}) {
  const panel = useRef<BoxRenderable | null>(null)
  const preview = useRef<ScrollBoxRenderable | null>(null)
  const diff = useRef<DiffRenderable | null>(null)
  const [processDirectories, setProcessDirectories] = useState<string[]>([])
  const [roots, setRoots] = useState<string[]>([])
  const [files, setFiles] = useState<LiveDiffFile[]>([])
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [lastProject, setLastProject] = useState("")
  const [now, setNow] = useState(Date.now())
  const [previewWidth, setPreviewWidth] = useState(80)
  const [snapshotReady, setSnapshotReady] = useState(false)
  const showDiffAuto = selectedKey === null
  const rootsRef = useRef<string[]>([])
  const filesRef = useRef<LiveDiffFile[]>([])
  const observedRoots = useRef(new Set<string>())
  const directoryRef = useRef<string[]>([])
  directoryRef.current = [initialDirectory, ...manualDirectories, ...processDirectories]
  useLiveDiffFocus(panel, focusRequest)
  const panelFocused = useRenderableFocus(panel)
  const codeFocused = useRenderableFocus(preview)
  const shortcutColor = terminalShortcutColor(active, panelFocused || codeFocused)

  useEffect(() => {
    if (!running) return
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    const inspect = async () => {
      try {
        const processes = await readTerminalProcesses(controller.signal)
        const agentPid = Number(agentKey.split(":", 1)[0])
        const pids = descendantProcesses(agentPid, processes).map((process) => process.pid)
        const directories = await readProcessDirectories(pids, controller.signal)
        if (!controller.signal.aborted) {
          setProcessDirectories((previous) =>
            previous.join("\0") === directories.join("\0") ? previous : directories,
          )
        }
      } catch {
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(() => void inspect(), DISCOVERY_MS)
      }
    }
    void inspect()
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [agentKey, running])

  useEffect(() => {
    if (!running) return
    const controller = new AbortController()
    let busy = false
    let scans = 0
    let discoveryWarning = ""
    const discover = async () => {
      const candidates = await Promise.all(
        directoryRef.current.map((directory) =>
          liveDiffRepositoryRoot(directory, controller.signal),
        ),
      )
      const direct = [...new Set(candidates.filter((root): root is string => Boolean(root)))]
      discoveryWarning = manualDirectories.some((_, index) => !candidates[index + 1])
        ? translateUi("Projeto adicionado não é um repositório Git.")
        : ""
      const linked = await Promise.all(
        direct.map((root) => liveDiffWorktrees(root, controller.signal).catch(() => [])),
      )
      const next = [...new Set([...direct, ...linked.flat()])].slice(0, MAX_ROOTS)
      if (controller.signal.aborted) return
      if (next.join("\0") !== rootsRef.current.join("\0")) {
        rootsRef.current = next
        setRoots(next)
      }
      if (!next.length && directoryRef.current.length > 0) {
        filesRef.current = []
        setFiles([])
        setError(translateUi("Nenhum repositório Git observado."))
      }
    }
    const poll = async () => {
      if (busy || controller.signal.aborted) return
      busy = true
      try {
        const shouldDiscover = scans++ % DISCOVERY_ROUNDS === 0
        if (shouldDiscover) await discover()
        await updateSnapshot(
          rootsRef.current,
          filesRef,
          observedRoots.current,
          controller.signal,
          discoveryWarning,
          setFiles,
          setLastProject,
          setError,
        )
        if (!controller.signal.aborted) setSnapshotReady(true)
      } catch {
        if (!controller.signal.aborted)
          setError(translateUi("Não foi possível atualizar o Live Diff."))
      } finally {
        busy = false
      }
    }
    void poll()
    const timer = setInterval(() => void poll(), POLL_MS)
    return () => {
      controller.abort()
      clearInterval(timer)
    }
  }, [manualDirectories, running])

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  const {
    hiddenRoots,
    visibleFiles,
    selectedProject,
    selectProject,
    toggleProject,
    selectProjectRelative,
  } = useLiveDiffProjects(roots, files)
  const selected = useMemo(
    () => visibleFiles.find((file) => fileKey(file) === selectedKey) ?? visibleFiles[0] ?? null,
    [visibleFiles, selectedKey],
  )
  const { patch, highlightedLines, separatorLines } = useLiveDiffPatch(
    selected,
    showDiffAuto,
    visibleFiles,
    snapshotReady,
    COLORS.text,
    preview,
    diff,
  )
  const { canvas, diffAddedBg, diffGutterBg, diffRecentBg, diffRemovedBg, panel: panelBg } = COLORS
  const diffAppearance = [
    canvas,
    diffAddedBg,
    diffGutterBg,
    diffRecentBg,
    diffRemovedBg,
    panelBg,
  ].join("\0")
  const lineColors = useMemo(() => {
    // COLORS is mutated in place when the palette changes; this key keeps the
    // complete native line-color map synchronized without rebuilding it per frame.
    void diffAppearance
    return decoratedLineColors(patch, highlightedLines, separatorLines, {
      canvas,
      diffAddedBg,
      diffGutterBg,
      diffRecentBg,
      diffRemovedBg,
      panel: panelBg,
    })
  }, [patch, highlightedLines, separatorLines, diffAppearance])
  useEffect(() => {
    if (selectedKey && !visibleFiles.some((file) => fileKey(file) === selectedKey))
      setSelectedKey(null)
  }, [visibleFiles, selectedKey])
  const selectFile = useCallback(
    (file: LiveDiffFile) => {
      setSelectedKey(
        fileKey(file) === (visibleFiles[0] && fileKey(visibleFiles[0])) ? null : fileKey(file),
      )
    },
    [visibleFiles],
  )
  const selectRelative = useCallback(
    (delta: number) => {
      if (!visibleFiles.length) return
      const index = Math.max(
        0,
        visibleFiles.findIndex((file) => selected && fileKey(file) === fileKey(selected)),
      )
      const next = visibleFiles[(index + delta + visibleFiles.length) % visibleFiles.length]
      if (next) selectFile(next)
    },
    [visibleFiles, selected, selectFile],
  )
  const activateDiffAuto = useCallback(() => {
    setSelectedKey(null)
    queueMicrotask(() => panel.current?.focus())
  }, [])
  useLiveDiffKeyboard({
    active,
    panel,
    preview,
    selected: Boolean(selected),
    onReturnTerminal,
    onClose: () => onClose(sessionId),
    onAddProject: () => onAddProject(sessionId, roots),
    toggleProject,
    selectProjectRelative,
    onActivateDiffAuto: activateDiffAuto,
    selectRelative,
  })
  const wrappedHeight = useMemo(
    () => liveDiffWrappedHeight(patch, previewWidth),
    [patch, previewWidth],
  )
  const diffHeight = codeFocused ? wrappedHeight : liveDiffUnwrappedHeight(patch)
  const previewGeometry = liveDiffPreviewGeometry(
    codeFocused,
    stacked,
    coversTerminal,
    stableContentWidth,
  )
  const selectedPatch = selected && patch
  const activatePanel = (event: { stopPropagation: () => void }) => {
    event.stopPropagation()
    if (active) {
      panel.current?.focus()
      return
    }
    onActivateSession()
    setTimeout(() => panel.current?.focus(), 0)
  }
  const focusPanel = (event: { stopPropagation: () => void }) => {
    event.stopPropagation()
    if (active) {
      queueMicrotask(() => panel.current?.focus())
      return
    }
    onActivateSession()
    setTimeout(() => panel.current?.focus(), 0)
  }
  const focusPreview = (event: { stopPropagation: () => void }) => {
    event.stopPropagation()
    if (active) {
      queueMicrotask(() => preview.current?.focus())
      return
    }
    onActivateSession()
    setTimeout(() => preview.current?.focus(), 0)
  }
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: OpenTUI focusable boxes do not expose ARIA roles.
    <box
      ref={panel}
      id={`live-diff-${sessionId}`}
      focusable
      onMouseDown={activatePanel}
      style={{
        flexGrow: 1,
        minWidth: 1,
        minHeight: 1,
        border: coversTerminal ? [] : [stacked ? "top" : "left"],
        borderColor: active && (panelFocused || codeFocused) ? BRAND_COLOR : COLORS.border,
        backgroundColor: COLORS.canvas,
      }}
    >
      <box
        style={{
          height: 1,
          flexShrink: 0,
          flexDirection: "row",
          justifyContent: "space-between",
          backgroundColor: COLORS.panelRaised,
        }}
      >
        <text wrapMode="none">
          <span fg={COLORS.terminal}>{translateUi("Live Diff")}</span>
          <span fg={COLORS.muted}>{` · ${translateUi("Show auto")}: `}</span>
          <span fg={showDiffAuto ? COLORS.success : COLORS.warning}>
            {showDiffAuto ? "true" : "false"}
          </span>
        </text>
        <InlineButton
          compact
          id={`live-diff-close-${sessionId}`}
          label="×"
          onPress={() => onClose(sessionId)}
        />
      </box>
      <box style={{ flexGrow: 1, minHeight: 1, width: "100%", position: "relative" }}>
        {/* biome-ignore lint/a11y/noStaticElementInteractions: the native scroll pane needs mouse focus for keyboard scrolling. */}
        <scrollbox
          ref={preview}
          id={`live-diff-preview-${sessionId}`}
          focusable
          scrollY
          viewportCulling
          onMouseDown={focusPreview}
          onSizeChange={function (this: BoxRenderable) {
            setPreviewWidth((current) => (current === this.width ? current : this.width))
          }}
          style={{
            position: "absolute",
            top: 0,
            left: previewGeometry.left,
            width: previewGeometry.width,
            height: "100%",
            backgroundColor: COLORS.canvas,
          }}
        >
          {selectedPatch ? (
            <NativeDiff
              id={`live-diff-code-${sessionId}`}
              diffRef={diff}
              patch={patch}
              filetype={pathToFiletype(selected.path) ?? "text"}
              height={diffHeight}
              wrapMode={codeFocused ? "char" : "none"}
              lineColors={lineColors}
              hiddenLineNumbers={separatorLines}
            />
          ) : (
            <text
              content={translateUi(
                selected ? "Alteração binária ou sem linhas textuais." : "Nenhum arquivo alterado",
              )}
              style={{ fg: COLORS.muted }}
            />
          )}
        </scrollbox>
      </box>
      <LiveDiffFileTable
        sessionId={sessionId}
        files={visibleFiles}
        selected={selected}
        now={now}
        error={error}
        active={active}
        onSelect={selectFile}
        onFocus={focusPanel}
        height={fileTableHeight}
      />
      <LiveDiffInfo
        sessionId={sessionId}
        width={stableContentWidth}
        files={visibleFiles}
        roots={roots}
        selectedProject={selectedProject}
        hiddenRoots={hiddenRoots}
        onSelectProject={(root, event) => {
          selectProject(root)
          focusPanel(event)
        }}
        onAddProject={() => onAddProject(sessionId, roots)}
        lastProject={lastProject}
        error={error}
        showDiffAuto={showDiffAuto}
        codeFocused={codeFocused}
        shortcutColor={shortcutColor}
      />
    </box>
  )
}
