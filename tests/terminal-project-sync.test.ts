import "./setup"
import { afterEach, expect, test } from "bun:test"
import {
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  unlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs"
import { mkdir } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  localRemoteProjectArchiveCommand,
  localRemoteProjectHashCommand,
  localRemoteProjectManifestCommand,
  inspectRemoteProjectSync,
  readLocalProjectFingerprint,
  readRemoteProjectFingerprint,
  remoteProjectSyncDestination,
  synchronizeRemoteProject,
} from "../packages/feature-terminal/src/services/remote-project-sync"
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
  expect(readFileSync(join(destination, "change.txt"), "utf8")).toBe("after!\n")
  expect(() => readFileSync(join(destination, "remove.txt"))).toThrow()
  expect(progress.at(-1)).toBe(1)
  expect(progress.every((value, index) => index === 0 || value >= (progress[index - 1] ?? 0))).toBe(
    true,
  )
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
  rmSync(join(data, "tuiminal"), { recursive: true, force: true })
  expect(loadRemoteProjectSyncMappings(environment)).toEqual([])
})

test("persists validated compressed sync snapshots and links them from the mapping", () => {
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
  const saved = saveRemoteProjectSyncSnapshot(mapping, snapshot, environment)
  expect(saved.snapshotId).toBeString()
  expect(loadRemoteProjectSyncMappings(environment)).toEqual([saved])
  expect(loadRemoteProjectSyncSnapshot(saved, environment)).toEqual(snapshot)
})
