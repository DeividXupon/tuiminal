import { afterEach, expect, test } from "bun:test"
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { TerminalRemoteCodexProfile } from "../packages/core/src/settings/theme"
import { preflightLocalCodex } from "../packages/feature-terminal/src/services/local-codex-compatibility"
import { REMOTE_CODEX_PREFLIGHT_MARKER } from "../packages/feature-terminal/src/services/remote-codex-connection"
import {
  compatibleCodexVersions,
  handshakeRemoteCodex,
  preflightRemoteCodex,
  REMOTE_CODEX_HANDSHAKE_TIMEOUT_MS,
  RemoteCodexCompatibilityError,
  RemoteCodexHandshakeError,
} from "../packages/feature-terminal/src/services/remote-codex-handshake"

const roots: string[] = []
const proxyFixture = join(import.meta.dir, "fixtures/codex-proxy-fixture.ts")

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function fixtureRoot() {
  const root = mkdtempSync(join(tmpdir(), "tuiminal-remote-handshake-"))
  roots.push(root)
  return root
}

function profile(): TerminalRemoteCodexProfile {
  return {
    id: "work-server",
    name: "work-server",
    host: "work-server",
  }
}

function localVersionCommand(version = "0.157.1") {
  return [process.execPath, "-e", `process.stdout.write("codex-cli ${version}\\n")`]
}

function handshakeServer(response: Record<string, unknown>) {
  const root = fixtureRoot()
  const requests = join(root, "requests.jsonl")
  return {
    command: [process.execPath, proxyFixture, "handshake", JSON.stringify(response), requests],
    requests,
  }
}

function outputCommand(stdout: string, exitCode = 0) {
  return [
    process.execPath,
    "-e",
    `process.stdout.write(${JSON.stringify(stdout)}); process.exit(${exitCode})`,
  ]
}

function remoteProbe(version: string, daemon = true, proxy = true) {
  return outputCommand(
    `${REMOTE_CODEX_PREFLIGHT_MARKER}\nVERSION\ncodex-cli ${version}\nDAEMON=${daemon ? 1 : 0}\nPROXY=${proxy ? 1 : 0}\n`,
  )
}

test("Codex compatibility requires the exact experimental protocol version", () => {
  expect(REMOTE_CODEX_HANDSHAKE_TIMEOUT_MS).toBe(80_000)
  expect(compatibleCodexVersions("0.157.1", "0.157.1")).toBe(true)
  expect(compatibleCodexVersions("0.157.1", "0.157.99")).toBe(false)
  expect(compatibleCodexVersions("0.157.1", "0.158.0")).toBe(false)
  expect(compatibleCodexVersions("1.2.3", "1.99.0")).toBe(false)
  expect(compatibleCodexVersions("1.2.3", "2.0.0")).toBe(false)
  expect(compatibleCodexVersions("1.2.3-alpha.1", "1.2.3")).toBe(false)
  expect(compatibleCodexVersions("1.2.3.4", "1.2.3")).toBe(false)
  expect(compatibleCodexVersions("invalid", "1.0.0")).toBe(false)
})

test("local Codex preflight reports a missing CLI for the update guide", async () => {
  await expect(
    preflightLocalCodex(new AbortController().signal, {
      localVersionCommand: outputCommand("", 127),
      timeoutMs: 1_000,
    }),
  ).rejects.toMatchObject({
    report: {
      providerId: "codex",
      compatible: false,
      reason: "localCodexMissing",
      localVersion: null,
      remoteVersion: null,
    },
  })
})

test("remote preflight accepts newly started and existing compatible daemons", async () => {
  for (const status of ["started", "alreadyRunning"] as const) {
    const remote = handshakeServer({ result: { userAgent: "codex_cli_rs/0.157.1" } })
    const daemonMarker = join(fixtureRoot(), `daemon-${status}`)
    await expect(
      preflightRemoteCodex(profile(), "/srv/project", new AbortController().signal, {
        localVersionCommand: localVersionCommand("0.157.1"),
        remoteProbeCommand: remoteProbe("0.157.1"),
        daemonStartCommand: [
          process.execPath,
          "-e",
          `require("node:fs").writeFileSync(${JSON.stringify(daemonMarker)}, "yes"); process.stdout.write(JSON.stringify({ status: ${JSON.stringify(status)}, appServerVersion: "0.157.1" }))`,
        ],
        proxyCommand: remote.command,
        timeoutMs: 1_000,
      }),
    ).resolves.toMatchObject({
      compatible: true,
      localVersion: "0.157.1",
      remoteVersion: "0.157.1",
      daemonAvailable: true,
      proxyAvailable: true,
    })
    expect(readFileSync(daemonMarker, "utf8")).toBe("yes")
  }
})

test("remote preflight rejects an invalid or version-skewed daemon response", async () => {
  const common = {
    localVersionCommand: localVersionCommand("0.157.1"),
    remoteProbeCommand: remoteProbe("0.157.1"),
    proxyCommand: outputCommand("must not connect"),
    timeoutMs: 1_000,
  }
  await expect(
    preflightRemoteCodex(profile(), "/srv/project", new AbortController().signal, {
      ...common,
      daemonStartCommand: outputCommand("not-json"),
    }),
  ).rejects.toMatchObject({ code: "appServerStartFailed" })
  await expect(
    preflightRemoteCodex(profile(), "/srv/project", new AbortController().signal, {
      ...common,
      daemonStartCommand: outputCommand(
        JSON.stringify({ status: "running", appServerVersion: "0.157.2" }),
      ),
    }),
  ).rejects.toMatchObject({
    report: { compatible: false, reason: "versionMismatch", remoteVersion: "0.157.2" },
  })
})

test.each([
  {
    name: "incompatible 0.x versions",
    local: localVersionCommand("0.157.1"),
    remote: remoteProbe("0.158.0"),
    reason: "versionMismatch",
  },
  {
    name: "invalid local version",
    local: outputCommand("codex-cli unknown"),
    remote: remoteProbe("0.157.0"),
    reason: "localVersionInvalid",
  },
  {
    name: "missing local Codex",
    local: outputCommand("", 127),
    remote: remoteProbe("0.157.0"),
    reason: "localCodexMissing",
  },
  {
    name: "missing remote Codex",
    local: localVersionCommand(),
    remote: outputCommand("", 127),
    reason: "remoteCodexMissing",
  },
  {
    name: "invalid remote version",
    local: localVersionCommand(),
    remote: outputCommand("codex-cli unknown", 74),
    reason: "remoteVersionInvalid",
  },
  {
    name: "missing daemon command",
    local: localVersionCommand(),
    remote: remoteProbe("0.157.9", false, true),
    reason: "daemonUnavailable",
  },
  {
    name: "missing proxy command",
    local: localVersionCommand(),
    remote: remoteProbe("0.157.9", true, false),
    reason: "proxyUnavailable",
  },
])(
  "remote preflight reports $name without starting the daemon",
  async ({ local, remote, reason }) => {
    const marker = join(fixtureRoot(), "must-not-start")
    const promise = preflightRemoteCodex(profile(), "/srv/project", new AbortController().signal, {
      localVersionCommand: local,
      remoteProbeCommand: remote,
      daemonStartCommand: [
        process.execPath,
        "-e",
        `require("node:fs").writeFileSync(${JSON.stringify(marker)}, "started")`,
      ],
      proxyCommand: outputCommand(""),
      timeoutMs: 1_000,
    })
    await expect(promise).rejects.toBeInstanceOf(RemoteCodexCompatibilityError)
    await expect(promise).rejects.toMatchObject({ report: { compatible: false, reason } })
    expect(existsSync(marker)).toBe(false)
  },
)

test("remote preflight treats an unspawnable local Codex as missing", async () => {
  const root = fixtureRoot()
  const marker = join(root, "must-not-start")
  const promise = preflightRemoteCodex(profile(), "/srv/project", new AbortController().signal, {
    localVersionCommand: [join(root, "missing-codex")],
    remoteProbeCommand: remoteProbe("0.157.0"),
    daemonStartCommand: [
      process.execPath,
      "-e",
      `require("node:fs").writeFileSync(${JSON.stringify(marker)}, "started")`,
    ],
    proxyCommand: outputCommand(""),
    timeoutMs: 1_000,
  })
  await expect(promise).rejects.toMatchObject({
    report: { compatible: false, reason: "localCodexMissing" },
  })
  expect(existsSync(marker)).toBe(false)
})

test("remote preflight requires the remote Codex account before daemon startup", async () => {
  const marker = join(fixtureRoot(), "must-not-start")
  const unauthenticated = outputCommand(
    `${REMOTE_CODEX_PREFLIGHT_MARKER}\nVERSION\ncodex-cli 0.157.9\nDAEMON=1\nPROXY=1\nAUTH=0\n`,
    75,
  )
  const promise = preflightRemoteCodex(profile(), "/srv/project", new AbortController().signal, {
    localVersionCommand: localVersionCommand("0.157.9"),
    remoteProbeCommand: unauthenticated,
    daemonStartCommand: [
      process.execPath,
      "-e",
      `require("node:fs").writeFileSync(${JSON.stringify(marker)}, "started")`,
    ],
    proxyCommand: outputCommand(""),
    timeoutMs: 1_000,
  })
  await expect(promise).rejects.toMatchObject({ code: "codexUnauthenticated" })
  expect(existsSync(marker)).toBe(false)
})

test("remote handshake waits for initialize and reads the responding app-server version", async () => {
  const remote = handshakeServer({
    result: {
      userAgent: "codex_cli_rs/0.157.8",
      codexHome: "/home/ubuntu/.codex",
      platformFamily: "unix",
      platformOs: "linux",
    },
  })

  await expect(
    handshakeRemoteCodex(profile(), "/srv/project", new AbortController().signal, {
      remoteCommand: remote.command,
      localVersionCommand: localVersionCommand(),
      timeoutMs: 1_000,
    }),
  ).resolves.toEqual({
    localVersion: "0.157.1",
    remoteVersion: "0.157.8",
    remoteUserAgent: "codex_cli_rs/0.157.8",
  })
  expect(
    JSON.parse(readFileSync(remote.requests, "utf8").trim().split("\n").at(0) ?? "{}"),
  ).toMatchObject({
    method: "initialize",
    params: {
      clientInfo: { name: "tuiminal", title: "Tuiminal", version: "1" },
      capabilities: null,
    },
  })
})

test("raw proxy handshake reports version skew and rejects protocol errors", async () => {
  const skewed = handshakeServer({
    result: {
      userAgent: "codex_cli_rs/0.158.0",
      codexHome: "/tmp",
      platformFamily: "unix",
      platformOs: "linux",
    },
  })
  await expect(
    handshakeRemoteCodex(profile(), "/srv/project", new AbortController().signal, {
      remoteCommand: skewed.command,
      localVersionCommand: localVersionCommand(),
      timeoutMs: 1_000,
    }),
  ).resolves.toMatchObject({
    localVersion: "0.157.1",
    remoteVersion: "0.158.0",
  })

  const malformed = handshakeServer({ result: {} })
  await expect(
    handshakeRemoteCodex(profile(), "/srv/project", new AbortController().signal, {
      remoteCommand: malformed.command,
      localVersionCommand: localVersionCommand(),
      timeoutMs: 1_000,
    }),
  ).rejects.toMatchObject({ code: "protocolIncompatible" })

  const rejected = handshakeServer({
    error: { code: -32600, message: "unsupported initialize" },
  })
  await expect(
    handshakeRemoteCodex(profile(), "/srv/project", new AbortController().signal, {
      remoteCommand: rejected.command,
      localVersionCommand: localVersionCommand(),
      timeoutMs: 1_000,
    }),
  ).rejects.toMatchObject({ code: "initializeRejected" })
})

test("remote handshake maps SSH, directory, Codex and app-server startup failures", async () => {
  const failures = [
    { code: 255, stderr: "Host key verification failed", expected: "hostKey" },
    { code: 255, stderr: "Permission denied (publickey)", expected: "authentication" },
    { code: 255, stderr: "ssh: connect to host: Connection timed out", expected: "unreachable" },
    { code: 127, stderr: "", expected: "codexMissing" },
    { code: 72, stderr: "cd: can't cd to /srv/missing", expected: "directoryMissing" },
    { code: 73, stderr: "app-server failed", expected: "appServerStartFailed" },
  ] as const

  for (const failure of failures) {
    const command = [
      process.execPath,
      "-e",
      `process.stderr.write(${JSON.stringify(failure.stderr)}); process.exit(${failure.code})`,
    ]
    await expect(
      handshakeRemoteCodex(profile(), "/srv/project", new AbortController().signal, {
        remoteCommand: command,
        localVersionCommand: localVersionCommand(),
        timeoutMs: 1_000,
      }),
    ).rejects.toMatchObject({ code: failure.expected })
  }
})

test("remote handshake validates the local CLI independently when SSH cannot be spawned", async () => {
  const root = fixtureRoot()
  const marker = join(root, "local-version-started")
  await expect(
    handshakeRemoteCodex(profile(), "/srv/project", new AbortController().signal, {
      remoteCommand: [join(root, "missing-ssh")],
      localVersionCommand: [
        process.execPath,
        "-e",
        `require("node:fs").writeFileSync(${JSON.stringify(marker)}, "started")`,
      ],
      timeoutMs: 1_000,
    }),
  ).rejects.toMatchObject({ code: "sshUnavailable" })
  for (let attempt = 0; attempt < 50 && !existsSync(marker); attempt++) await Bun.sleep(10)
  expect(existsSync(marker)).toBe(true)
})

test("remote handshake owns timeout and cancellation without opening the TUI", async () => {
  const stalled = [process.execPath, "-e", "setInterval(() => undefined, 1000)"]
  await expect(
    handshakeRemoteCodex(profile(), "/srv/project", new AbortController().signal, {
      remoteCommand: stalled,
      localVersionCommand: localVersionCommand(),
      timeoutMs: 25,
    }),
  ).rejects.toMatchObject({ code: "timeout" })

  const controller = new AbortController()
  const aborted = handshakeRemoteCodex(profile(), "/srv/project", controller.signal, {
    remoteCommand: stalled,
    localVersionCommand: localVersionCommand(),
    timeoutMs: 1_000,
  })
  controller.abort(new DOMException("cancelled", "AbortError"))
  await expect(aborted).rejects.toMatchObject({ name: "AbortError" })
})

test("remote handshake errors expose stable localized messages", () => {
  expect(new RemoteCodexHandshakeError("authentication").message).toBe(
    "A chave SSH foi recusada pelo servidor remoto.",
  )
  expect(new RemoteCodexHandshakeError("directoryMissing").message).toBe(
    "A pasta selecionada não existe no servidor remoto.",
  )
})
