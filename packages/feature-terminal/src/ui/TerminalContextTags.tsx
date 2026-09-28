import { displayWidth, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { useState } from "react"
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

export function TerminalContextTags({
  sessionId,
  context,
  sync,
  masterKey,
  availableWidth,
  onActivate,
}: {
  sessionId: string
  context?: TerminalRepositoryContext | undefined
  sync?: RemoteProjectSyncStatus | undefined
  masterKey: string
  availableWidth: number
  onActivate: () => void
}) {
  const contentWidth = Math.max(0, availableWidth - 1)
  const tags = terminalContextTags(context, contentWidth, sync, masterKey)
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
        {tags.map((tag) => (
          <TerminalShortcutText
            key={tag.kind}
            id={`terminal-context-${tag.kind}-${sessionId}`}
            content={` ${tag.label} `}
            wrapMode="none"
            onMouseOver={() => setHovered(tag.kind)}
            onMouseOut={() => setHovered((current) => (current === tag.kind ? null : current))}
            style={{
              flexShrink: 0,
              fg: tagColor(tag, context, sync),
              bg: COLORS.panelRaised,
            }}
          />
        ))}
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
