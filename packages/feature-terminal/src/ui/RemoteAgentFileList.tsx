import type { ScrollBoxRenderable } from "@opentui/core"
import { Button } from "@tuiparts/react/button"
import { translateUi, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { useEffect, useRef } from "react"
import type { RemoteAgentFilesState } from "../hooks/use-remote-agent-files"
import type { AgentDroppedFile } from "../services/agent-file-drop"

export function agentFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KiB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MiB`
  return `${(bytes / 1024 ** 3).toFixed(1)} GiB`
}

function filePhase(state: RemoteAgentFilesState, index: number) {
  if (index < state.completed.length) return "done"
  if (index === state.completed.length && state.phase === "uploading") return "uploading"
  if (index === state.completed.length && state.phase === "error") return "error"
  return "pending"
}

function RemoteAgentFileRow({
  file,
  index,
  phase,
  selected,
  width,
  compact,
  disabled,
  onSelect,
}: {
  file: AgentDroppedFile
  index: number
  phase: ReturnType<typeof filePhase>
  selected: boolean
  width: number
  compact: boolean
  disabled: boolean
  onSelect: () => void
}) {
  const done = phase === "done"
  const size = agentFileSize(file.size)
  const height = compact ? 1 : 2
  const color = {
    done: COLORS.success,
    error: COLORS.danger,
    uploading: COLORS.terminal,
    pending: COLORS.muted,
  }[phase]
  const marker = { done: " ✓ ", error: " ! ", uploading: " ↑ ", pending: selected ? " › " : " · " }[
    phase
  ]
  const background = index % 2 ? COLORS.panel : COLORS.canvas
  return (
    <Button
      id={`terminal-agent-files-row-${index}`}
      height={height}
      flexShrink={0}
      disabled={disabled}
      onPress={onSelect}
    >
      <box
        style={{
          width: "100%",
          height,
          backgroundColor: selected ? COLORS.diffModifiedBg : background,
        }}
      >
        <box style={{ height: 1, flexDirection: "row" }}>
          <text content={marker} style={{ width: 3, fg: color }} />
          <text
            content={truncateDisplay(file.name, Math.max(1, width - size.length - 5))}
            wrapMode="none"
            style={{ flexGrow: 1, fg: done ? COLORS.muted : COLORS.text }}
          />
          <text content={` ${size} `} style={{ fg: COLORS.muted }} />
        </box>
        {!compact && (
          <text
            content={`   ${truncateDisplay(done ? translateUi("Enviado") : file.path, width - 4)}`}
            wrapMode="none"
            style={{ height: 1, fg: done ? COLORS.success : COLORS.muted }}
          />
        )}
      </box>
    </Button>
  )
}

export function RemoteAgentFileList({
  state,
  selected,
  width,
  compact,
  onSelect,
}: {
  state: RemoteAgentFilesState
  selected: number
  width: number
  compact: boolean
  onSelect: (index: number) => void
}) {
  const scroll = useRef<ScrollBoxRenderable | null>(null)
  const files = [...state.completed, ...state.files]
  useEffect(() => {
    scroll.current?.scrollChildIntoView(
      `terminal-agent-files-row-${state.completed.length + selected}`,
    )
  }, [selected, state.completed.length])
  return (
    <scrollbox ref={scroll} id="terminal-agent-files-list" style={{ flexGrow: 1, minHeight: 1 }}>
      {files.map((file, index) => {
        const done = index < state.completed.length
        const pendingIndex = index - state.completed.length
        return (
          <RemoteAgentFileRow
            key={`${done}:${file.path}`}
            file={file}
            index={index}
            phase={filePhase(state, index)}
            selected={!done && pendingIndex === selected}
            width={width}
            compact={compact}
            disabled={done || state.phase === "uploading" || state.phase === "checking"}
            onSelect={() => onSelect(pendingIndex)}
          />
        )
      })}
    </scrollbox>
  )
}
