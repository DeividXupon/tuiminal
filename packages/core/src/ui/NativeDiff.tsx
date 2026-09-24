import {
  CodeRenderable,
  type DiffRenderable,
  LineNumberRenderable,
  type Renderable,
} from "@opentui/core"
import type { Ref } from "react"
import { COLORS } from "../settings/theme"
import { createUiSyntaxStyle } from "./syntax-style"

const syntaxStyle = createUiSyntaxStyle()
const fittedCells = new WeakSet<CodeRenderable>()
const appliedDecorations = new WeakMap<
  DiffRenderable,
  {
    lineColors: ReadonlyMap<number, Parameters<DiffRenderable["setLineColor"]>[1]> | undefined
    hiddenLineNumbers: ReadonlySet<number> | undefined
    patch: string
    filetype: string
    view: "unified" | "split"
    wrapMode: "none" | "word" | "char"
  }
>()

/** Keep code inside the native diff gutter after a resize. */
export function fitNativeDiffCodeCells(root: Renderable | null) {
  if (!root) return
  const pending = root.getChildren()
  while (pending.length) {
    const child = pending.pop()
    if (!child?.visible || child.isDestroyed) continue
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
  lineColors,
  hiddenLineNumbers,
}: {
  id?: string
  diffRef?: Ref<DiffRenderable>
  patch: string
  filetype: string
  height: number
  view?: "unified" | "split"
  wrapMode?: "none" | "word" | "char"
  lineColors?: ReadonlyMap<number, Parameters<DiffRenderable["setLineColor"]>[1]>
  hiddenLineNumbers?: ReadonlySet<number>
}) {
  return (
    <diff
      {...(id ? { id } : {})}
      {...(diffRef ? { ref: diffRef } : {})}
      renderBefore={function () {
        fitNativeDiffCodeCells(this)
        const applied = appliedDecorations.get(this)
        if (
          applied !== undefined &&
          applied.lineColors === lineColors &&
          applied.hiddenLineNumbers === hiddenLineNumbers &&
          applied.patch === patch &&
          applied.filetype === filetype &&
          applied.view === view &&
          applied.wrapMode === wrapMode
        )
          return
        if (lineColors) this.setLineColors(new Map(lineColors))
        if (hiddenLineNumbers) {
          for (const child of this.getChildren()) {
            if (!(child instanceof LineNumberRenderable)) continue
            child.setHideLineNumbers(new Set(hiddenLineNumbers))
          }
        }
        appliedDecorations.set(this, {
          lineColors,
          hiddenLineNumbers,
          patch,
          filetype,
          view,
          wrapMode,
        })
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
