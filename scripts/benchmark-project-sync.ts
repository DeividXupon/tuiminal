import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { delimiter, join } from "node:path"
import {
  inspectRemoteProjectSync,
  synchronizeRemoteProject,
} from "../packages/feature-terminal/src/services/remote-project-sync"

const requestedFiles = Number(process.env.TUIMINAL_SYNC_BENCHMARK_FILES ?? 4_000)
const fileCount =
  Number.isSafeInteger(requestedFiles) && requestedFiles > 0 ? requestedFiles : 4_000
const root = mkdtempSync(join(tmpdir(), "tuiminal-sync-benchmark-"))
const source = join(root, "source")
const destination = join(root, "project-sync")
const sshLog = join(root, "ssh.log")
const previousPath = process.env.PATH
const previousSshLog = process.env.TUIMINAL_SYNC_BENCHMARK_SSH_LOG

function remote(path: string) {
  return {
    profile: { id: "benchmark", name: "Benchmark", host: "benchmark" },
    workingDirectory: path,
  }
}

async function measure<T>(operation: () => Promise<T>) {
  const started = performance.now()
  const value = await operation()
  return { value, milliseconds: performance.now() - started }
}

function sshConnections() {
  try {
    return readFileSync(sshLog, "utf8").split("\n").filter(Boolean).length
  } catch {
    return 0
  }
}

try {
  const bin = join(root, "bin")
  mkdirSync(bin)
  const ssh = join(bin, "ssh")
  writeFileSync(
    ssh,
    '#!/bin/sh\nprintf \'ssh\\n\' >> "$TUIMINAL_SYNC_BENCHMARK_SSH_LOG"\ncommand=\nfor argument in "$@"; do command=$argument; done\nexec sh -c "$command"\n',
  )
  chmodSync(ssh, 0o755)
  process.env.PATH = `${bin}${delimiter}${previousPath ?? ""}`
  process.env.TUIMINAL_SYNC_BENCHMARK_SSH_LOG = sshLog
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

  let previousConnections = sshConnections()
  const initial = await measure(() =>
    synchronizeRemoteProject({
      remote: remote(source),
      destination,
      signal: new AbortController().signal,
    }),
  )
  const initialConnections = sshConnections() - previousConnections
  const mapping = {
    profileId: "benchmark",
    sourcePath: source,
    remotePath: initial.value.remotePath,
    localPath: destination,
    remoteFingerprint: initial.value.remoteFingerprint,
    localFingerprint: initial.value.localFingerprint,
    syncedAt: Date.now(),
  }
  previousConnections = sshConnections()
  const unchanged = await measure(() =>
    inspectRemoteProjectSync({
      remote: remote(source),
      destination,
      mapping,
      snapshot: initial.value.snapshot,
      signal: new AbortController().signal,
    }),
  )
  const unchangedConnections = sshConnections() - previousConnections
  const changed = sourceFileIndices.slice(0, 25)
  for (const [offset, index] of changed.entries())
    writeFileSync(
      join(source, "src", `file-${index}.txt`),
      `changed ${offset} ${"y".repeat(160)}\n`,
    )
  const removed = sourceFileIndices.at(-1)
  if (removed !== undefined) unlinkSync(join(source, "src", `file-${removed}.txt`))
  writeFileSync(join(source, "node_modules/cache", "new-cache.txt"), "new ignored cache entry\n")
  previousConnections = sshConnections()
  const comparison = await measure(() =>
    inspectRemoteProjectSync({
      remote: remote(source),
      destination,
      mapping,
      snapshot: initial.value.snapshot,
      signal: new AbortController().signal,
    }),
  )
  const comparisonConnections = sshConnections() - previousConnections
  previousConnections = sshConnections()
  const delta = await measure(() =>
    synchronizeRemoteProject({
      remote: remote(source),
      destination,
      preview: comparison.value,
      signal: new AbortController().signal,
    }),
  )
  const deltaConnections = sshConnections() - previousConnections

  console.table([
    {
      scenario: "first complete sync",
      milliseconds: initial.milliseconds.toFixed(1),
      sshConnections: initialConnections,
      filesTransferred: initial.value.snapshot.remote.entries.filter(
        (entry) => entry.type === "file",
      ).length,
      changes: initial.value.snapshot.remote.entries.length,
    },
    {
      scenario: "unchanged verification",
      milliseconds: unchanged.milliseconds.toFixed(1),
      sshConnections: unchangedConnections,
      filesTransferred: 0,
      changes: unchanged.value.changes.length,
    },
    {
      scenario: "small delta comparison",
      milliseconds: comparison.milliseconds.toFixed(1),
      sshConnections: comparisonConnections,
      filesTransferred: 0,
      changes: comparison.value.changes.length,
    },
    {
      scenario: "small delta sync",
      milliseconds: delta.milliseconds.toFixed(1),
      sshConnections: deltaConnections,
      filesTransferred: comparison.value.changes.filter((change) => change.transferBytes > 0)
        .length,
      changes: comparison.value.changes.length,
    },
  ])
  console.log(
    `Complete-tree benchmark: ${fileCount.toLocaleString("en-US")} files, including .git and ignored cache content.`,
  )
} finally {
  if (previousPath === undefined) delete process.env.PATH
  else process.env.PATH = previousPath
  if (previousSshLog === undefined) delete process.env.TUIMINAL_SYNC_BENCHMARK_SSH_LOG
  else process.env.TUIMINAL_SYNC_BENCHMARK_SSH_LOG = previousSshLog
  rmSync(root, { recursive: true, force: true })
}
