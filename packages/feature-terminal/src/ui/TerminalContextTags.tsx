import { displayWidth, translateUi, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { useEffect, useState } from "react"
import type { RemoteProjectSyncStatus } from "../model/remote-project-sync"
import { isRemoteAgentSession, isRunningAgent, type TerminalSession } from "../model/sessions"
import type { TerminalRepositoryContext } from "../model/terminal-context"
import {
  type TerminalContextTag,
  terminalContextTags,
  terminalContextTooltip,
} from "../rendering/terminal-context"
import { TerminalShimmerText, TerminalShortcutText } from "./TerminalShortcut"

export type TerminalAgentOrigin = "local" | "remote"

export function terminalAgentOrigin(session: TerminalSession): TerminalAgentOrigin | undefined {
  if (!isRunningAgent(session)) return undefined
  return isRemoteAgentSession(session) ? "remote" : "local"
}

export function terminalMetadataVisible(
  covered: boolean,
  context: TerminalRepositoryContext | undefined,
  sync: RemoteProjectSyncStatus | undefined,
  agentOrigin: TerminalAgentOrigin | undefined,
) {
  return !covered && Boolean(context || sync || agentOrigin)
}

export function terminalPaneAreaHeight(
  terminalHeight: number | "100%" | "52%",
  frameHeight: number,
  metadataVisible: boolean,
) {
  const measuredHeight = typeof terminalHeight === "number" ? terminalHeight : frameHeight
  return measuredHeight ? Math.max(1, measuredHeight - Number(metadataVisible)) : 0
}

function tagColor(
  tag: TerminalContextTag,
  context: TerminalRepositoryContext | undefined,
  sync: RemoteProjectSyncStatus | undefined,
) {
  if (tag.kind === "directory") return COLORS.terminal
  if (tag.kind === "branch") return COLORS.git
  if (tag.kind === "sync") {
    if (sync?.kind === "synced") return COLORS.success
    if (sync?.kind === "syncing" || sync?.kind === "checking") return COLORS.terminal
    if (sync?.kind === "cancelling") return COLORS.warning
    return COLORS.warning
  }
  if (context?.state === "clean") return COLORS.success
  if (context?.state === "dirty") return COLORS.warning
  return COLORS.muted
}

export function terminalSyncTagProgress(
  sync: RemoteProjectSyncStatus | undefined,
  width: number,
  frame: number,
) {
  if (sync?.kind === "syncing")
    return { left: 0, width: Math.max(0, Math.min(width, Math.round(sync.progress * width))) }
  if (sync?.kind !== "checking" || width <= 0) return null
  const sweepWidth = Math.min(4, width)
  const left = (frame % (width + sweepWidth)) - sweepWidth + 1
  return {
    left: Math.max(0, left),
    width: Math.max(0, Math.min(width, left + sweepWidth) - Math.max(0, left)),
  }
}

export function TerminalPaneMetadata({
  sessionId,
  context,
  sync,
  agentOrigin,
  masterKey,
  active,
  covered,
  availableWidth,
  onActivate,
}: {
  sessionId: string
  context?: TerminalRepositoryContext | undefined
  sync?: RemoteProjectSyncStatus | undefined
  agentOrigin?: TerminalAgentOrigin | undefined
  masterKey: string
  active: boolean
  covered: boolean
  availableWidth: number
  onActivate: () => void
}) {
  if (!terminalMetadataVisible(covered, context, sync, agentOrigin)) return null
  return (
    <TerminalContextTags
      sessionId={sessionId}
      context={context}
      sync={sync}
      agentOrigin={agentOrigin}
      masterKey={masterKey}
      active={active}
      availableWidth={availableWidth}
      onActivate={onActivate}
    />
  )
}

export function TerminalContextTags({
  sessionId,
  context,
  sync,
  agentOrigin,
  masterKey,
  active = true,
  availableWidth,
  onActivate,
}: {
  sessionId: string
  context?: TerminalRepositoryContext | undefined
  sync?: RemoteProjectSyncStatus | undefined
  agentOrigin?: TerminalAgentOrigin | undefined
  masterKey: string
  active?: boolean
  availableWidth: number
  onActivate: () => void
}) {
  const [syncFrame, setSyncFrame] = useState(0)
  const animating = active && sync?.kind === "checking"
  useEffect(() => {
    setSyncFrame(0)
    if (!animating || process.env.TUIMINAL_TEST_STATIC_LOADERS === "1") return
    const timer = setInterval(() => setSyncFrame((current) => current + 1), 180)
    return () => clearInterval(timer)
  }, [animating])
  const originLabel = agentOrigin ? translateUi(agentOrigin === "remote" ? "Remoto" : "Local") : ""
  const originWidth = originLabel
    ? Math.min(Math.max(0, availableWidth - 1), displayWidth(originLabel) + 2)
    : 0
  const contentWidth = Math.max(0, availableWidth - 1 - originWidth - Number(originWidth > 0))
  const tags = terminalContextTags(context, contentWidth, sync, masterKey, syncFrame)
  const [hovered, setHovered] = useState<TerminalContextTag["kind"] | null>(null)
  if (!tags.length && !originWidth) return null
  const tagsWidth = tags.reduce(
    (total, tag) => total + displayWidth(tag.label) + 2,
    Math.max(0, tags.length - 1),
  )
  const hoveredTag = tags.find((tag) => tag.kind === hovered)
  const tooltip = hoveredTag
    ? truncateDisplay(
        terminalContextTooltip(hoveredTag.kind, context, sync),
        Math.max(1, contentWidth - 2),
      )
    : ""
  const tooltipWidth = tooltip ? displayWidth(tooltip) + 2 : 0
  const originColor = agentOrigin === "remote" ? COLORS.database : COLORS.success
  const originBackground =
    agentOrigin === "remote" ? COLORS.databaseSelectionBg : COLORS.diffAddedBg
  const originContent =
    originWidth >= displayWidth(originLabel) + 2
      ? ` ${originLabel} `
      : truncateDisplay(originLabel, originWidth)
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: clicking metadata activates its terminal pane.
    <box
      id={`terminal-context-${sessionId}`}
      onMouseDown={onActivate}
      style={{
        position: "relative",
        width: "100%",
        height: 1,
        flexShrink: 0,
        overflow: "visible",
        zIndex: 30,
      }}
    >
      {originWidth > 0 && (
        <TerminalShimmerText
          id={`terminal-context-origin-${sessionId}`}
          content={originContent}
          color={originColor}
          active={active}
          wrapMode="none"
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: originWidth,
            height: 1,
            fg: originColor,
            bg: originBackground,
          }}
        />
      )}
      <box
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          width: tagsWidth,
          height: 1,
          flexDirection: "row",
          gap: 1,
          overflow: "hidden",
        }}
      >
        {tags.map((tag) => {
          const width = displayWidth(tag.label) + 2
          const progress =
            tag.kind === "sync" ? terminalSyncTagProgress(sync, width, syncFrame) : null
          return (
            <box
              key={tag.kind}
              style={{
                position: "relative",
                width,
                height: 1,
                flexShrink: 0,
                backgroundColor: COLORS.panelRaised,
                overflow: "hidden",
              }}
            >
              {progress && progress.width > 0 && (
                <box
                  style={{
                    position: "absolute",
                    left: progress.left,
                    top: 0,
                    width: progress.width,
                    height: 1,
                    backgroundColor: COLORS.terminal,
                    opacity: 0.3,
                  }}
                />
              )}
              <TerminalShortcutText
                id={`terminal-context-${tag.kind}-${sessionId}`}
                content={` ${tag.label} `}
                wrapMode="none"
                onMouseOver={() => setHovered(tag.kind)}
                onMouseOut={() => setHovered((current) => (current === tag.kind ? null : current))}
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  width,
                  height: 1,
                  fg: tagColor(tag, context, sync),
                  bg: "transparent",
                }}
              />
            </box>
          )
        })}
      </box>
      {tooltip && (
        <text
          id={`terminal-context-tooltip-${sessionId}`}
          content={` ${tooltip} `}
          wrapMode="none"
          style={{
            position: "absolute",
            top: 1,
            right: 0,
            width: tooltipWidth,
            height: 1,
            fg: COLORS.text,
            bg: COLORS.panelRaised,
          }}
        />
      )}
    </box>
  )
}
