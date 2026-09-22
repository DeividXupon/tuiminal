import {
  type BoxRenderable,
  type DiffRenderable,
  pathToFiletype,
  RenderableEvents,
  type ScrollBoxRenderable,
} from "@opentui/core"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { NativeDiff } from "@xupon/tuiminal-core/ui/NativeDiff"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useLiveDiffKeyboard } from "../hooks/use-live-diff-keyboard"
import { useLiveDiffFocus } from "../hooks/use-live-diff-focus"
import { useLiveDiffPatch } from "../hooks/use-live-diff-patch"
import { useLiveDiffProjects } from "../hooks/use-live-diff-projects"
import { descendantProcesses } from "../model/agent-detection"
import { type LiveDiffFile, mergeLiveDiffFiles } from "../model/live-diff"
import { liveDiffUnwrappedHeight, liveDiffWrappedHeight } from "../rendering/live-diff-table"
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

async function updateSnapshot(
  roots: readonly string[],
  filesRef: { current: LiveDiffFile[] },
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
    const merged = mergeLiveDiffFiles(filesRef.current, snapshot.files, Date.now())
    filesRef.current = merged
    setFiles(merged)
  }
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
  focusRequest,
  onClose,
  onAddProject,
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
  onClose: (id: string) => void
  onAddProject: (id: string, roots: readonly string[]) => void
  focusRequest: number
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
  const [codeFocused, setCodeFocused] = useState(false)
  const showDiffAuto = selectedKey === null
  const rootsRef = useRef<string[]>([])
  const filesRef = useRef<LiveDiffFile[]>([])
  const directoryRef = useRef<string[]>([])
  directoryRef.current = [initialDirectory, ...manualDirectories, ...processDirectories]
  useLiveDiffFocus(panel, focusRequest)

  useEffect(() => {
    const scroll = preview.current
    if (!scroll) return
    const focused = () => setCodeFocused(true)
    const blurred = () => setCodeFocused(false)
    scroll.on(RenderableEvents.FOCUSED, focused)
    scroll.on(RenderableEvents.BLURRED, blurred)
    return () => {
      scroll.off(RenderableEvents.FOCUSED, focused)
      scroll.off(RenderableEvents.BLURRED, blurred)
    }
  }, [])

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
          controller.signal,
          discoveryWarning,
          setFiles,
          setLastProject,
          setError,
        )
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
  const patch = useLiveDiffPatch(
    selected,
    showDiffAuto,
    visibleFiles,
    COLORS.diffRecentBg,
    preview,
    diff,
  )
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
  const selectedPatch = selected && patch
  const focusPanel = (event: { stopPropagation: () => void }) => {
    event.stopPropagation()
    onReturnTerminal()
    queueMicrotask(() => panel.current?.focus())
  }
  const focusPreview = (event: { stopPropagation: () => void }) => {
    event.stopPropagation()
    onReturnTerminal()
    queueMicrotask(() => preview.current?.focus())
  }
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: OpenTUI focusable boxes do not expose ARIA roles.
    <box
      ref={panel}
      id={`live-diff-${sessionId}`}
      focusable
      onMouseDown={(event) => {
        event.stopPropagation()
        panel.current?.focus()
      }}
      style={{ flexGrow: 1, minWidth: 1, minHeight: 1, backgroundColor: COLORS.canvas }}
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
            left: codeFocused && !stacked ? -30 : 0,
            width: codeFocused ? stableContentWidth + 30 : "100%",
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
      />
    </box>
  )
}
