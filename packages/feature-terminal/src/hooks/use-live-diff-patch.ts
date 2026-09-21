import { CodeRenderable, type DiffRenderable, type ScrollBoxRenderable } from "@opentui/core"
import { useEffect, useRef, useState } from "react"
import type { LiveDiffFile } from "../model/live-diff"
import { changedHunkLineIndex, latestChangedHunkIndex } from "../rendering/live-diff-hunks"
import { readLiveDiffPatch } from "../services/live-diff"

type ScrollTarget = { patch: string; index: number; line: number | null }
type RenderRef<T> = { current: T | null }

function visualLineOf(diff: DiffRenderable, codeLine: number | null) {
  if (codeLine === null) return -1
  const pending = [...diff.getChildren()]
  while (pending.length) {
    const child = pending.pop()
    if (!child) continue
    if (child instanceof CodeRenderable) {
      return child.lineInfo.lineSources.findIndex((source) => source >= codeLine)
    }
    pending.push(...child.getChildren())
  }
  return -1
}

export function useLiveDiffPatch(
  selected: LiveDiffFile | null,
  automatic: boolean,
  preview: RenderRef<ScrollBoxRenderable>,
  diff: RenderRef<DiffRenderable>,
) {
  const previousPatch = useRef<{ key: string; patch: string } | null>(null)
  const [patch, setPatch] = useState("")
  const [scrollTarget, setScrollTarget] = useState<ScrollTarget | null>(null)

  useEffect(() => {
    if (!selected) {
      setPatch("")
      setScrollTarget(null)
      previousPatch.current = null
      return
    }
    const controller = new AbortController()
    const key = `${selected.root}\0${selected.path}`
    const previous = previousPatch.current
    const oldPatch = previous?.key === key ? previous.patch : null
    if (oldPatch === null) {
      preview.current?.scrollTo(0)
      setPatch("")
      setScrollTarget(null)
    }
    void readLiveDiffPatch(selected, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return
        const index = automatic ? latestChangedHunkIndex(oldPatch, result) : null
        previousPatch.current = { key, patch: result }
        setPatch(result)
        setScrollTarget(
          index === null
            ? null
            : { patch: result, index, line: changedHunkLineIndex(result, index, oldPatch) },
        )
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setPatch("")
          setScrollTarget(null)
        }
      })
    return () => controller.abort()
  }, [selected, automatic, preview])

  useEffect(() => {
    if (!scrollTarget || scrollTarget.patch !== patch || !automatic) return
    const nativeDiff = diff.current
    if (!nativeDiff) return
    const visualLine = visualLineOf(nativeDiff, scrollTarget.line)
    const row = visualLine >= 0 ? visualLine : nativeDiff.getHunkRowOffsets()[scrollTarget.index]
    if (row !== undefined) preview.current?.scrollTo(Math.max(0, row - 2))
  }, [patch, scrollTarget, automatic, diff, preview])

  return patch
}
