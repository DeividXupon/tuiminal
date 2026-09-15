import type { MouseEvent, SelectRenderable } from "@opentui/core"

type SelectMouseOptions = {
  optionCount: number
  showDescription?: boolean
  activateOnClick?: boolean
}

export function handleSelectMouseScroll(event: MouseEvent, select: SelectRenderable | null) {
  if (!select || !event.scroll) return

  const steps = Math.max(1, Math.round(event.scroll.delta))
  if (event.scroll.direction === "up" || event.scroll.direction === "left") {
    select.moveUp(steps)
  } else {
    select.moveDown(steps)
  }
  select.focus()
  event.preventDefault()
  event.stopPropagation()
}

export function handleSelectMouseDown(
  event: MouseEvent,
  select: SelectRenderable | null,
  options: SelectMouseOptions,
) {
  if (!select || event.button !== 0 || options.optionCount === 0) return

  const linesPerItem = options.showDescription ? 2 : 1
  const visibleItems = Math.max(1, Math.floor(select.height / linesPerItem))
  const currentIndex = select.getSelectedIndex()
  const scrollOffset = Math.max(
    0,
    Math.min(
      currentIndex - Math.floor(visibleItems / 2),
      Math.max(0, options.optionCount - visibleItems),
    ),
  )
  const row = Math.floor((event.y - select.y) / linesPerItem)
  const clickedIndex = scrollOffset + row

  if (row >= 0 && row < visibleItems && clickedIndex < options.optionCount) {
    select.focus()
    select.setSelectedIndex(clickedIndex)
    if (options.activateOnClick) select.selectCurrent()
  }

  event.preventDefault()
  event.stopPropagation()
}
