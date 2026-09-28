import "./setup"
import { afterEach, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { mkdir } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  localRemoteProjectArchiveCommand,
  localRemoteProjectManifestCommand,
  readLocalProjectFingerprint,
  readRemoteProjectFingerprint,
  remoteProjectSyncDestination,
  synchronizeRemoteProject,
} from "../packages/feature-terminal/src/services/remote-project-sync"
import {
  loadRemoteProjectSyncMappings,
  saveRemoteProjectSyncMapping,
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

test("keeps the existing copy when the pre-publish guard rejects replacement", async () => {
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
        throw new Error("local changed")
      },
    }),
  ).rejects.toThrow("local changed")
  expect(readFileSync(join(destination, "local.txt"), "utf8")).toBe("keep\n")
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
