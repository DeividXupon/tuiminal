import { CodeRenderable, type DiffRenderable, RGBA, type ScrollBoxRenderable } from "@opentui/core"
import { useEffect, useRef, useState } from "react"
import type { LiveDiffFile } from "../model/live-diff"
import {
  changedHunkLineIndex,
  type LiveDiffPatchHistory,
  latestChangedHunkIndex,
  observeLiveDiffPatch,
  type RecentDiffLine,
} from "../rendering/live-diff-hunks"
import {
  drawLiveDiffTextShimmer,
  LIVE_DIFF_SHIMMER_FRAME_MS,
  LIVE_DIFF_SHIMMER_MS,
} from "../rendering/live-diff-shimmer"
import { readLiveDiffPatch } from "../services/live-diff"

type ScrollTarget = { patch: string; index: number; line: number | null }
type RecentChange = { patch: string; lines: RecentDiffLine[] }
type HighlightedPatch = { patch: string; lines: RecentDiffLine[] }
type RenderRef<T> = { current: T | null }

const fileKey = (file: Pick<LiveDiffFile, "root" | "path">) => `${file.root}\0${file.path}`

function codeRenderableOf(diff: DiffRenderable) {
  const pending = [...diff.getChildren()]
  while (pending.length) {
    const child = pending.pop()
    if (!child) continue
    if (child instanceof CodeRenderable) return child
    pending.push(...child.getChildren())
  }
  return null
}

function visualLineOf(diff: DiffRenderable, codeLine: number | null) {
  if (codeLine === null) return -1
  return (
    codeRenderableOf(diff)?.lineInfo.lineSources.findIndex((source) => source >= codeLine) ?? -1
  )
}

export function useLiveDiffPatch(
  selected: LiveDiffFile | null,
  automatic: boolean,
  files: readonly LiveDiffFile[],
  recentBackgroundColor: string,
  preview: RenderRef<ScrollBoxRenderable>,
  diff: RenderRef<DiffRenderable>,
) {
  const previousPatch = useRef<{ key: string; patch: string } | null>(null)
  const patchHistory = useRef(new Map<string, LiveDiffPatchHistory>())
  const [patch, setPatch] = useState("")
  const [scrollTarget, setScrollTarget] = useState<ScrollTarget | null>(null)
  const [highlightedPatch, setHighlightedPatch] = useState<HighlightedPatch | null>(null)
  const [recentChange, setRecentChange] = useState<RecentChange | null>(null)

  useEffect(() => {
    const available = new Set(files.map(fileKey))
    for (const key of patchHistory.current.keys())
      if (!available.has(key)) patchHistory.current.delete(key)
  }, [files])

  useEffect(() => {
    if (!selected) {
      setPatch("")
      setScrollTarget(null)
      setHighlightedPatch(null)
      setRecentChange(null)
      previousPatch.current = null
      return
    }
    const controller = new AbortController()
    const key = fileKey(selected)
    const previous = previousPatch.current
    const oldPatch = previous?.key === key ? previous.patch : null
    if (oldPatch === null) {
      preview.current?.scrollTo(0)
      setPatch("")
      setScrollTarget(null)
      setHighlightedPatch(null)
      setRecentChange(null)
    }
    void readLiveDiffPatch(selected, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return
        const index = automatic ? latestChangedHunkIndex(oldPatch, result) : null
        const observed = observeLiveDiffPatch(patchHistory.current, key, result)
        previousPatch.current = { key, patch: result }
        setPatch(result)
        setHighlightedPatch(
          observed.highlighted.length ? { patch: result, lines: observed.highlighted } : null,
        )
        if (observed.changed)
          setRecentChange(observed.recent.length ? { patch: result, lines: observed.recent } : null)
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
          setHighlightedPatch(null)
          setRecentChange(null)
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

  useEffect(() => {
    if (!highlightedPatch || highlightedPatch.patch !== patch) return
    const nativeDiff = diff.current
    if (!nativeDiff) return
    const background = RGBA.fromHex(recentBackgroundColor)
    for (const { line } of highlightedPatch.lines)
      nativeDiff.setLineColor(line, { gutter: background, content: background })
  }, [patch, highlightedPatch, diff, recentBackgroundColor])

  useEffect(() => {
    if (!recentChange || recentChange.patch !== patch) return
    const nativeDiff = diff.current
    if (!nativeDiff) return
    const code = codeRenderableOf(nativeDiff)
    const recentBackground = RGBA.fromHex(recentBackgroundColor)
    const highlightedLines = new Set(recentChange.lines.map(({ line }) => line))
    let progress = 0
    const previousRender = code?.render
    // OpenTUI's TextBufferRenderable.render bypasses renderAfter, so decorate
    // only this CodeRenderable instance while the brief animation is active.
    const renderShimmer: CodeRenderable["render"] = (buffer, deltaTime) => {
      if (code) previousRender?.call(code, buffer, deltaTime)
      if (code) drawLiveDiffTextShimmer(buffer, code, highlightedLines, progress, recentBackground)
    }
    const removeShimmer = () => {
      if (!code || !previousRender || code.render !== renderShimmer) return
      code.render = previousRender
      code.requestRender()
    }
    if (code) {
      code.render = renderShimmer
      code.requestRender()
    }
    const frameTimer =
      code &&
      setInterval(() => {
        progress = Math.min(1, progress + LIVE_DIFF_SHIMMER_FRAME_MS / LIVE_DIFF_SHIMMER_MS)
        code.requestRender()
      }, LIVE_DIFF_SHIMMER_FRAME_MS)
    const timer = setTimeout(() => {
      if (frameTimer) clearInterval(frameTimer)
      removeShimmer()
      setRecentChange((current) => (current === recentChange ? null : current))
    }, LIVE_DIFF_SHIMMER_MS)
    return () => {
      clearTimeout(timer)
      if (frameTimer) clearInterval(frameTimer)
      removeShimmer()
    }
  }, [patch, recentChange, diff, recentBackgroundColor])

  return patch
}
