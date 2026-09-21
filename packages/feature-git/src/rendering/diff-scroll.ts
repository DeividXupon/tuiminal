import {
  CodeRenderable,
  type KeyEvent,
  type Renderable,
  type ScrollBoxRenderable,
} from "@opentui/core"
import { fitNativeDiffCodeCells } from "@xupon/tuiminal-core/ui/NativeDiff"
import { gitDiffHorizontalScrollDelta } from "../model/base-navigation"

function codeCells(root: Renderable): CodeRenderable[] {
  const result: CodeRenderable[] = []
  const pending = root.getChildren()
  while (pending.length) {
    const child = pending.pop()
    if (!child || !child.visible || child.isDestroyed) continue
    if (child instanceof CodeRenderable) result.push(child)
    else pending.push(...child.getChildren())
  }
  return result
}

export function fitGitDiffCodeCells(root: Renderable | null) {
  fitNativeDiffCodeCells(root)
}

function applyOffset(cells: CodeRenderable[], offset: number) {
  const maximum = cells.reduce((value, cell) => Math.max(value, cell.maxScrollX), 0)
  const next = Math.max(0, Math.min(maximum, offset))
  // Move native code buffers only: split panes, gutters and backgrounds stay fixed.
  for (const cell of cells) cell.scrollX = next
}

export function setGitDiffHorizontalOffset(root: ScrollBoxRenderable | null, offset: number) {
  if (root && !root.isDestroyed) applyOffset(codeCells(root), offset)
}

export function scrollGitDiffHorizontally(root: ScrollBoxRenderable | null, delta: number) {
  if (!root || root.isDestroyed) return
  const cells = codeCells(root)
  const offset = cells.reduce((value, cell) => Math.max(value, cell.scrollX), 0)
  applyOffset(cells, offset + delta)
}

export function handleGitDiffHorizontalKey(
  key: KeyEvent,
  enabled: boolean,
  root: ScrollBoxRenderable | null,
) {
  if (key.ctrl || key.meta || key.option || key.super) return false
  const delta = gitDiffHorizontalScrollDelta(key.name, key.shift)
  if (!delta) return false
  if (enabled) {
    key.preventDefault()
    key.stopPropagation()
    scrollGitDiffHorizontally(root, delta)
  }
  return true
}
