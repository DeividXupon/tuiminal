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

export function gitFileTreeOptionHeight(option: FileTreeOption) {
  return option.kind === "folder" ? Math.max(1, option.folderChain?.length ?? 1) : 1
}

export function gitFileTreeVisibleWindow(
  options: FileTreeOption[],
  selectedIndex: number,
  height: number,
) {
  if (!options.length) return { start: 0, end: 0 }
  const availableRows = Math.max(1, height)
  const boundedSelection = Math.max(0, Math.min(options.length - 1, selectedIndex))
  const selectedOption = options[boundedSelection]
  if (!selectedOption) return { start: 0, end: 0 }
  const selectedHeight = gitFileTreeOptionHeight(selectedOption)
  const rowsBeforeSelection = Math.max(0, Math.floor((availableRows - selectedHeight) / 2))
  let start = boundedSelection
  let rowsBefore = 0
  while (start > 0) {
    const previous = options[start - 1]
    if (!previous) break
    const previousHeight = gitFileTreeOptionHeight(previous)
    if (rowsBefore + previousHeight > rowsBeforeSelection) break
    start -= 1
    rowsBefore += previousHeight
  }

  let end = boundedSelection + 1
  let usedRows = rowsBefore + selectedHeight
  while (end < options.length && usedRows < availableRows) {
    const next = options[end]
    if (!next) break
    const nextHeight = gitFileTreeOptionHeight(next)
    if (usedRows + nextHeight > availableRows) break
    usedRows += nextHeight
    end += 1
  }
  while (start > 0) {
    const previous = options[start - 1]
    if (!previous) break
    const previousHeight = gitFileTreeOptionHeight(previous)
    if (usedRows + previousHeight > availableRows) break
    start -= 1
    usedRows += previousHeight
  }
  return { start, end }
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
    const names = option.folderChain ?? [option.name.trimStart().replace(/^[▸▾] /, "")]
    const lines = names.map((name, index) => ({
      key: names.slice(0, index + 1).join("/"),
      name,
    }))
    return (
      <box
        style={{
          width: "100%",
          height: names.length,
          flexShrink: 0,
          flexDirection: "column",
        }}
      >
        {lines.map((line, index) => (
          <text key={line.key}>
            <span fg={COLORS.border}>{"  ".repeat(option.depth)}</span>
            <span fg={COLORS.database}>{index === 0 ? `${arrow} ` : "  "}</span>
            <span fg={COLORS.graphAccent}>
              {fitLine(`${line.name}/`, Math.max(1, width - option.depth * 2 - 2))}
            </span>
          </text>
        ))}
      </box>
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
  onToggleStage,
}: {
  active: boolean
  id: string
  options: FileTreeOption[]
  selectedIndex: number
  width: number
  height: number
  onMove: (index: number, option: FileTreeOption) => void
  onActivate: (index: number, option: FileTreeOption) => void
  onToggleStage: (option: FileTreeOption) => void
}) {
  const renderer = useRenderer()
  const visibleWindow = gitFileTreeVisibleWindow(options, selectedIndex, height)
  const visibleOptions = options.slice(visibleWindow.start, visibleWindow.end)

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
    if (key.name === "return" || key.name === "enter" || key.name === "linefeed") {
      const option = options[selectedIndex]
      if (!option) return
      key.preventDefault()
      key.stopPropagation()
      onActivate(selectedIndex, option)
      return
    }
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
        const index = visibleWindow.start + visibleIndex
        const selected = index === selectedIndex
        const optionHeight = gitFileTreeOptionHeight(option)
        return (
          <Button
            key={option.value}
            id={gitFileTreeRowId(id, index)}
            width="100%"
            height={optionHeight}
            flexShrink={0}
            onPress={(details) => {
              onMove(index, option)
              if (details.source === "keyboard" && details.key === "space") {
                onToggleStage(option)
                return
              }
              onActivate(index, option)
            }}
          >
            {(state) => (
              <box
                style={{
                  width: "100%",
                  height: optionHeight,
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
