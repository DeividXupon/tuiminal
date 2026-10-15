import "./setup"
import { afterEach, expect, test } from "bun:test"
import {
  lstatSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs"
import { mkdir, rename } from "node:fs/promises"
import { tmpdir } from "node:os"
import { delimiter, join } from "node:path"
import { remoteProjectSyncReviewStatus } from "../packages/feature-terminal/src/model/remote-project-sync"
import {
  inspectRemoteProjectSync,
  localRemoteProjectArchiveCommand,
  localRemoteProjectHashCommand,
  localRemoteProjectManifestCommand,
  readLocalProjectFingerprint,
  readRemoteProjectFingerprint,
  remoteProjectSyncDestination,
  synchronizeRemoteProject,
} from "../packages/feature-terminal/src/services/remote-project-sync"
import { collectProjectSyncProcess } from "../packages/feature-terminal/src/services/remote-project-sync-manifest"
import {
  loadRemoteProjectSyncMappings,
  loadRemoteProjectSyncSnapshot,
  saveRemoteProjectSyncMapping,
  saveRemoteProjectSyncSnapshot,
} from "../packages/feature-terminal/src/services/remote-project-sync-state"

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function temporaryRoot() {
  const root = mkdtempSync(join(tmpdir(), "tuiminal-project-sync-"))
  roots.push(root)
  return root
}

function remote(path: string) {
  return {
    profile: { id: "fixture", name: "Fixture", host: "fixture" },
    workingDirectory: path,
  }
}

function localCommands(source: string, transferred?: string[], hashed?: string[]) {
  return {
    manifest: localRemoteProjectManifestCommand(source),
    hashes: (paths: readonly string[]) => {
      hashed?.push(...paths)
      return localRemoteProjectHashCommand(source, paths)
    },
    archive: (paths: readonly string[]) => {
      transferred?.push(...paths)
      return localRemoteProjectArchiveCommand(source, paths)
    },
  }
}

test("derives a safe and stable local sync folder name", () => {
  expect(remoteProjectSyncDestination("/local/projects", "/tui")).toBe(
    join("/local/projects", "tui-sync"),
  )
  expect(remoteProjectSyncDestination("/local/projects", "/")).toBe(
    join("/local/projects", "root-sync"),
  )
  expect(remoteProjectSyncDestination("/local/projects", "/bad:name")).toBe(
    join("/local/projects", "bad-name-sync"),
  )
})

test("fingerprints complete local and remote trees, including hidden content", async () => {
  const source = temporaryRoot()
  await mkdir(join(source, ".git"))
  writeFileSync(join(source, ".git", "HEAD"), "ref: refs/heads/main\n")
  writeFileSync(join(source, ".hidden"), "secret\n")
  writeFileSync(join(source, "tracked.txt"), "one\n")
  const signal = new AbortController().signal
  const localBefore = await readLocalProjectFingerprint(source, signal)
  const inspected = await readRemoteProjectFingerprint(remote(source), signal, {
    command: localRemoteProjectManifestCommand(source),
  })
  expect(inspected.canonicalPath).toBe(realpathSync(source))
  expect(inspected.entries.find((entry) => entry.path === "tracked.txt")?.mode).toBe(
    statSync(join(source, "tracked.txt")).mode & 0o7777,
  )
  writeFileSync(join(source, "tracked.txt"), "changed content\n")
  expect(await readLocalProjectFingerprint(source, signal)).not.toBe(localBefore)
  expect(
    (
      await readRemoteProjectFingerprint(remote(source), signal, {
        command: localRemoteProjectManifestCommand(source),
      })
    ).fingerprint,
  ).not.toBe(inspected.fingerprint)
})

test.each([
  ["644", 0o644],
  ["755", 0o755],
  ["100600", 0o600],
  ["100644", 0o644],
  ["100755", 0o755],
  ["40755", 0o755],
  ["41777", 0o1777],
] as const)(
  "remote manifests preserve octal permission bits from mode %s",
  async (mode, expected) => {
    const output = [
      "TUIMINAL_ROOT",
      "/fixture/project",
      "TUIMINAL_ENTRY",
      "entry",
      mode.startsWith("4") ? "d" : "f",
      `${mode}|0|1700000000|1700000000`,
      "",
      "",
      "",
    ].join("\0")
    const manifest = await readRemoteProjectFingerprint(
      remote("/fixture/project"),
      new AbortController().signal,
      { command: [process.execPath, "-e", `process.stdout.write(${JSON.stringify(output)})`] },
    )
    expect(manifest.entries[0]?.mode).toBe(expected)
  },
)

test("fallback manifests detect equal-size edits with preserved modification times", async () => {
  const root = temporaryRoot()
  const source = join(root, "source")
  const bin = join(root, "bin")
  await mkdir(source)
  await mkdir(bin)
  const systemFind = Bun.which("find")
  if (!systemFind) throw new Error("Missing find utility for the manifest fixture")
  writeFileSync(
    join(bin, "find"),
    '#!/bin/sh\nfor argument do\n  if [ "$argument" = "-printf" ]; then exit 1; fi\ndone\nexec "$TUIMINAL_TEST_SYSTEM_FIND" "$@"\n',
    { mode: 0o700 },
  )
  const file = join(source, "change.txt")
  const modified = new Date("2024-01-01T00:00:00.125Z")
  writeFileSync(file, "before\n")
  utimesSync(file, modified, modified)
  const command = [
    "env",
    `PATH=${bin}${delimiter}${process.env.PATH ?? ""}`,
    `TUIMINAL_TEST_SYSTEM_FIND=${systemFind}`,
    ...localRemoteProjectManifestCommand(source),
  ]
  const signal = new AbortController().signal
  const before = await readRemoteProjectFingerprint(remote(source), signal, { command })
  expect(before.entries[0]?.modifiedAt).toBe(modified.getTime())
  await Bun.sleep(5)
  writeFileSync(file, "after!\n")
  utimesSync(file, modified, modified)
  const after = await readRemoteProjectFingerprint(remote(source), signal, { command })
  expect(after.entries[0]?.size).toBe(before.entries[0]?.size)
  expect(after.entries[0]?.modifiedAt).toBe(before.entries[0]?.modifiedAt)
  expect(after.entries[0]?.metadataKey).not.toBe(before.entries[0]?.metadataKey)
  expect(after.fingerprint).not.toBe(before.fingerprint)
})

test("always synchronizes the complete tree at a Git repository root", async () => {
  const root = temporaryRoot()
  const source = join(root, "source")
  const destination = join(root, "project-sync")
  await mkdir(join(source, "node_modules", "package"), { recursive: true })
  await mkdir(join(source, ".cache"), { recursive: true })
  writeFileSync(join(source, ".gitignore"), "node_modules/\n")
  writeFileSync(join(source, ".cache", "runtime.dat"), "cached\n")
  writeFileSync(join(source, "tracked.txt"), "tracked\n")
  writeFileSync(join(source, "untracked.txt"), "untracked\n")
  writeFileSync(join(source, "node_modules", "package", "ignored.js"), "ignored\n")
  expect(Bun.spawnSync(["git", "init", "-q", source]).exitCode).toBe(0)
  expect(Bun.spawnSync(["git", "-C", source, "add", ".gitignore", "tracked.txt"]).exitCode).toBe(0)

  const manifest = await readRemoteProjectFingerprint(
    remote(source),
    new AbortController().signal,
    {
      command: localRemoteProjectManifestCommand(source),
    },
  )
  expect(manifest.scope).toBe("complete")
  expect(manifest.entries.some((entry) => entry.path === ".git/HEAD")).toBe(true)
  expect(manifest.entries.some((entry) => entry.path === "node_modules/package/ignored.js")).toBe(
    true,
  )

  const first = await synchronizeRemoteProject({
    remote: remote(source),
    destination,
    signal: new AbortController().signal,
    commands: localCommands(source),
  })
  expect(readFileSync(join(destination, "tracked.txt"), "utf8")).toBe("tracked\n")
  expect(readFileSync(join(destination, "untracked.txt"), "utf8")).toBe("untracked\n")
  expect(readFileSync(join(destination, ".git", "HEAD"), "utf8").length).toBeGreaterThan(0)
  expect(readFileSync(join(destination, ".cache", "runtime.dat"), "utf8")).toBe("cached\n")
  expect(readFileSync(join(destination, "node_modules", "package", "ignored.js"), "utf8")).toBe(
    "ignored\n",
  )

  const gitConfig = join(source, ".git", "config")
  writeFileSync(gitConfig, `${readFileSync(gitConfig, "utf8")}\n# quiet change\n`)
  writeFileSync(join(source, ".cache", "runtime.dat"), "cache change\n")
  writeFileSync(join(source, "node_modules", "package", "ignored.js"), "ignored change\n")
  const quietPreview = await inspectRemoteProjectSync({
    remote: remote(source),
    destination,
    mapping: {
      profileId: "fixture",
      sourcePath: source,
      remotePath: first.remotePath,
      localPath: destination,
      remoteFingerprint: first.remoteFingerprint,
      localFingerprint: first.localFingerprint,
      syncedAt: 1,
    },
    snapshot: first.snapshot,
    signal: new AbortController().signal,
    commands: localCommands(source),
  })
  expect(quietPreview.changes.map((change) => change.path)).toContain(".git/config")
  expect(quietPreview.changes.map((change) => change.path)).toContain(".cache/runtime.dat")
  expect(quietPreview.changes.map((change) => change.path)).toContain(
    "node_modules/package/ignored.js",
  )
  expect(quietPreview.indicator).toEqual({ changeCount: 0, difference: null })
  expect(remoteProjectSyncReviewStatus(quietPreview)).toEqual({
    kind: "synced",
    localPath: destination,
  })

  writeFileSync(join(source, "tracked.txt"), "changed\n")
  writeFileSync(join(source, "node_modules", "package", "ignored.js"), "ignored again\n")
  const preview = await inspectRemoteProjectSync({
    remote: remote(source),
    destination,
    mapping: {
      profileId: "fixture",
      sourcePath: source,
      remotePath: first.remotePath,
      localPath: destination,
      remoteFingerprint: first.remoteFingerprint,
      localFingerprint: first.localFingerprint,
      syncedAt: 2,
    },
    snapshot: first.snapshot,
    signal: new AbortController().signal,
    commands: localCommands(source),
  })
  expect(preview.changes.map((change) => change.path)).toContain("tracked.txt")
  expect(preview.changes.map((change) => change.path)).toContain("node_modules/package/ignored.js")
  expect(preview.indicator).toEqual({ changeCount: 1, difference: "remote" })
  expect(remoteProjectSyncReviewStatus(preview)).toEqual({
    kind: "out-of-sync",
    localPath: destination,
    difference: "remote",
  })
})

test("uses the caller deadline for remote project verification", async () => {
  const delayedManifest = ["sh", "-c", "sleep 0.05; printf 'TUIMINAL_ROOT\\000/tmp\\000'"] as const
  await expect(
    readRemoteProjectFingerprint(remote("/tmp"), new AbortController().signal, {
      command: delayedManifest,
      timeoutMs: 10,
    }),
  ).rejects.toThrow("A verificação do projeto excedeu o tempo limite.")
  expect(
    await readRemoteProjectFingerprint(remote("/tmp"), new AbortController().signal, {
      command: delayedManifest,
      timeoutMs: 1_000,
    }),
  ).toMatchObject({ canonicalPath: "/tmp" })
})

test("reports an actionable error when SSH resets during verification", async () => {
  await expect(
    collectProjectSyncProcess(
      [
        "sh",
        "-c",
        "printf 'kex_exchange_identification: read: Connection reset by peer\\n' >&2; exit 255",
      ],
      new AbortController().signal,
      { timeoutMs: 1_000, maximumBytes: 1_024 },
    ),
  ).rejects.toThrow("A conexão SSH foi encerrada; verifique o perfil remoto e tente novamente.")
})

test("publishes a complete replacement and removes stale local files", async () => {
  const root = temporaryRoot()
  const source = join(root, "source")
  const destination = join(root, "project-sync")
  await mkdir(join(source, ".git"), { recursive: true })
  await mkdir(destination)
  writeFileSync(join(source, ".hidden"), "hidden\n")
  writeFileSync(join(source, ".git", "HEAD"), "main\n")
  writeFileSync(join(source, "remote.txt"), "remote\n")
  writeFileSync(join(destination, "stale.txt"), "stale\n")
  const result = await synchronizeRemoteProject({
    remote: remote(source),
    destination,
    signal: new AbortController().signal,
    commands: {
      manifest: localRemoteProjectManifestCommand(source),
      archive: localRemoteProjectArchiveCommand(source),
    },
  })
  expect(readFileSync(join(destination, "remote.txt"), "utf8")).toBe("remote\n")
  expect(readFileSync(join(destination, ".hidden"), "utf8")).toBe("hidden\n")
  expect(readFileSync(join(destination, ".git", "HEAD"), "utf8")).toBe("main\n")
  expect(() => readFileSync(join(destination, "stale.txt"))).toThrow()
  expect(result.localFingerprint).toBe(
    await readLocalProjectFingerprint(destination, new AbortController().signal),
  )
})

test("previews per-path changes and transfers only changed file contents", async () => {
  const root = temporaryRoot()
  const source = join(root, "source")
  const destination = join(root, "project-sync")
  await mkdir(source)
  writeFileSync(join(source, "keep.txt"), "keep\n")
  writeFileSync(join(source, "change.txt"), "before\n")
  writeFileSync(join(source, "remove.txt"), "remove\n")
  const first = await synchronizeRemoteProject({
    remote: remote(source),
    destination,
    signal: new AbortController().signal,
    commands: localCommands(source),
  })
  const originalTime = statSync(join(source, "change.txt")).mtime
  await Bun.sleep(5)
  writeFileSync(join(source, "change.txt"), "after!\n")
  utimesSync(join(source, "change.txt"), originalTime, originalTime)
  writeFileSync(join(source, "new.txt"), "new\n")
  unlinkSync(join(source, "remove.txt"))
  const mapping = {
    profileId: "fixture",
    sourcePath: source,
    remotePath: first.remotePath,
    localPath: destination,
    remoteFingerprint: first.remoteFingerprint,
    localFingerprint: first.localFingerprint,
    syncedAt: 1,
  }
  const hashed: string[] = []
  const preview = await inspectRemoteProjectSync({
    remote: remote(source),
    destination,
    mapping,
    snapshot: first.snapshot,
    signal: new AbortController().signal,
    commands: localCommands(source, undefined, hashed),
  })
  expect(hashed.sort()).toEqual(["change.txt", "new.txt"])
  expect(
    preview.changes.map(({ path, action, localChanged }) => ({
      path,
      action,
      localChanged,
    })),
  ).toEqual([
    { path: "change.txt", action: "update", localChanged: false },
    { path: "new.txt", action: "add", localChanged: false },
    { path: "remove.txt", action: "delete", localChanged: false },
  ])
  const transferred: string[] = []
  const progress: number[] = []
  const keepInode = statSync(join(destination, "keep.txt")).ino
  await synchronizeRemoteProject({
    remote: remote(source),
    destination,
    preview,
    signal: new AbortController().signal,
    commands: localCommands(source, transferred),
    onProgress: (value) => progress.push(value),
  })
  expect(transferred.sort()).toEqual(["change.txt", "new.txt"])
  expect(readFileSync(join(destination, "keep.txt"), "utf8")).toBe("keep\n")
  expect(statSync(join(destination, "keep.txt")).ino).toBe(keepInode)
  expect(readFileSync(join(destination, "change.txt"), "utf8")).toBe("after!\n")
  expect(() => readFileSync(join(destination, "remove.txt"))).toThrow()
  expect(progress.at(-1)).toBe(1)
  expect(progress.every((value, index) => index === 0 || value >= (progress[index - 1] ?? 0))).toBe(
    true,
  )
})

test("preserves parent directory metadata after replacing a nested file", async () => {
  const root = temporaryRoot()
  const source = join(root, "source")
  const destination = join(root, "project-sync")
  const sourceDirectory = join(source, "src")
  const destinationDirectory = join(destination, "src")
  await mkdir(sourceDirectory, { recursive: true })
  writeFileSync(join(sourceDirectory, "nested.txt"), "before\n")
  const directoryTime = new Date("2024-01-02T03:04:05.000Z")
  utimesSync(sourceDirectory, directoryTime, directoryTime)
  const first = await synchronizeRemoteProject({
    remote: remote(source),
    destination,
    signal: new AbortController().signal,
    commands: localCommands(source),
  })
  const expectedDirectoryTime = Math.floor(statSync(sourceDirectory).mtimeMs)
  writeFileSync(join(sourceDirectory, "nested.txt"), "after with a new size\n")
  expect(Math.floor(statSync(sourceDirectory).mtimeMs)).toBe(expectedDirectoryTime)
  const preview = await inspectRemoteProjectSync({
    remote: remote(source),
    destination,
    mapping: {
      profileId: "fixture",
      sourcePath: source,
      remotePath: first.remotePath,
      localPath: destination,
      remoteFingerprint: first.remoteFingerprint,
      localFingerprint: first.localFingerprint,
      syncedAt: 1,
    },
    snapshot: first.snapshot,
    signal: new AbortController().signal,
    commands: localCommands(source),
  })
  expect(preview.changes.map((change) => change.path)).toEqual(["src/nested.txt"])
  await synchronizeRemoteProject({
    remote: remote(source),
    destination,
    preview,
    signal: new AbortController().signal,
    commands: localCommands(source),
  })
  expect(readFileSync(join(destinationDirectory, "nested.txt"), "utf8")).toBe(
    "after with a new size\n",
  )
  expect(Math.floor(statSync(destinationDirectory).mtimeMs)).toBe(expectedDirectoryTime)
})

test("rolls back a partially applied delta when synchronization is cancelled", async () => {
  const root = temporaryRoot()
  const source = join(root, "source")
  const destination = join(root, "project-sync")
  const sourceDirectory = join(source, "nested")
  const destinationDirectory = join(destination, "nested")
  await mkdir(sourceDirectory, { recursive: true })
  writeFileSync(join(sourceDirectory, "one.txt"), "one before\n")
  writeFileSync(join(sourceDirectory, "two.txt"), "two before\n")
  const directoryTime = new Date("2024-02-03T04:05:06.000Z")
  utimesSync(sourceDirectory, directoryTime, directoryTime)
  const first = await synchronizeRemoteProject({
    remote: remote(source),
    destination,
    signal: new AbortController().signal,
    commands: localCommands(source),
  })
  const originalDirectory = statSync(destinationDirectory)
  writeFileSync(join(sourceDirectory, "one.txt"), "one after with a new size\n")
  writeFileSync(join(sourceDirectory, "two.txt"), "two after with a new size\n")
  const preview = await inspectRemoteProjectSync({
    remote: remote(source),
    destination,
    mapping: {
      profileId: "fixture",
      sourcePath: source,
      remotePath: first.remotePath,
      localPath: destination,
      remoteFingerprint: first.remoteFingerprint,
      localFingerprint: first.localFingerprint,
      syncedAt: 1,
    },
    snapshot: first.snapshot,
    signal: new AbortController().signal,
    commands: localCommands(source),
  })
  expect(preview.changes.map((change) => change.path)).toEqual(["nested/one.txt", "nested/two.txt"])
  const controller = new AbortController()
  await expect(
    synchronizeRemoteProject({
      remote: remote(source),
      destination,
      preview,
      signal: controller.signal,
      commands: localCommands(source),
      onProgress: (progress) => {
        if (progress > 0.9) controller.abort(new Error("Operação cancelada."))
      },
    }),
  ).rejects.toThrow("Operação cancelada.")
  expect(readFileSync(join(destinationDirectory, "one.txt"), "utf8")).toBe("one before\n")
  expect(readFileSync(join(destinationDirectory, "two.txt"), "utf8")).toBe("two before\n")
  const restoredDirectory = statSync(destinationDirectory)
  expect(restoredDirectory.mode & 0o7777).toBe(originalDirectory.mode & 0o7777)
  expect(Math.floor(restoredDirectory.mtimeMs)).toBe(Math.floor(originalDirectory.mtimeMs))
})

test("recovers an interrupted delta before the next inspection", async () => {
  const root = temporaryRoot()
  const source = join(root, "source")
  const destination = join(root, "project-sync")
  await mkdir(source)
  writeFileSync(join(source, "project.txt"), "original\n")
  const first = await synchronizeRemoteProject({
    remote: remote(source),
    destination,
    signal: new AbortController().signal,
    commands: localCommands(source),
  })
  const transaction = join(root, ".project-sync.tuiminal-sync-interrupted")
  await mkdir(join(transaction, "backup"), { recursive: true })
  await rename(join(destination, "project.txt"), join(transaction, "backup", "project.txt"))
  writeFileSync(join(destination, "project.txt"), "partial replacement\n")
  writeFileSync(
    join(transaction, "journal.jsonl"),
    `${JSON.stringify({ kind: "backup", path: "project.txt" })}\n${JSON.stringify({ kind: "install", path: "project.txt" })}\n`,
  )
  const preview = await inspectRemoteProjectSync({
    remote: remote(source),
    destination,
    mapping: {
      profileId: "fixture",
      sourcePath: source,
      remotePath: first.remotePath,
      localPath: destination,
      remoteFingerprint: first.remoteFingerprint,
      localFingerprint: first.localFingerprint,
      syncedAt: 1,
    },
    snapshot: first.snapshot,
    signal: new AbortController().signal,
    commands: localCommands(source),
  })
  expect(preview.changes).toEqual([])
  expect(readFileSync(join(destination, "project.txt"), "utf8")).toBe("original\n")
  expect(() => statSync(transaction)).toThrow()
})

test("creates native file and directory symbolic links", async () => {
  if (process.platform === "win32") return
  const root = temporaryRoot()
  const source = join(root, "source")
  const destination = join(root, "project-sync")
  await mkdir(join(source, "target-directory"), { recursive: true })
  writeFileSync(join(source, "target.txt"), "target\n")
  writeFileSync(join(source, "target-directory", "nested.txt"), "nested\n")
  symlinkSync("target.txt", join(source, "file-link"))
  symlinkSync("target-directory", join(source, "directory-link"))
  await synchronizeRemoteProject({
    remote: remote(source),
    destination,
    signal: new AbortController().signal,
    commands: localCommands(source),
  })
  expect(lstatSync(join(destination, "file-link")).isSymbolicLink()).toBe(true)
  expect(readlinkSync(join(destination, "file-link"))).toBe("target.txt")
  expect(lstatSync(join(destination, "directory-link")).isSymbolicLink()).toBe(true)
  expect(readlinkSync(join(destination, "directory-link"))).toBe("target-directory")
})

test("reuses snapshot digests when an existing mapping has not changed", async () => {
  const root = temporaryRoot()
  const source = join(root, "source")
  const destination = join(root, "project-sync")
  await mkdir(source)
  writeFileSync(join(source, "one.txt"), "one\n")
  writeFileSync(join(source, "two.txt"), "two\n")
  const first = await synchronizeRemoteProject({
    remote: remote(source),
    destination,
    signal: new AbortController().signal,
    commands: localCommands(source),
  })
  const hashed: string[] = []
  const preview = await inspectRemoteProjectSync({
    remote: remote(source),
    destination,
    mapping: {
      profileId: "fixture",
      sourcePath: source,
      remotePath: first.remotePath,
      localPath: destination,
      remoteFingerprint: first.remoteFingerprint,
      localFingerprint: first.localFingerprint,
      syncedAt: 1,
    },
    snapshot: first.snapshot,
    signal: new AbortController().signal,
    commands: localCommands(source, undefined, hashed),
  })
  expect(preview.changes).toEqual([])
  expect(hashed).toEqual([])
})

test("marks local edits as conflicts without misclassifying remote-only changes", async () => {
  const root = temporaryRoot()
  const source = join(root, "source")
  const destination = join(root, "project-sync")
  await mkdir(source)
  writeFileSync(join(source, "local.txt"), "baseline\n")
  writeFileSync(join(source, "remote.txt"), "baseline\n")
  const first = await synchronizeRemoteProject({
    remote: remote(source),
    destination,
    signal: new AbortController().signal,
    commands: localCommands(source),
  })
  writeFileSync(join(destination, "local.txt"), "local edit\n")
  writeFileSync(join(source, "remote.txt"), "remote edit\n")
  const preview = await inspectRemoteProjectSync({
    remote: remote(source),
    destination,
    mapping: {
      profileId: "fixture",
      sourcePath: source,
      remotePath: first.remotePath,
      localPath: destination,
      remoteFingerprint: first.remoteFingerprint,
      localFingerprint: first.localFingerprint,
      syncedAt: 1,
    },
    snapshot: first.snapshot,
    signal: new AbortController().signal,
    commands: localCommands(source),
  })
  expect(preview.hasLocalChanges).toBe(true)
  expect(preview.changes.find((change) => change.path === "local.txt")?.localChanged).toBe(true)
  expect(preview.changes.find((change) => change.path === "remote.txt")?.localChanged).toBe(false)
})

test("keeps a local change made immediately before publication", async () => {
  const root = temporaryRoot()
  const source = join(root, "source")
  const destination = join(root, "project-sync")
  await mkdir(source)
  await mkdir(destination)
  writeFileSync(join(source, "remote.txt"), "remote\n")
  writeFileSync(join(destination, "local.txt"), "keep\n")
  await expect(
    synchronizeRemoteProject({
      remote: remote(source),
      destination,
      signal: new AbortController().signal,
      commands: {
        manifest: localRemoteProjectManifestCommand(source),
        archive: localRemoteProjectArchiveCommand(source),
      },
      beforePublish: async () => {
        writeFileSync(join(destination, "local.txt"), "changed during sync\n")
      },
    }),
  ).rejects.toThrow("A cópia local mudou durante a sincronização")
  expect(readFileSync(join(destination, "local.txt"), "utf8")).toBe("changed during sync\n")
  expect(() => readFileSync(join(destination, "remote.txt"))).toThrow()
})

test("rejects local and remote changes made after the reviewed preview", async () => {
  const root = temporaryRoot()
  const source = join(root, "source")
  const destination = join(root, "project-sync")
  await mkdir(source)
  writeFileSync(join(source, "remote.txt"), "reviewed\n")
  const reviewed = await inspectRemoteProjectSync({
    remote: remote(source),
    destination,
    signal: new AbortController().signal,
    commands: localCommands(source),
  })
  await mkdir(destination)
  await expect(
    synchronizeRemoteProject({
      remote: remote(source),
      destination,
      preview: reviewed,
      signal: new AbortController().signal,
      commands: localCommands(source),
    }),
  ).rejects.toThrow("A cópia local mudou durante a sincronização")
  expect(() => readFileSync(join(destination, "remote.txt"))).toThrow()

  rmSync(destination, { recursive: true, force: true })
  const reviewedAgain = await inspectRemoteProjectSync({
    remote: remote(source),
    destination,
    signal: new AbortController().signal,
    commands: localCommands(source),
  })
  writeFileSync(join(source, "remote.txt"), "changed after review\n")
  await expect(
    synchronizeRemoteProject({
      remote: remote(source),
      destination,
      preview: reviewedAgain,
      signal: new AbortController().signal,
      commands: localCommands(source),
    }),
  ).rejects.toThrow("O projeto remoto mudou durante a sincronização")
  expect(() => readFileSync(join(destination, "remote.txt"))).toThrow()
})

test("persists bounded project mappings outside the synchronized project", () => {
  const data = temporaryRoot()
  const environment = {
    ...process.env,
    XDG_DATA_HOME: data,
    TUIMINAL_TERMINAL_WORKSPACE_STATE: "1",
  }
  const mapping = {
    profileId: "fixture",
    sourcePath: "/srv/tui",
    remotePath: "/srv/tui",
    localPath: join(data, "tui-sync"),
    remoteFingerprint: "a".repeat(64),
    localFingerprint: "b".repeat(64),
    syncedAt: 1,
  }
  saveRemoteProjectSyncMapping(mapping, environment)
  expect(loadRemoteProjectSyncMappings(environment)).toEqual([mapping])
  const automaticMapping = { ...mapping, automatic: true, syncedAt: 2 }
  saveRemoteProjectSyncMapping(automaticMapping, environment)
  expect(loadRemoteProjectSyncMappings(environment)).toEqual([automaticMapping])
  rmSync(join(data, "tuiminal"), { recursive: true, force: true })
  expect(loadRemoteProjectSyncMappings(environment)).toEqual([])
})

test("persists validated compressed sync snapshots and links them from the mapping", async () => {
  const data = temporaryRoot()
  const environment = {
    ...process.env,
    XDG_DATA_HOME: data,
    TUIMINAL_TERMINAL_WORKSPACE_STATE: "1",
  }
  const localPath = join(data, "tui-sync")
  const mapping = {
    profileId: "fixture",
    sourcePath: "/srv/tui",
    remotePath: "/srv/tui",
    localPath,
    remoteFingerprint: "a".repeat(64),
    localFingerprint: "b".repeat(64),
    syncedAt: 1,
  }
  const snapshot = {
    version: 1 as const,
    remote: {
      fingerprint: mapping.remoteFingerprint,
      canonicalPath: mapping.remotePath,
      entries: [],
      hasUnsupported: false,
      hasSymlink: false,
    },
    local: {
      fingerprint: mapping.localFingerprint,
      canonicalPath: localPath,
      entries: [],
      hasUnsupported: false,
      hasSymlink: false,
    },
  }
  const saved = await saveRemoteProjectSyncSnapshot(mapping, snapshot, environment)
  expect(saved.snapshotId).toBeString()
  expect(loadRemoteProjectSyncMappings(environment)).toEqual([saved])
  expect(await loadRemoteProjectSyncSnapshot(saved, environment)).toEqual(snapshot)
})

test("yields while validating and compressing a large synchronization snapshot", async () => {
  const data = temporaryRoot()
  const environment = {
    ...process.env,
    XDG_DATA_HOME: data,
    TUIMINAL_TERMINAL_WORKSPACE_STATE: "1",
  }
  const localPath = join(data, "large-sync")
  const entries = Array.from({ length: 4_097 }, (_, index) => ({
    path: `src/file-${index}.ts`,
    type: "file" as const,
    mode: 0o644,
    size: index,
    modifiedAt: index,
    changedAt: index,
    target: "",
    digest: index.toString(16).padStart(40, "0"),
  }))
  const snapshot = {
    version: 1 as const,
    remote: {
      fingerprint: "a".repeat(64),
      canonicalPath: "/srv/large",
      scope: "git" as const,
      entries,
      hasUnsupported: false,
      hasSymlink: false,
    },
    local: {
      fingerprint: "b".repeat(64),
      canonicalPath: localPath,
      scope: "git" as const,
      entries,
      hasUnsupported: false,
      hasSymlink: false,
    },
  }
  const mapping = {
    profileId: "fixture",
    sourcePath: "/srv/large",
    remotePath: "/srv/large",
    localPath,
    remoteFingerprint: snapshot.remote.fingerprint,
    localFingerprint: snapshot.local.fingerprint,
    syncedAt: 1,
  }
  let completed = false
  const saving = saveRemoteProjectSyncSnapshot(mapping, snapshot, environment).then((value) => {
    completed = true
    return value
  })
  await new Promise<void>((resolve) => setImmediate(resolve))
  expect(completed).toBe(false)
  const saved = await saving
  expect(await loadRemoteProjectSyncSnapshot(saved, environment)).toEqual(snapshot)
})
