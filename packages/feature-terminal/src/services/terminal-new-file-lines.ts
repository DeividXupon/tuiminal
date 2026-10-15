import { lstat, readFile } from "node:fs/promises"
import { resolve } from "node:path"

/** Bounded, read-only inspection of new files; binaries have no textual line count. */
export async function terminalNewFileLines(root: string, paths: string[], signal: AbortSignal) {
  let additions = 0
  let partial = false
  let remainingBytes = 8 * 1024 * 1024
  for (const path of paths) {
    signal.throwIfAborted()
    const absolute = resolve(root, path)
    const metadata = await lstat(absolute).catch(() => null)
    if (!metadata?.isFile()) continue
    if (metadata.size > 1024 * 1024 || metadata.size > remainingBytes) {
      partial = true
      continue
    }
    remainingBytes -= metadata.size
    const contents = await readFile(absolute, { signal })
    if (contents.includes(0)) continue
    let lines = 0
    for (const byte of contents) if (byte === 10) lines++
    additions += lines + Number(contents.length > 0 && contents.at(-1) !== 10)
  }
  return { additions, partial }
}
