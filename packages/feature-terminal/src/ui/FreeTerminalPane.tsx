import { type BoxRenderable, EmbeddedTerminalRenderable } from "@opentui/core"
import { extend } from "@opentui/react"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { PlasmaLoadingOverlay } from "@xupon/tuiminal-core/ui/PlasmaLoadingOverlay"
import { memo, useEffect, useRef, useState } from "react"
import { terminalFocusTargetKey } from "../model/focus-selection"
import { AgentMessageHistoryPanel } from "./AgentMessageHistoryPanel"
import {
  type FreeTerminalPaneProps,
  liveDiffContainerStyle,
  liveDiffHeights,
  measuresPane,
  messageHistoryHeights,
  paneContextActive,
  paneContextWidth,
  paneLiveDiffWidths,
  remoteSetupHeights,
  sameTerminalPane,
  terminalContentWidth,
} from "./free-terminal-pane-layout"
import { LiveDiffPanel } from "./LiveDiffPanel"
import { RemoteServerSetupPanel } from "./RemoteServerSetupPanel"
import {
  TerminalPaneMetadata,
  terminalAgentOrigin,
  terminalMetadataVisible,
  terminalPaneAreaHeight,
} from "./TerminalContextTags"
import { TerminalFocusSelection } from "./TerminalFocusSelection"

extend({ "embedded-terminal": EmbeddedTerminalRenderable })
declare module "@opentui/react" {
  interface OpenTUIComponents {
    "embedded-terminal": typeof EmbeddedTerminalRenderable
  }
}

export type { FreeTerminalPaneLayout } from "./free-terminal-pane-layout"

type PaneProps = FreeTerminalPaneProps
export const FreeTerminalPane = memo(function FreeTerminalPane({
  session,
  active,
  toolActive,
  visible,
  paletteSequence,
  context,
  syncStatus,
  masterKey = "Ctrl+B",
  layout,
  onActivate,
  onReady,
  onGone,
  onInput,
  onResize,
  liveDiff,
  onCloseLiveDiff,
  onAddLiveDiffProject,
  messageHistory,
  onCloseMessageHistory,
  onReturnMessageHistoryTerminal,
  focusSelection,
}: PaneProps) {
  const terminalRef = useRef<EmbeddedTerminalRenderable | null>(null)
  const frameRef = useRef<BoxRenderable | null>(null)
  const [frameHeight, setFrameHeight] = useState(0)
  const [frameWidth, setFrameWidth] = useState(0)
  const [messageDetailOpen, setMessageDetailOpen] = useState(false)
  const agentOrigin = terminalAgentOrigin(session)
  const contextRowVisible = terminalMetadataVisible(
    Boolean(liveDiff?.coversTerminal),
    context,
    syncStatus,
    agentOrigin,
  )
  const { diffWidth, stableContentWidth, terminalWidth } = paneLiveDiffWidths(
    frameWidth,
    layout.borderLeft,
    liveDiff,
  )
  const fileTableHeight = liveDiff?.stacked ? 4 : Math.max(4, Math.round(frameHeight * 0.3))
  const { terminalHeight, diffHeight } = liveDiffHeights(
    frameHeight,
    layout.borderTop,
    Boolean(liveDiff?.stacked),
    Boolean(liveDiff?.sharesSplitPane),
  )
  const terminalAreaHeight = terminalPaneAreaHeight(terminalHeight, frameHeight, contextRowVisible)
  const { historyHeight, embeddedHeight } = messageHistoryHeights(
    terminalAreaHeight,
    Boolean(messageHistory),
    messageDetailOpen,
  )
  const remoteSetup = session.remoteSetup
  const measureFrame = measuresPane(
    liveDiff,
    messageHistory,
    remoteSetup,
    context,
    syncStatus,
    agentOrigin,
  )
  const setupHeights = remoteSetupHeights(terminalAreaHeight, Boolean(remoteSetup))
  const embeddedTerminalHeight = remoteSetup ? setupHeights.terminalHeight : embeddedHeight
  const terminalFocusTarget = terminalFocusTargetKey("terminal", session.id)
  const historyFocusTarget = terminalFocusTargetKey("history", session.id)
  const liveDiffFocusTarget = terminalFocusTargetKey("live-diff", session.id)
  const setupFocusTarget = terminalFocusTargetKey("setup", session.id)
  const borders: Array<"top" | "left"> = []
  if (layout.borderTop) borders.push("top")
  if (layout.borderLeft) borders.push("left")
  useEffect(() => {
    const terminal = terminalRef.current
    if (terminal && paletteSequence) terminal.write(paletteSequence)
  }, [paletteSequence])
  useEffect(() => {
    const terminal = terminalRef.current
    if (!terminal) return
    onReady(session.id, terminal)
    return () => onGone(session.id, terminal)
  }, [onGone, onReady, session.id])
  useEffect(() => {
    if (!messageHistory) setMessageDetailOpen(false)
  }, [messageHistory])
  useEffect(() => {
    if (!measureFrame) return
    const frame = frameRef.current
    if (!frame) return
    setFrameHeight((current) => (current === frame.height ? current : frame.height))
    setFrameWidth((current) => (current === frame.width ? current : frame.width))
  }, [measureFrame])
  return (
    <box
      visible={visible}
      style={{
        position: "absolute",
        top: layout.top,
        left: layout.left,
        width: layout.width,
        height: layout.height,
        minWidth: 1,
        minHeight: 1,
        backgroundColor: COLORS.canvas,
        overflow: "hidden",
      }}
    >
      {/* biome-ignore lint/a11y/noStaticElementInteractions: OpenTUI boxes handle terminal mouse activation without ARIA roles. */}
      <box
        ref={frameRef}
        id={`terminal-pane-frame-${session.id}`}
        onMouseDown={() => onActivate(session.id)}
        onSizeChange={function (this: BoxRenderable) {
          if (!measureFrame) return
          setFrameHeight((current) => (current === this.height ? current : this.height))
          setFrameWidth((current) => (current === this.width ? current : this.width))
        }}
        style={{
          flexGrow: 1,
          minWidth: 1,
          minHeight: 1,
          border: borders,
          borderStyle: "single",
          borderColor: active ? COLORS.terminal : COLORS.border,
          backgroundColor: COLORS.canvas,
          overflow: "hidden",
          position: "relative",
          flexDirection: liveDiff?.stacked ? "column" : "row",
        }}
      >
        <box
          style={{
            width: terminalContentWidth(liveDiff, frameWidth, terminalWidth),
            height: terminalHeight,
            minWidth: 1,
            minHeight: 1,
            flexShrink: 1,
            flexDirection: "column",
          }}
        >
          <TerminalPaneMetadata
            sessionId={session.id}
            context={context}
            sync={syncStatus}
            agentOrigin={agentOrigin}
            masterKey={masterKey}
            active={paneContextActive(toolActive, visible)}
            covered={Boolean(liveDiff?.coversTerminal)}
            availableWidth={paneContextWidth(
              liveDiff,
              frameWidth,
              terminalWidth,
              layout.borderLeft,
            )}
            onActivate={() => onActivate(session.id)}
          />
          <box
            id={`terminal-focus-target-terminal-${session.id}`}
            style={{
              width: "100%",
              height: embeddedTerminalHeight,
              minHeight: 1,
              flexShrink: 1,
              position: "relative",
            }}
          >
            <embedded-terminal
              ref={terminalRef}
              id={`free-terminal-${session.id}`}
              maxScrollback={5_000}
              selectable
              onData={(data) => onInput(session.id, data)}
              onTerminalResize={(columns, rows) => onResize(session.id, columns, rows)}
              onMouseDown={() => onActivate(session.id)}
              style={{ width: "100%", height: "100%", minHeight: 1, flexGrow: 1, flexShrink: 1 }}
            />
            <PlasmaLoadingOverlay
              id={`terminal-pane-start-loader-${session.id}`}
              active={session.status === "starting" && Boolean(session.codex)}
              label="Iniciando agente…"
              accent={COLORS.terminal}
              background={COLORS.canvas}
            />
            {focusSelection && (
              <TerminalFocusSelection
                target={terminalFocusTarget}
                selected={focusSelection.selectedTarget === terminalFocusTarget}
                onFocus={focusSelection.onFocus}
              />
            )}
          </box>
          {messageHistory && onCloseMessageHistory && onReturnMessageHistoryTerminal && (
            <box
              id={`terminal-focus-target-history-${session.id}`}
              style={{
                width: "100%",
                height: historyHeight,
                minHeight: 1,
                flexShrink: 1,
                position: "relative",
              }}
            >
              <AgentMessageHistoryPanel
                sessionId={session.id}
                messages={messageHistory.messages}
                active={Boolean(toolActive && active)}
                focusRequest={messageHistory.focusRequest}
                onClose={onCloseMessageHistory}
                onReturnTerminal={onReturnMessageHistoryTerminal}
                onActivateSession={() => onActivate(session.id)}
                onDetailModeChange={setMessageDetailOpen}
              />
              {focusSelection && (
                <TerminalFocusSelection
                  target={historyFocusTarget}
                  selected={focusSelection.selectedTarget === historyFocusTarget}
                  onFocus={focusSelection.onFocus}
                />
              )}
            </box>
          )}
          {remoteSetup && (
            <box
              id={`terminal-focus-target-setup-${session.id}`}
              style={{
                width: "100%",
                height: setupHeights.setupHeight,
                minHeight: 1,
                flexShrink: 1,
                position: "relative",
                border: ["top"],
                borderColor: COLORS.border,
                backgroundColor: COLORS.panel,
              }}
            >
              <RemoteServerSetupPanel
                sessionId={session.id}
                profile={remoteSetup.profile}
                active={Boolean(toolActive && active)}
                onActivateSession={() => onActivate(session.id)}
                onReturnTerminal={() => onActivate(session.id)}
              />
              {focusSelection && (
                <TerminalFocusSelection
                  target={setupFocusTarget}
                  selected={focusSelection.selectedTarget === setupFocusTarget}
                  onFocus={focusSelection.onFocus}
                />
              )}
            </box>
          )}
        </box>
        {liveDiff && onCloseLiveDiff && onAddLiveDiffProject && (
          <box
            id={`terminal-focus-target-live-diff-${session.id}`}
            style={{
              minWidth: 1,
              minHeight: 1,
              flexShrink: 1,
              ...liveDiffContainerStyle(
                liveDiff.coversTerminal,
                frameWidth,
                diffWidth,
                liveDiff.stacked,
                diffHeight,
              ),
            }}
          >
            <LiveDiffPanel
              sessionId={session.id}
              agentKey={liveDiff.agentKey}
              initialDirectory={session.workingDirectory ?? ""}
              {...(liveDiff.remote ? { remote: liveDiff.remote } : {})}
              manualDirectories={liveDiff.manualDirectories}
              running={liveDiff.running}
              active={Boolean(toolActive && active)}
              fileTableHeight={fileTableHeight}
              stableContentWidth={stableContentWidth}
              stacked={liveDiff.stacked}
              coversTerminal={liveDiff.coversTerminal}
              focusRequest={liveDiff.focusRequest}
              onClose={onCloseLiveDiff}
              onAddProject={onAddLiveDiffProject}
              onActivateSession={() => onActivate(session.id)}
              onReturnTerminal={() =>
                liveDiff.coversTerminal ? onCloseLiveDiff(session.id) : onActivate(session.id)
              }
            />
            {focusSelection && (
              <TerminalFocusSelection
                target={liveDiffFocusTarget}
                selected={focusSelection.selectedTarget === liveDiffFocusTarget}
                onFocus={focusSelection.onFocus}
              />
            )}
          </box>
        )}
      </box>
    </box>
  )
}, sameTerminalPane)
