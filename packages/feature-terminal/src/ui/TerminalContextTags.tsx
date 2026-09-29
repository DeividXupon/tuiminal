import { displayWidth, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { useEffect, useState } from "react"
import type { RemoteProjectSyncStatus } from "../model/remote-project-sync"
import type { TerminalRepositoryContext } from "../model/terminal-context"
import {
  type TerminalContextTag,
  terminalContextTags,
  terminalContextTooltip,
} from "../rendering/terminal-context"
import { TerminalShortcutText } from "./TerminalShortcut"

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

export function TerminalContextTags({
  sessionId,
  context,
  sync,
  masterKey,
  active = true,
  availableWidth,
  onActivate,
}: {
  sessionId: string
  context?: TerminalRepositoryContext | undefined
  sync?: RemoteProjectSyncStatus | undefined
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
  const contentWidth = Math.max(0, availableWidth - 1)
  const tags = terminalContextTags(context, contentWidth, sync, masterKey, syncFrame)
  const [hovered, setHovered] = useState<TerminalContextTag["kind"] | null>(null)
  if (!tags.length) return null
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
  const width = Math.max(tagsWidth, tooltipWidth)
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: clicking metadata activates its terminal pane.
    <box
      id={`terminal-context-${sessionId}`}
      onMouseDown={onActivate}
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        width,
        height: tooltip ? 2 : 1,
        zIndex: 30,
      }}
    >
      <box
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          width: tagsWidth,
          height: 1,
          flexDirection: "row",
          gap: 1,
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
