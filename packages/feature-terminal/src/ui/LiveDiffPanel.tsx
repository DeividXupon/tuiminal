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
import type { LiveDiffFile } from "../model/live-diff"
import type { RemoteCodexTarget } from "../model/sessions"
import { decoratedLineColors } from "../rendering/live-diff-line-colors"
import { liveDiffUnwrappedHeight, liveDiffWrappedHeight } from "../rendering/live-diff-table"
import { terminalShortcutColor } from "../rendering/terminal-shortcut"
import { useLiveDiffSnapshot } from "../hooks/use-live-diff-snapshot"
import { LiveDiffFileTable } from "./LiveDiffFileTable"
import { LiveDiffInfo } from "./LiveDiffInfo"

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

export function LiveDiffPanel({
  sessionId,
  agentKey,
  initialDirectory,
  remote,
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
  remote?: RemoteCodexTarget
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
  const { roots, files, filesRef, error, lastProject, snapshotReady, remoteSource, readPatch } =
    useLiveDiffSnapshot({ agentKey, initialDirectory, remote, manualDirectories, running })
  const panel = useRef<BoxRenderable | null>(null)
  const preview = useRef<ScrollBoxRenderable | null>(null)
  const diff = useRef<DiffRenderable | null>(null)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const showDiffAuto = selectedKey === null
  const [now, setNow] = useState(Date.now())
  const [previewWidth, setPreviewWidth] = useState(80)
  useLiveDiffFocus(panel, focusRequest)
  const panelFocused = useRenderableFocus(panel)
  const codeFocused = useRenderableFocus(preview)
  const shortcutColor = terminalShortcutColor(active, panelFocused || codeFocused)

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
    readPatch,
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
    ...(remoteSource ? {} : { onAddProject: () => onAddProject(sessionId, roots) }),
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
          {remote && (
            <span fg={COLORS.focus}>{` · ${translateUi("Remoto")} · ${remote.profile.name}`}</span>
          )}
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
        {...(remoteSource ? {} : { onAddProject: () => onAddProject(sessionId, roots) })}
        lastProject={lastProject}
        error={error}
        showDiffAuto={showDiffAuto}
        codeFocused={codeFocused}
        shortcutColor={shortcutColor}
      />
    </box>
  )
}
