import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  inspectRemoteProjectSync,
  localRemoteProjectArchiveCommand,
  localRemoteProjectHashCommand,
  localRemoteProjectManifestCommand,
  synchronizeRemoteProject,
} from "../packages/feature-terminal/src/services/remote-project-sync"

const requestedFiles = Number(process.env.TUIMINAL_SYNC_BENCHMARK_FILES ?? 4_000)
const fileCount =
  Number.isSafeInteger(requestedFiles) && requestedFiles > 0 ? requestedFiles : 4_000
const root = mkdtempSync(join(tmpdir(), "tuiminal-sync-benchmark-"))
const source = join(root, "source")
const destination = join(root, "project-sync")

function remote(path: string) {
  return {
    profile: { id: "benchmark", name: "Benchmark", host: "benchmark" },
    workingDirectory: path,
  }
}

function commands(path: string, transferred: string[]) {
  return {
    manifest: localRemoteProjectManifestCommand(path),
    hashes: (paths: readonly string[]) => localRemoteProjectHashCommand(path, paths),
    archive: (paths: readonly string[]) => {
      transferred.push(...paths)
      return localRemoteProjectArchiveCommand(path, paths)
    },
  }
}

async function measure<T>(operation: () => Promise<T>) {
  const started = performance.now()
  const value = await operation()
  return { value, milliseconds: performance.now() - started }
}

try {
  const sourceFileIndices: number[] = []
  for (const directory of ["src", "node_modules/cache", ".git/objects/fixture"])
    mkdirSync(join(source, directory), { recursive: true })
  writeFileSync(join(source, ".gitignore"), "node_modules/\n")
  for (let index = 0; index < fileCount; index++) {
    const folder =
      index % 5 === 0 ? "node_modules/cache" : index % 11 === 0 ? ".git/objects/fixture" : "src"
    if (folder === "src") sourceFileIndices.push(index)
    writeFileSync(join(source, folder, `file-${index}.txt`), `fixture ${index} ${"x".repeat(96)}\n`)
  }

  const initialTransfers: string[] = []
  const initial = await measure(() =>
    synchronizeRemoteProject({
      remote: remote(source),
      destination,
      signal: new AbortController().signal,
      commands: commands(source, initialTransfers),
    }),
  )
  const mapping = {
    profileId: "benchmark",
    sourcePath: source,
    remotePath: initial.value.remotePath,
    localPath: destination,
    remoteFingerprint: initial.value.remoteFingerprint,
    localFingerprint: initial.value.localFingerprint,
    syncedAt: Date.now(),
  }
  const unchanged = await measure(() =>
    inspectRemoteProjectSync({
      remote: remote(source),
      destination,
      mapping,
      snapshot: initial.value.snapshot,
      signal: new AbortController().signal,
      commands: commands(source, []),
    }),
  )
  const changed = sourceFileIndices.slice(0, 25)
  for (const [offset, index] of changed.entries())
    writeFileSync(
      join(source, "src", `file-${index}.txt`),
      `changed ${offset} ${"y".repeat(160)}\n`,
    )
  const removed = sourceFileIndices.at(-1)
  if (removed !== undefined) unlinkSync(join(source, "src", `file-${removed}.txt`))
  writeFileSync(join(source, "node_modules/cache", "new-cache.txt"), "new ignored cache entry\n")
  const comparison = await measure(() =>
    inspectRemoteProjectSync({
      remote: remote(source),
      destination,
      mapping,
      snapshot: initial.value.snapshot,
      signal: new AbortController().signal,
      commands: commands(source, []),
    }),
  )
  const deltaTransfers: string[] = []
  const delta = await measure(() =>
    synchronizeRemoteProject({
      remote: remote(source),
      destination,
      preview: comparison.value,
      signal: new AbortController().signal,
      commands: commands(source, deltaTransfers),
    }),
  )

  console.table([
    {
      scenario: "first complete sync",
      milliseconds: initial.milliseconds.toFixed(1),
      filesTransferred: initialTransfers.length,
      changes: initial.value.snapshot.remote.entries.length,
    },
    {
      scenario: "unchanged verification",
      milliseconds: unchanged.milliseconds.toFixed(1),
      filesTransferred: 0,
      changes: unchanged.value.changes.length,
    },
    {
      scenario: "small delta comparison",
      milliseconds: comparison.milliseconds.toFixed(1),
      filesTransferred: 0,
      changes: comparison.value.changes.length,
    },
    {
      scenario: "small delta sync",
      milliseconds: delta.milliseconds.toFixed(1),
      filesTransferred: deltaTransfers.length,
      changes: comparison.value.changes.length,
    },
  ])
  console.log(
    `Complete-tree benchmark: ${fileCount.toLocaleString("en-US")} files, including .git and ignored cache content.`,
  )
} finally {
  rmSync(root, { recursive: true, force: true })
}
