export type LiveDiffFile = {
  root: string
  path: string
  additions: number | null
  deletions: number | null
  fingerprint: string
  untracked: boolean
  newFile: boolean
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
  return source
    .split("\0")
    .flatMap((record) =>
      record.length >= 4 && record[2] === " "
        ? [{ status: record.slice(0, 2), path: record.slice(3) }]
        : [],
    )
}

export function parseLiveDiffNumstat(source: string) {
  const stats = new Map<string, { additions: number | null; deletions: number | null }>()
  for (const record of source.split("\0")) {
    const first = record.indexOf("\t")
    const second = record.indexOf("\t", first + 1)
    if (first < 0 || second < 0) continue
    const path = record.slice(second + 1)
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
