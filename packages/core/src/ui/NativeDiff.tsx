import { CodeRenderable, type DiffRenderable, type Renderable } from "@opentui/core"
import type { Ref } from "react"
import { COLORS } from "../settings/theme"
import { createUiSyntaxStyle } from "./syntax-style"

const syntaxStyle = createUiSyntaxStyle()
const fittedCells = new WeakSet<CodeRenderable>()

/** Keep code inside the native diff gutter after a resize. */
export function fitNativeDiffCodeCells(root: Renderable | null) {
  if (!root) return
  const pending = root.getChildren()
  while (pending.length) {
    const child = pending.pop()
    if (!child || !child.visible || child.isDestroyed) continue
    if (!(child instanceof CodeRenderable)) {
      pending.push(...child.getChildren())
      continue
    }
    const parent = child.parent
    if (!parent) continue
    if (!fittedCells.has(child)) {
      child.flexGrow = 0
      child.flexShrink = 0
      fittedCells.add(child)
    }
    const gutter = parent
      .getChildren()
      .reduce((width, sibling) => width + (sibling === child ? 0 : sibling.width), 0)
    child.width = Math.max(1, parent.width - gutter)
    child.scrollX = Math.min(child.scrollX, child.maxScrollX)
  }
}

export function NativeDiff({
  id,
  diffRef,
  patch,
  filetype,
  height,
  view = "unified",
  wrapMode = "none",
}: {
  id?: string
  diffRef?: Ref<DiffRenderable>
  patch: string
  filetype: string
  height: number
  view?: "unified" | "split"
  wrapMode?: "none" | "word" | "char"
}) {
  return (
    <diff
      {...(id ? { id } : {})}
      {...(diffRef ? { ref: diffRef } : {})}
      renderBefore={function () {
        fitNativeDiffCodeCells(this)
      }}
      diff={patch}
      filetype={filetype}
      syntaxStyle={syntaxStyle}
      view={view}
      wrapMode={wrapMode}
      showLineNumbers
      lineNumberFg={COLORS.muted}
      lineNumberBg={COLORS.diffGutterBg}
      addedBg={COLORS.diffAddedBg}
      removedBg={COLORS.diffRemovedBg}
      contextBg={COLORS.panel}
      addedSignColor={COLORS.success}
      removedSignColor={COLORS.danger}
      addedLineNumberBg={COLORS.diffAddedBg}
      removedLineNumberBg={COLORS.diffRemovedBg}
      style={{ width: "100%", height, flexShrink: 0 }}
    />
  )
}
