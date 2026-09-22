export type LiveDiffFileStatus = "New" | "Edit" | "Delete" | "Rename" | "Copy" | "Type"

export type LiveDiffFile = {
  root: string
  path: string
  originalPath?: string
  additions: number | null
  deletions: number | null
  fingerprint: string
  untracked: boolean
  newFile: boolean
  change?: LiveDiffFileStatus
  headExists: boolean
  changedAt: number
}

export type LiveDiffRoot = { root: string; files: LiveDiffFile[] }

export function liveDiffElapsedLabel(timestamp: number, now: number) {
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h`
}

export function parseLiveDiffStatus(source: string) {
  const records = source.split("\0")
  const parsed: Array<{ status: string; path: string; originalPath?: string }> = []
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index] ?? ""
    if (record.length < 4 || record[2] !== " ") continue
    const status = record.slice(0, 2)
    const path = record.slice(3)
    const originalPath = /[RC]/.test(status) ? records[++index] : undefined
    parsed.push({ status, path, ...(originalPath ? { originalPath } : {}) })
  }
  return parsed
}

export function parseLiveDiffNameStatus(source: string) {
  const records = source.split("\0")
  const parsed = new Map<string, { code: string; originalPath?: string }>()
  for (let index = 0; index < records.length; ) {
    const code = records[index++] ?? ""
    if (!code) continue
    if (/^[RC]/.test(code)) {
      const originalPath = records[index++] ?? ""
      const path = records[index++] ?? ""
      if (path) parsed.set(path, { code: code[0]!, originalPath })
    } else {
      const path = records[index++] ?? ""
      if (path) parsed.set(path, { code: code[0]! })
    }
  }
  return parsed
}

export function parseLiveDiffNumstat(source: string) {
  const stats = new Map<string, { additions: number | null; deletions: number | null }>()
  const records = source.split("\0")
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index] ?? ""
    const first = record.indexOf("\t")
    const second = record.indexOf("\t", first + 1)
    if (first < 0 || second < 0) continue
    const inlinePath = record.slice(second + 1)
    const path = inlinePath || records[index + 2] || records[index + 1] || ""
    if (!inlinePath) index += 2
    if (!path) continue
    const additions = Number(record.slice(0, first))
    const deletions = Number(record.slice(first + 1, second))
    stats.set(path, {
      additions: Number.isFinite(additions) ? additions : null,
      deletions: Number.isFinite(deletions) ? deletions : null,
    })
  }
  return stats
}

export function mergeLiveDiffFiles(
  previous: readonly LiveDiffFile[],
  current: readonly Omit<LiveDiffFile, "changedAt">[],
  now: number,
) {
  const prior = new Map(previous.map((file) => [`${file.root}\0${file.path}`, file]))
  return current
    .map((file) => {
      const old = prior.get(`${file.root}\0${file.path}`)
      return { ...file, changedAt: old?.fingerprint === file.fingerprint ? old.changedAt : now }
    })
    .sort((left, right) => right.changedAt - left.changedAt)
}

export function liveDiffTotals(files: readonly LiveDiffFile[]) {
  return files.reduce(
    (total, file) => ({
      files: total.files + 1,
      additions: total.additions + (file.additions ?? 0),
      deletions: total.deletions + (file.deletions ?? 0),
      unknown: total.unknown + Number(file.additions === null || file.deletions === null),
    }),
    { files: 0, additions: 0, deletions: 0, unknown: 0 },
  )
}
