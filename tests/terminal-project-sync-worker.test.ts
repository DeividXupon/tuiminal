import "./setup"
import { afterEach, expect, test } from "bun:test"
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { mkdir } from "node:fs/promises"
import { tmpdir } from "node:os"
import { delimiter, join } from "node:path"
import type { RemoteProjectSyncStatus } from "../packages/feature-terminal/src/model/remote-project-sync"
import { RemoteProjectSyncWorkerClient } from "../packages/feature-terminal/src/services/remote-project-sync-worker-client"

const roots: string[] = []
const previousPath = process.env.PATH

afterEach(() => {
  if (previousPath === undefined) delete process.env.PATH
  else process.env.PATH = previousPath
  delete process.env.TUIMINAL_TEST_SSH_DELAY
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function fakeSsh(root: string, delay = false) {
  const bin = join(root, "bin")
  mkdirSync(bin)
  const ssh = join(bin, "ssh")
  writeFileSync(
    ssh,
    `#!/bin/sh\n${delay ? 'sleep "$TUIMINAL_TEST_SSH_DELAY"\n' : ""}command=\nfor argument in "$@"; do command=$argument; done\nexec sh -c "$command"\n`,
  )
  chmodSync(ssh, 0o755)
  process.env.PATH = `${bin}${delimiter}${previousPath ?? ""}`
  return ssh
}

test("sync worker mirrors the complete tree over bounded IPC", async () => {
  const root = mkdtempSync(join(tmpdir(), "tuiminal-project-sync-worker-"))
  roots.push(root)
  const source = join(root, "source")
  const destination = join(root, "project-sync")
  await mkdir(join(source, ".git"), { recursive: true })
  await mkdir(join(source, "node_modules", "cache"), { recursive: true })
  writeFileSync(join(source, ".git", "HEAD"), "ref: refs/heads/main\n")
  writeFileSync(join(source, "node_modules", "cache", "ignored.txt"), "ignored\n")
  writeFileSync(join(source, "project.txt"), "project\n")
  fakeSsh(root)
  const statuses: RemoteProjectSyncStatus[] = []
  const client = new RemoteProjectSyncWorkerClient(destination, (status) => statuses.push(status))
  try {
    const mapping = await client.synchronize(
      {
        profile: { id: "fixture", name: "Fixture", host: "fixture" },
        workingDirectory: source,
      },
      undefined,
    )
    expect(mapping.localPath).toBe(destination)
    expect(readFileSync(join(destination, ".git", "HEAD"), "utf8")).toContain("refs/heads/main")
    expect(readFileSync(join(destination, "node_modules", "cache", "ignored.txt"), "utf8")).toBe(
      "ignored\n",
    )
    expect(statuses.some((status) => status.kind === "checking")).toBe(true)
    expect(statuses.some((status) => status.kind === "syncing")).toBe(true)
  } finally {
    client.dispose()
  }
})

test("sync worker cancellation stops its owned SSH verification", async () => {
  const root = mkdtempSync(join(tmpdir(), "tuiminal-project-sync-worker-cancel-"))
  roots.push(root)
  const source = join(root, "source")
  const destination = join(root, "project-sync")
  await mkdir(source)
  writeFileSync(join(source, "project.txt"), "project\n")
  fakeSsh(root, true)
  process.env.TUIMINAL_TEST_SSH_DELAY = "5"
  const statuses: RemoteProjectSyncStatus[] = []
  const client = new RemoteProjectSyncWorkerClient(destination, (status) => statuses.push(status))
  try {
    const syncing = client.synchronize(
      {
        profile: { id: "fixture", name: "Fixture", host: "fixture" },
        workingDirectory: source,
      },
      undefined,
    )
    for (let attempt = 0; attempt < 50; attempt++) {
      if (statuses.some((status) => status.kind === "checking")) break
      await Bun.sleep(10)
    }
    const started = performance.now()
    client.cancel()
    await expect(syncing).rejects.toThrow("Operação cancelada.")
    expect(performance.now() - started).toBeLessThan(2_000)
    expect(statuses.some((status) => status.kind === "cancelling")).toBe(true)
  } finally {
    client.dispose()
  }
})
