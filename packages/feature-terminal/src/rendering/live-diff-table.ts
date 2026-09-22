import { basename } from "node:path"
import { displayWidth, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import type { LiveDiffFile, LiveDiffFileStatus } from "../model/live-diff"

export const LIVE_DIFF_STATUS_WIDTH = 7
export const LIVE_DIFF_TIME_WIDTH = 5
export const LIVE_DIFF_CHANGE_WIDTH = 6

function displaySuffix(value: string, maxWidth: number) {
  const graphemes =
    typeof Intl.Segmenter === "function"
      ? Array.from(
          new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(value),
          (part) => part.segment,
        )
      : Array.from(value)
  let suffix = ""
  for (let index = graphemes.length - 1; index >= 0; index -= 1) {
    const next = graphemes[index] + suffix
    if (displayWidth(next) > maxWidth) break
    suffix = next
  }
  return suffix
}

export function abbreviatedFolder(name: string) {
  if (displayWidth(name) <= 12) return name
  return `${truncateDisplay(name, 5, "")}..${displaySuffix(name, 5)}`
}

export function liveDiffDisplayPath(root: string, path: string) {
  const parts = path.replaceAll("\\", "/").split("/").filter(Boolean)
  const filename = parts.at(-1) ?? path
  const parent = parts.length > 1 ? abbreviatedFolder(parts[parts.length - 2]!) : ""
  const project = abbreviatedFolder(basename(root))
  return parent ? `${project}/--/${parent}/${filename}` : `${project}/${filename}`
}

export function fittedLiveDiffPath(root: string, path: string, width: number) {
  const full = liveDiffDisplayPath(root, path)
  if (displayWidth(full) <= width) return full
  const tail = full.split("/--/").at(-1) ?? full
  return `…${displaySuffix(tail, Math.max(0, width - 1))}`
}

export function liveDiffPathWidth(listWidth: number) {
  return Math.max(
    1,
    listWidth - LIVE_DIFF_STATUS_WIDTH - LIVE_DIFF_TIME_WIDTH - LIVE_DIFF_CHANGE_WIDTH * 2 - 1,
  )
}

export function liveDiffFileStatus(
  file: Pick<LiveDiffFile, "change" | "newFile">,
): LiveDiffFileStatus {
  return file.change ?? (file.newFile ? "New" : "Edit")
}

export function liveDiffWrappedHeight(patch: string, previewWidth: number) {
  const codeWidth = Math.max(1, previewWidth - 9)
  const rows = patch.split("\n").reduce((count, line) => {
    if (!/^[ +\-]/.test(line)) return count
    return count + Math.max(1, Math.ceil(displayWidth(line.slice(1)) / codeWidth))
  }, 2)
  return Math.min(2000, rows)
}

export function liveDiffUnwrappedHeight(patch: string) {
  return Math.min(2000, 2 + patch.split("\n").filter((line) => /^[ +\-]/.test(line)).length)
}
