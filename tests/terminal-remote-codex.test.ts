import { afterEach, expect, test } from "bun:test"
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  normalizeTerminalRemoteActiveProfileId,
  normalizeTerminalRemoteCodexProfiles,
  type TerminalRemoteCodexProfile,
  terminalRemoteProfileValidationError,
} from "../packages/core/src/settings/terminal"
import {
  remoteCodexSshTestCommand,
  testRemoteCodexConnection,
} from "../packages/feature-terminal/src/services/remote-codex-connection"
import {
  checkRemoteServerBarrier,
  checkRemoteServerReadiness,
  nextRemoteServerBarrier,
  remoteServerBarrierCheckCommand,
} from "../packages/feature-terminal/src/services/remote-server-readiness"
import { createRemoteServerSetupCommand } from "../packages/feature-terminal/src/services/terminal"

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function fixtureRoot() {
  const root = mkdtempSync(join(tmpdir(), "tuiminal-remote-codex-"))
  roots.push(root)
  return root
}

function profile(identityFile: string): TerminalRemoteCodexProfile {
  return {
    id: "oracle-vps",
    name: "Oracle VPS",
    host: "203.0.113.10",
    user: "ubuntu",
    port: 22,
    identityFile,
  }
}

test("remote Codex profiles normalize bounded SSH configuration", () => {
  const valid = profile("~/.ssh/oracle.key")
  expect(
    normalizeTerminalRemoteCodexProfiles([
      valid,
      { ...valid, name: "Atualizado", remoteDirectory: "/legacy/project" },
    ]),
  ).toEqual([{ ...valid, name: "Atualizado" }])
  expect(
    normalizeTerminalRemoteCodexProfiles([
      { ...valid, id: "bad-host", host: "-oProxyCommand=unsafe" },
      { ...valid, id: "bad-port", port: 0 },
      { ...valid, id: "control", name: "bad\u001b" },
    ]),
  ).toEqual([])
  expect(terminalRemoteProfileValidationError(valid)).toBeNull()
  expect(terminalRemoteProfileValidationError({ ...valid, identityFile: "" })).toBe("identityFile")
})

test("remote Codex profiles keep exactly one valid active profile", () => {
  const first = profile("~/.ssh/first.key")
  const second = { ...first, id: "second-vps", name: "Second VPS" }
  const profiles = [first, second]

  expect(normalizeTerminalRemoteActiveProfileId(second.id, profiles)).toBe(second.id)
  expect(normalizeTerminalRemoteActiveProfileId(first.id, profiles)).toBe(first.id)
  expect(normalizeTerminalRemoteActiveProfileId("missing", profiles)).toBe(first.id)
  expect(normalizeTerminalRemoteActiveProfileId(null, [])).toBeNull()
})

test("SSH connection test builds an argument array without opening a remote Codex server", () => {
  const command = remoteCodexSshTestCommand(profile("/tmp/oracle.key"), {
    executable: "/usr/bin/ssh",
    timeoutMs: 3_200,
  })
  expect(command).toEqual([
    "/usr/bin/ssh",
    "-T",
    "-o",
    "BatchMode=yes",
    "-o",
    "ConnectTimeout=4",
    "-o",
    "ConnectionAttempts=1",
    "-i",
    "/tmp/oracle.key",
    "-p",
    "22",
    "ubuntu@203.0.113.10",
    "printf TUIMINAL_SSH_OK",
  ])
  expect(command.join(" ")).not.toContain("app-server")
})

test("SSH connection test reports success and authentication failure without real network access", async () => {
  const root = fixtureRoot()
  const identityFile = join(root, "oracle.key")
  const success = join(root, "ssh-success.js")
  const denied = join(root, "ssh-denied.js")
  writeFileSync(identityFile, "fixture")
  writeFileSync(success, 'process.stdout.write("TUIMINAL_SSH_OK")\n')
  writeFileSync(
    denied,
    'process.stderr.write("Permission denied (publickey).\\n")\nprocess.exit(255)\n',
  )
  chmodSync(identityFile, 0o600)

  await expect(
    testRemoteCodexConnection(profile(identityFile), undefined, {
      executable: [process.execPath, success],
      timeoutMs: 1_000,
    }),
  ).resolves.toEqual({ ok: true, code: "connected" })
  await expect(
    testRemoteCodexConnection(profile(identityFile), undefined, {
      executable: [process.execPath, denied],
      timeoutMs: 1_000,
    }),
  ).resolves.toMatchObject({ ok: false, code: "authentication" })
})

test("SSH connection test rejects a missing identity before spawning", async () => {
  await expect(testRemoteCodexConnection(profile("/missing/oracle.key"))).resolves.toEqual({
    ok: false,
    code: "identityMissing",
  })
})

test("SSH connection test owns its timeout and cancellation lifecycle", async () => {
  const root = fixtureRoot()
  const identityFile = join(root, "oracle.key")
  const hanging = join(root, "ssh-hanging.js")
  writeFileSync(identityFile, "fixture")
  writeFileSync(hanging, "setInterval(() => {}, 1_000)\n")

  await expect(
    testRemoteCodexConnection(profile(identityFile), undefined, {
      executable: [process.execPath, hanging],
      timeoutMs: 25,
    }),
  ).resolves.toEqual({ ok: false, code: "timeout" })

  const controller = new AbortController()
  const result = testRemoteCodexConnection(profile(identityFile), controller.signal, {
    executable: [process.execPath, hanging],
    timeoutMs: 1_000,
  })
  setTimeout(() => controller.abort(), 25)
  await expect(result).resolves.toEqual({ ok: false, code: "cancelled" })
})

test("remote readiness checks use fixed scripts without interpolating profile data", () => {
  const target = profile("/tmp/oracle key")
  const github = remoteServerBarrierCheckCommand(target, "githubSsh", {
    executable: "/usr/bin/ssh",
    timeoutMs: 3_200,
  })
  const codex = remoteServerBarrierCheckCommand(target, "codex", {
    executable: "/usr/bin/ssh",
    timeoutMs: 3_200,
  })

  expect(github.slice(0, -1)).toEqual([
    "/usr/bin/ssh",
    "-T",
    "-o",
    "BatchMode=yes",
    "-o",
    "ConnectTimeout=4",
    "-o",
    "ConnectionAttempts=1",
    "-i",
    "/tmp/oracle key",
    "-p",
    "22",
    "ubuntu@203.0.113.10",
  ])
  expect(github.at(-1)).toContain("ssh -T")
  expect(codex.at(-1)).toContain("codex_command")
  expect(github.at(-1)).not.toContain(target.host)
  expect(codex.at(-1)).not.toContain(target.identityFile)
})

test("remote readiness reports GitHub and Codex barriers without real network access", async () => {
  const root = fixtureRoot()
  const identityFile = join(root, "oracle.key")
  const ready = join(root, "ssh-ready.js")
  writeFileSync(identityFile, "fixture")
  writeFileSync(
    ready,
    [
      "const script = process.argv.at(-1) ?? ''",
      "const barrier = script.includes(':githubSsh:') ? 'githubSsh' : 'codex'",
      "process.stdout.write('TUIMINAL_REMOTE_READY:' + barrier + ':ready\\n')",
    ].join("\n"),
  )
  chmodSync(identityFile, 0o600)

  await expect(
    checkRemoteServerReadiness(profile(identityFile), undefined, {
      executable: [process.execPath, ready],
      timeoutMs: 1_000,
    }),
  ).resolves.toEqual({
    githubSsh: { id: "githubSsh", ready: true, code: "ready" },
    codex: { id: "codex", ready: true, code: "ready" },
  })
})

test("remote readiness shell probes recognize GitHub and Codex success markers", async () => {
  const root = fixtureRoot()
  const identityFile = join(root, "oracle.key")
  const git = join(root, "git")
  const ssh = join(root, "ssh")
  const codex = join(root, "codex")
  writeFileSync(identityFile, "fixture")
  writeFileSync(git, "#!/bin/sh\nexit 0\n")
  writeFileSync(
    ssh,
    '#!/bin/sh\nprintf "Hi fixture! You\'ve successfully authenticated, but GitHub does not provide shell access.\\n" >&2\nexit 1\n',
  )
  writeFileSync(codex, '#!/bin/sh\n[ "$1 $2" = "login status" ]\n')
  chmodSync(git, 0o700)
  chmodSync(ssh, 0o700)
  chmodSync(codex, 0o700)

  for (const id of ["githubSsh", "codex"] as const) {
    const script = remoteServerBarrierCheckCommand(profile(identityFile), id).at(-1)
    if (!script) throw new Error("Missing remote readiness script")
    const child = Bun.spawn(["/bin/sh", "-c", script], {
      env: { HOME: root, PATH: root, LC_ALL: "C" },
      stdout: "pipe",
      stderr: "pipe",
    })
    const [exitCode, stdout] = await Promise.all([child.exited, new Response(child.stdout).text()])
    expect(exitCode).toBe(0)
    expect(stdout).toContain(`TUIMINAL_REMOTE_READY:${id}:ready`)
  }
})

test("remote readiness keeps the current barrier when verification fails", async () => {
  const root = fixtureRoot()
  const identityFile = join(root, "oracle.key")
  const missing = join(root, "ssh-missing.js")
  writeFileSync(identityFile, "fixture")
  writeFileSync(missing, 'process.stdout.write("TUIMINAL_REMOTE_READY:codex:codexMissing\\n")\n')

  await expect(
    checkRemoteServerBarrier(profile(identityFile), "codex", undefined, {
      executable: [process.execPath, missing],
      timeoutMs: 1_000,
    }),
  ).resolves.toEqual({ id: "codex", ready: false, code: "codexMissing" })
})

test("remote setup advances only after the current barrier is ready", () => {
  const waitingForGithub = {
    githubSsh: { id: "githubSsh" as const, ready: false, code: "authentication" as const },
    codex: { id: "codex" as const, ready: false, code: "codexMissing" as const },
  }
  expect(nextRemoteServerBarrier(waitingForGithub)).toBe("githubSsh")
  expect(
    nextRemoteServerBarrier({
      ...waitingForGithub,
      githubSsh: { id: "githubSsh", ready: true, code: "ready" },
    }),
  ).toBe("codex")
  expect(
    nextRemoteServerBarrier({
      githubSsh: { id: "githubSsh", ready: true, code: "ready" },
      codex: { id: "codex", ready: true, code: "ready" },
    }),
  ).toBeNull()
})

test("remote server setup opens an interactive SSH shell without embedding a setup command", () => {
  const target = profile("/tmp/oracle key")
  const command = createRemoteServerSetupCommand(target)

  expect(command.command).toEqual([
    "ssh",
    "-tt",
    "-o",
    "ServerAliveInterval=30",
    "-o",
    "ServerAliveCountMax=3",
    "-i",
    "/tmp/oracle key",
    "-p",
    "22",
    "ubuntu@203.0.113.10",
  ])
  expect(command.displayCommand).toBe("ubuntu@203.0.113.10:22")
  expect(command.remoteSetup).toEqual({ profile: target })
})
