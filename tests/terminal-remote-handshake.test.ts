import { afterEach, expect, test } from "bun:test"
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { TerminalRemoteCodexProfile } from "../packages/core/src/settings/theme"
import {
  handshakeRemoteCodex,
  RemoteCodexHandshakeError,
} from "../packages/feature-terminal/src/services/remote-codex-handshake"

const roots: string[] = []

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

function handshakeServer(result: string) {
  const root = fixtureRoot()
  const script = join(root, "server.js")
  const requests = join(root, "requests.jsonl")
  writeFileSync(
    script,
    [
      'import { appendFileSync } from "node:fs"',
      "const requests = process.argv[2]",
      'let buffered = ""',
      'process.stdin.setEncoding("utf8")',
      'process.stdin.on("data", (chunk) => {',
      "  buffered += chunk",
      '  let newline = buffered.indexOf("\\n")',
      "  while (newline >= 0) {",
      "    const line = buffered.slice(0, newline)",
      "    buffered = buffered.slice(newline + 1)",
      "    if (line) {",
      "      const request = JSON.parse(line)",
      '      appendFileSync(requests, line + "\\n")',
      '      if (request.method === "initialize")',
      `        process.stdout.write(JSON.stringify({ id: request.id, ${result} }) + "\\n")`,
      "    }",
      '    newline = buffered.indexOf("\\n")',
      "  }",
      "})",
    ].join("\n"),
  )
  return { command: [process.execPath, script, requests], requests }
}

test("remote handshake waits for initialize and reads the responding app-server version", async () => {
  const remote = handshakeServer(
    'result: { userAgent: "codex_cli_rs/0.157.8", codexHome: "/home/ubuntu/.codex", platformFamily: "unix", platformOs: "linux" }',
  )

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
  expect(JSON.parse(readFileSync(remote.requests, "utf8").trim())).toMatchObject({
    method: "initialize",
    params: {
      clientInfo: { name: "tuiminal", title: "Tuiminal", version: "1" },
      capabilities: null,
    },
  })
})

test("remote handshake accepts version skew after initialize and rejects protocol errors", async () => {
  const skewed = handshakeServer(
    'result: { userAgent: "codex_cli_rs/0.158.0", codexHome: "/tmp", platformFamily: "unix", platformOs: "linux" }',
  )
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

  const malformed = handshakeServer("result: {}")
  await expect(
    handshakeRemoteCodex(profile(), "/srv/project", new AbortController().signal, {
      remoteCommand: malformed.command,
      localVersionCommand: localVersionCommand(),
      timeoutMs: 1_000,
    }),
  ).rejects.toMatchObject({ code: "protocolIncompatible" })

  const rejected = handshakeServer('error: { code: -32600, message: "unsupported initialize" }')
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

test("remote handshake does not start the local probe when SSH cannot be spawned", async () => {
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
  await Bun.sleep(25)
  expect(existsSync(marker)).toBe(false)
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
