import { useKeyboard, useRenderer } from "@opentui/react"
import { Button } from "@tuiparts/react/button"
import { COLORS } from "../../../../core/settings/theme"
import type { FileTreeOption } from "../../model/view"
import { fitLine } from "../../rendering/diff"
import { displayPath } from "../../rendering/file-tree"

export function gitFileTreeRowId(treeId: string, index: number) {
  return `${treeId}-row-${index}`
}

export function isGitFileTreeFocused(focusedId: string, treeId: string) {
  return focusedId.startsWith(`${treeId}-row-`)
}

export function gitFileTreeWindowStart(selectedIndex: number, optionCount: number, height: number) {
  const visibleRows = Math.max(1, height)
  return Math.max(
    0,
    Math.min(selectedIndex - Math.floor(visibleRows / 2), Math.max(0, optionCount - visibleRows)),
  )
}

export function gitStatusColor(status: string, stagedColumn: boolean) {
  if (status === "?") return COLORS.warning
  if (status === "M") return stagedColumn ? COLORS.success : COLORS.warning
  if (status === "A") return COLORS.success
  if (status === "D" || status === "U") return COLORS.danger
  if (status === "R" || status === "C") return COLORS.database
  return COLORS.border
}

function FileTreeRowContent({
  option,
  width,
  selected,
}: {
  option: FileTreeOption
  width: number
  selected: boolean
}) {
  if (option.kind === "folder") {
    const arrow = option.name.trimStart().slice(0, 1)
    const name = `${displayPath(option.path.split("/").at(-1) ?? option.path)}/`
    return (
      <text>
        <span fg={COLORS.border}>{"  ".repeat(option.depth)}</span>
        <span fg={COLORS.database}>{arrow} </span>
        <span fg={COLORS.graphAccent}>
          {fitLine(name, Math.max(1, width - option.depth * 2 - 2))}
        </span>
      </text>
    )
  }

  const indexStatus = option.indexStatus ?? ""
  const worktreeStatus = option.worktreeStatus ?? ""
  const hasStatus = Boolean(indexStatus || worktreeStatus)
  const name = displayPath(option.path.split("/").at(-1) ?? option.path)
  const nameWidth = Math.max(1, width - option.depth * 2 - (hasStatus ? 3 : 0))
  return (
    <text>
      <span fg={COLORS.border}>{"  ".repeat(option.depth)}</span>
      {hasStatus ? (
        <>
          <span fg={gitStatusColor(indexStatus, true)}>{indexStatus || " "}</span>
          <span fg={gitStatusColor(worktreeStatus, false)}>{worktreeStatus || " "}</span>
          <span> </span>
        </>
      ) : null}
      <span fg={selected ? COLORS.git : COLORS.text}>{fitLine(name, nameWidth)}</span>
    </text>
  )
}

export function GitFileTree({
  active,
  id,
  options,
  selectedIndex,
  width,
  height,
  onMove,
  onActivate,
}: {
  active: boolean
  id: string
  options: FileTreeOption[]
  selectedIndex: number
  width: number
  height: number
  onMove: (index: number, option: FileTreeOption) => void
  onActivate: (index: number, option: FileTreeOption) => void
}) {
  const renderer = useRenderer()
  const windowStart = gitFileTreeWindowStart(selectedIndex, options.length, height)
  const visibleOptions = options.slice(windowStart, windowStart + Math.max(1, height))

  const move = (delta: number) => {
    const nextIndex = Math.max(0, Math.min(options.length - 1, selectedIndex + delta))
    const option = options[nextIndex]
    if (!option) return
    onMove(nextIndex, option)
    setTimeout(() => renderer.root.findDescendantById(gitFileTreeRowId(id, nextIndex))?.focus(), 0)
  }

  useKeyboard((key) => {
    const focusedId = renderer.currentFocusedRenderable?.id ?? ""
    if (!active || !isGitFileTreeFocused(focusedId, id)) return
    const delta =
      key.name === "down" || key.name === "j" ? 1 : key.name === "up" || key.name === "k" ? -1 : 0
    if (!delta) return
    key.preventDefault()
    key.stopPropagation()
    move(delta)
  })

  return (
    <box
      style={{ width, height, flexShrink: 0, overflow: "hidden" }}
      onMouseScroll={(event) => {
        if (!event.scroll) return
        const direction =
          event.scroll.direction === "up" || event.scroll.direction === "left" ? -1 : 1
        move(direction * Math.max(1, Math.round(event.scroll.delta)))
        event.preventDefault()
        event.stopPropagation()
      }}
    >
      {visibleOptions.map((option, visibleIndex) => {
        const index = windowStart + visibleIndex
        const selected = index === selectedIndex
        return (
          <Button
            key={option.value}
            id={gitFileTreeRowId(id, index)}
            width="100%"
            height={1}
            flexShrink={0}
            onPress={() => {
              onMove(index, option)
              onActivate(index, option)
            }}
          >
            {(state) => (
              <box
                style={{
                  width: "100%",
                  height: 1,
                  flexShrink: 0,
                  backgroundColor: selected || state.focused ? COLORS.panelRaised : COLORS.panel,
                }}
              >
                <FileTreeRowContent option={option} width={width} selected={selected} />
              </box>
            )}
          </Button>
        )
      })}
    </box>
  )
}
