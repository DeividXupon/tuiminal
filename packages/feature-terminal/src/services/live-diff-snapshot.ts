import type { LiveDiffFile } from "../model/live-diff"
import { readLiveDiffRoot } from "./live-diff"

export async function collectLiveDiffSnapshot(
  roots: readonly string[],
  previous: readonly LiveDiffFile[],
  signal: AbortSignal,
) {
  const key = (file: Pick<LiveDiffFile, "root" | "path">) => `${file.root}\0${file.path}`
  const results = await Promise.allSettled(roots.map((root) => readLiveDiffRoot(root, signal)))
  const failed = results.some((result) => result.status === "rejected")
  const truncated = results.some(
    (result) => result.status === "fulfilled" && result.value.truncated,
  )
  const files = results.flatMap((result, index) =>
    result.status === "fulfilled"
      ? result.value.files
      : previous.filter((file) => file.root === roots[index]),
  )
  const previousByKey = new Map(previous.map((file) => [key(file), file]))
  const nextKeys = new Set(files.map(key))
  const changed = files.find((file) => {
    const old = previousByKey.get(key(file))
    return !old || old.fingerprint !== file.fingerprint
  })
  const removed = previous.find((old) => roots.includes(old.root) && !nextKeys.has(key(old)))
  return {
    files,
    failed,
    truncated,
    changedRoot: (changed ?? removed)?.root ?? "",
    changed: Boolean(changed || removed || files.length !== previous.length),
  }
}
