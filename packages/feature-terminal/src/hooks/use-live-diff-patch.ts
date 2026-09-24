import { CodeRenderable, type DiffRenderable, type ScrollBoxRenderable } from "@opentui/core"
import { useEffect, useMemo, useRef, useState } from "react"
import type { LiveDiffFile } from "../model/live-diff"
import {
  changedHunkLineIndex,
  type LiveDiffPatchHistory,
  latestChangedHunkIndex,
  observeLiveDiffPatch,
  prepareLiveDiffPatch,
  type RecentDiffLine,
} from "../rendering/live-diff-hunks"
import {
  drawLiveDiffTextShimmer,
  LIVE_DIFF_SHIMMER_FRAME_COUNT,
  LIVE_DIFF_SHIMMER_FRAME_MS,
} from "../rendering/live-diff-shimmer"
import { readLiveDiffPatch } from "../services/live-diff"

type ScrollTarget = { patch: string; index: number; line: number | null }
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
  snapshotReady: boolean,
  shimmerColor: string,
  preview: RenderRef<ScrollBoxRenderable>,
  diff: RenderRef<DiffRenderable>,
) {
  const previousPatch = useRef<{ key: string; patch: string } | null>(null)
  const patchHistory = useRef(new Map<string, LiveDiffPatchHistory>())
  const fingerprints = useRef(new Map<string, string>())
  const fingerprintsInitialized = useRef(false)
  const initiallyRecent = useRef(new Set<string>())
  const [patch, setPatch] = useState("")
  const [separatorLines, setSeparatorLines] = useState<number[]>([])
  const [scrollTarget, setScrollTarget] = useState<ScrollTarget | null>(null)
  const [highlightedPatch, setHighlightedPatch] = useState<HighlightedPatch | null>(null)

  useEffect(() => {
    if (!snapshotReady) return
    const available = new Set(files.map(fileKey))
    for (const file of files) {
      const key = fileKey(file)
      const previousFingerprint = fingerprints.current.get(key)
      if (
        fingerprintsInitialized.current &&
        previousFingerprint !== file.fingerprint &&
        !patchHistory.current.has(key)
      )
        initiallyRecent.current.add(key)
      fingerprints.current.set(key, file.fingerprint)
    }
    for (const key of patchHistory.current.keys()) {
      if (!available.has(key)) patchHistory.current.delete(key)
    }
    for (const key of fingerprints.current.keys()) {
      if (!available.has(key)) fingerprints.current.delete(key)
    }
    fingerprintsInitialized.current = true
  }, [files, snapshotReady])

  useEffect(() => {
    if (!selected) {
      setPatch("")
      setSeparatorLines([])
      setScrollTarget(null)
      setHighlightedPatch(null)
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
      setSeparatorLines([])
      setScrollTarget(null)
      setHighlightedPatch(null)
    }
    void readLiveDiffPatch(selected, controller.signal)
      .then((rawPatch) => {
        if (controller.signal.aborted) return
        const prepared = prepareLiveDiffPatch(rawPatch)
        const result = prepared.patch
        const index = automatic ? latestChangedHunkIndex(oldPatch, result) : null
        const observed = observeLiveDiffPatch(
          patchHistory.current,
          key,
          result,
          initiallyRecent.current.delete(key),
        )
        previousPatch.current = { key, patch: result }
        setPatch(result)
        setSeparatorLines(prepared.separatorLines)
        setHighlightedPatch(
          observed.highlighted.length ? { patch: result, lines: observed.highlighted } : null,
        )
        setScrollTarget(
          index === null
            ? null
            : { patch: result, index, line: changedHunkLineIndex(result, index, oldPatch) },
        )
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setPatch("")
          setSeparatorLines([])
          setScrollTarget(null)
          setHighlightedPatch(null)
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
    const code = codeRenderableOf(nativeDiff)
    const highlightedLines = new Set(highlightedPatch.lines.map(({ line }) => line))
    let frame = 0
    const previousRender = code?.render
    // OpenTUI's TextBufferRenderable.render bypasses renderAfter, so decorate
    // only this CodeRenderable instance while persistent blue lines are active.
    const renderShimmer: CodeRenderable["render"] = (buffer, deltaTime) => {
      if (code) previousRender?.call(code, buffer, deltaTime)
      if (code)
        drawLiveDiffTextShimmer(buffer, code, highlightedLines, {
          frame,
          frameCount: LIVE_DIFF_SHIMMER_FRAME_COUNT,
          shineColor: shimmerColor,
        })
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
        frame = (frame + 1) % LIVE_DIFF_SHIMMER_FRAME_COUNT
        code.requestRender()
      }, LIVE_DIFF_SHIMMER_FRAME_MS)
    return () => {
      if (frameTimer) clearInterval(frameTimer)
      removeShimmer()
    }
  }, [patch, highlightedPatch, diff, shimmerColor])

  const highlightedLines = useMemo(
    () =>
      highlightedPatch?.patch === patch
        ? new Set(highlightedPatch.lines.map(({ line }) => line))
        : new Set<number>(),
    [highlightedPatch, patch],
  )
  const hiddenSeparatorLines = useMemo(() => new Set(separatorLines), [separatorLines])

  return {
    patch,
    highlightedLines,
    separatorLines: hiddenSeparatorLines,
  }
}
