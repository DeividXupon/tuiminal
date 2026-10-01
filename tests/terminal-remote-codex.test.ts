import { afterEach, expect, test } from "bun:test"
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  normalizeTerminalRemoteActiveProfileId,
  normalizeTerminalRemoteCodexProfiles,
  type TerminalRemoteCodexProfile,
  terminalRemoteProfileValidationError,
} from "../packages/core/src/settings/terminal"
import { refreshRemoteCodexResumeThreads } from "../packages/feature-terminal/src/services/codex-resume"
import {
  createRemoteCodexAppServerLaunch,
  remoteCodexAppServerSshCommand,
  remoteCodexDaemonStartSshCommand,
  remoteCodexPreflightSshCommand,
  remoteCodexProxySshCommand,
  remoteCodexSshTestCommand,
  remoteCodexTuiCommand,
  remoteInteractiveSshCommand,
  testRemoteCodexConnection,
} from "../packages/feature-terminal/src/services/remote-codex-connection"
import { handshakeRemoteCodex } from "../packages/feature-terminal/src/services/remote-codex-handshake"
import {
  checkRemoteServerBarrier,
  checkRemoteServerReadiness,
  nextRemoteServerBarrier,
  remoteServerBarrierCheckCommand,
} from "../packages/feature-terminal/src/services/remote-server-readiness"
import { remoteServerSetupInstructions } from "../packages/feature-terminal/src/services/remote-server-setup"
import {
  remoteSshEffectiveConfigurationCommand,
  sshConfigurationHasForwarding,
} from "../packages/feature-terminal/src/services/remote-ssh-command"
import { listSshConfigProfiles } from "../packages/feature-terminal/src/services/ssh-config"
import {
  createRemoteCodexAgentCommand,
  createRemoteServerSetupCommand,
} from "../packages/feature-terminal/src/services/terminal"

const roots: string[] = []
const proxyFixture = join(import.meta.dir, "fixtures/codex-proxy-fixture.ts")

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function fixtureRoot() {
  const root = mkdtempSync(join(tmpdir(), "tuiminal-remote-codex-"))
  roots.push(root)
  return root
}

function profile(): TerminalRemoteCodexProfile {
  return {
    id: "oracle-vps",
    name: "oracle-vps",
    host: "oracle-vps",
  }
}

test("remote Codex profiles retain only bounded OpenSSH Host aliases", () => {
  const valid = profile()
  expect(
    normalizeTerminalRemoteCodexProfiles([
      valid,
      { ...valid, name: "Atualizado", remoteDirectory: "/legacy/project" },
    ]),
  ).toEqual([{ ...valid, name: "Atualizado" }])
  expect(
    normalizeTerminalRemoteCodexProfiles([
      { ...valid, id: "bad-host", host: "-oProxyCommand=unsafe" },
      { ...valid, id: "pattern", host: "*.example.test" },
      { ...valid, id: "control", name: "bad\u001b" },
    ]),
  ).toEqual([])
  expect(terminalRemoteProfileValidationError(valid)).toBeNull()
  expect(terminalRemoteProfileValidationError({ ...valid, host: "" })).toBe("host")
  expect(
    normalizeTerminalRemoteCodexProfiles([
      { ...valid, user: "ubuntu", port: 22, identityFile: "~/.ssh/id_ed25519" },
    ]),
  ).toEqual([])
})

test("remote Codex profiles keep exactly one valid active profile", () => {
  const first = profile()
  const second = { ...first, id: "second-vps", name: "Second VPS" }
  const profiles = [first, second]

  expect(normalizeTerminalRemoteActiveProfileId(second.id, profiles)).toBe(second.id)
  expect(normalizeTerminalRemoteActiveProfileId(first.id, profiles)).toBe(first.id)
  expect(normalizeTerminalRemoteActiveProfileId("missing", profiles)).toBe(first.id)
  expect(normalizeTerminalRemoteActiveProfileId(null, [])).toBeNull()
})

test("SSH config discovery lists explicit Host aliases from bounded Includes", async () => {
  const root = fixtureRoot()
  const ssh = join(root, ".ssh")
  const includes = join(ssh, "config.d")
  mkdirSync(includes, { recursive: true })
  writeFileSync(
    join(ssh, "config"),
    [
      "Include config.d/*.conf",
      "Host work-vps github-* !blocked",
      "  HostName 203.0.113.10",
      "  IdentityFile ~/.ssh/work.key",
      "Host *",
      "  User default-user",
    ].join("\n"),
  )
  writeFileSync(join(includes, "oracle.conf"), "Host=oracle-vps\n  User opc\n")

  await expect(listSshConfigProfiles({ homeDirectory: root })).resolves.toEqual([
    { id: "oracle-vps", name: "oracle-vps", host: "oracle-vps" },
    { id: "work-vps", name: "work-vps", host: "work-vps" },
  ])
})

test("SSH config discovery returns no profiles when the user config does not exist", async () => {
  const root = fixtureRoot()
  await expect(listSshConfigProfiles({ homeDirectory: root })).resolves.toEqual([])
})

test("SSH connection test builds an argument array without opening a remote Codex server", () => {
  const command = remoteCodexSshTestCommand(profile(), {
    executable: "/usr/bin/ssh",
    timeoutMs: 3_200,
  })
  expect(command.slice(0, 2)).toEqual(["/usr/bin/ssh", "-T"])
  expect(command).toContain("ConnectTimeout=4")
  expect(command).toContain("RemoteCommand=none")
  expect(command).toContain("ClearAllForwardings=yes")
  expect(command).toContain("oracle-vps")
  expect(command.at(-1)).toContain("printf TUIMINAL_SSH_OK")
  expect(command.join(" ")).not.toContain("app-server")
})

test("SSH connection test reports success and authentication failure without real network access", async () => {
  const root = fixtureRoot()
  const success = join(root, "ssh-success.js")
  const denied = join(root, "ssh-denied.js")
  writeFileSync(success, 'process.stdout.write("TUIMINAL_SSH_OK")\n')
  writeFileSync(
    denied,
    'process.stderr.write("Permission denied (publickey).\\n")\nprocess.exit(255)\n',
  )

  await expect(
    testRemoteCodexConnection(profile(), undefined, {
      executable: [process.execPath, success],
      timeoutMs: 1_000,
    }),
  ).resolves.toEqual({ ok: true, code: "connected" })
  await expect(
    testRemoteCodexConnection(profile(), undefined, {
      executable: [process.execPath, denied],
      timeoutMs: 1_000,
    }),
  ).resolves.toMatchObject({ ok: false, code: "authentication" })
})

test("SSH connection test owns its timeout and cancellation lifecycle", async () => {
  const root = fixtureRoot()
  const hanging = join(root, "ssh-hanging.js")
  writeFileSync(hanging, "setInterval(() => {}, 1_000)\n")

  await expect(
    testRemoteCodexConnection(profile(), undefined, {
      executable: [process.execPath, hanging],
      timeoutMs: 25,
    }),
  ).resolves.toEqual({ ok: false, code: "timeout" })

  const controller = new AbortController()
  const result = testRemoteCodexConnection(profile(), controller.signal, {
    executable: [process.execPath, hanging],
    timeoutMs: 1_000,
  })
  setTimeout(() => controller.abort(), 25)
  await expect(result).resolves.toEqual({ ok: false, code: "cancelled" })
})

test("remote readiness checks use fixed scripts without interpolating profile data", () => {
  const target = profile()
  const github = remoteServerBarrierCheckCommand(target, "githubSsh", {
    executable: "/usr/bin/ssh",
    timeoutMs: 3_200,
  })
  const codex = remoteServerBarrierCheckCommand(target, "codex", {
    executable: "/usr/bin/ssh",
    timeoutMs: 3_200,
  })

  expect(github.slice(0, 2)).toEqual(["/usr/bin/ssh", "-T"])
  expect(github).toContain("ConnectTimeout=4")
  expect(github).toContain("RemoteCommand=none")
  expect(github).toContain("ClearAllForwardings=yes")
  expect(github).toContain("oracle-vps")
  expect(github.at(-1)).toContain("ssh -T")
  expect(codex.at(-1)).toContain("codex_command")
  expect(codex.at(-1)).toContain("$HOME/.codex/packages/standalone/current/bin/codex")
  expect(github.at(-1)).not.toContain(target.host)
})

test("remote readiness reports GitHub and Codex barriers without real network access", async () => {
  const root = fixtureRoot()
  const ready = join(root, "ssh-ready.js")
  writeFileSync(
    ready,
    [
      "const script = process.argv.at(-1) ?? ''",
      "const barrier = script.includes(':githubSsh:') ? 'githubSsh' : 'codex'",
      "process.stdout.write('TUIMINAL_REMOTE_READY:' + barrier + ':ready\\n')",
    ].join("\n"),
  )

  await expect(
    checkRemoteServerReadiness(profile(), undefined, {
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
  const git = join(root, "git")
  const ssh = join(root, "ssh")
  const codex = join(root, "codex")
  writeFileSync(git, "#!/bin/sh\nexit 0\n")
  writeFileSync(
    ssh,
    '#!/bin/sh\nprintf "Hi fixture! You\'ve successfully authenticated, but GitHub does not provide shell access.\\n" >&2\nexit 1\n',
  )
  writeFileSync(
    codex,
    [
      "#!/bin/sh",
      'case "$*" in',
      '  "login status"|"app-server --help") exit 0 ;;',
      "  *) exit 1 ;;",
      "esac",
    ].join("\n"),
  )
  chmodSync(git, 0o700)
  chmodSync(ssh, 0o700)
  chmodSync(codex, 0o700)

  for (const id of ["githubSsh", "codex"] as const) {
    const script = remoteServerBarrierCheckCommand(profile(), id).at(-1)
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

  writeFileSync(codex, '#!/bin/sh\n[ "$1 $2" = "login status" ]\n')
  const outdatedScript = remoteServerBarrierCheckCommand(profile(), "codex").at(-1)
  if (!outdatedScript) throw new Error("Missing remote Codex readiness script")
  const outdated = Bun.spawn(["/bin/sh", "-c", outdatedScript], {
    env: { HOME: root, PATH: root, LC_ALL: "C" },
    stdout: "pipe",
    stderr: "pipe",
  })
  const [outdatedExit, outdatedOutput] = await Promise.all([
    outdated.exited,
    new Response(outdated.stdout).text(),
  ])
  expect(outdatedExit).toBe(0)
  expect(outdatedOutput).toContain("TUIMINAL_REMOTE_READY:codex:codexAppServerUnavailable")
})

test("remote readiness keeps the current barrier when verification fails", async () => {
  const root = fixtureRoot()
  const missing = join(root, "ssh-missing.js")
  writeFileSync(missing, 'process.stdout.write("TUIMINAL_REMOTE_READY:codex:codexMissing\\n")\n')

  await expect(
    checkRemoteServerBarrier(profile(), "codex", undefined, {
      executable: [process.execPath, missing],
      timeoutMs: 1_000,
    }),
  ).resolves.toEqual({ id: "codex", ready: false, code: "codexMissing" })
})

test("Codex setup activates the standalone install in the current SSH session before login", () => {
  const report = {
    githubSsh: { id: "githubSsh", ready: true, code: "ready" },
    codex: { id: "codex", ready: false, code: "codexMissing" },
  } as const

  expect(remoteServerSetupInstructions("codex", report)).toEqual([
    "1. Instale: curl -fsSL https://chatgpt.com/codex/install.sh | sh",
    '2. Ative nesta sessão: export PATH="$HOME/.local/bin:$PATH"',
    "3. Verifique: command -v codex && codex --version",
    "4. Conecte sua conta: codex login --device-auth",
    "5. No navegador local, conclua o acesso e aguarde o sucesso neste terminal",
    "6. Confirme o login: codex login status",
  ])
  expect(
    remoteServerSetupInstructions("codex", {
      ...report,
      codex: { id: "codex", ready: false, code: "codexUnauthenticated" },
    }),
  ).toEqual([
    '1. Ative nesta sessão: export PATH="$HOME/.local/bin:$PATH"',
    "2. Verifique: command -v codex && codex --version",
    "3. Conecte sua conta: codex login --device-auth",
    "4. No navegador local, conclua o acesso e aguarde o sucesso neste terminal",
    "5. Confirme o login: codex login status",
  ])
  expect(
    remoteServerSetupInstructions("codex", {
      ...report,
      codex: { id: "codex", ready: false, code: "codexAppServerUnavailable" },
    }),
  ).toEqual([
    "1. Atualize: curl -fsSL https://chatgpt.com/codex/install.sh | sh",
    '2. Ative nesta sessão: export PATH="$HOME/.local/bin:$PATH"',
    "3. Verifique: codex app-server --help",
  ])
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
  const target = profile()
  const command = createRemoteServerSetupCommand(target)

  expect(command.command.slice(0, 2)).toEqual(["ssh", "-tt"])
  expect(command.command).toContain("RemoteCommand=none")
  expect(command.command).toContain("StdinNull=no")
  expect(command.command).toContain("ClearAllForwardings=yes")
  expect(command.command.at(-1)).toBe("oracle-vps")
  expect(command.displayCommand).toBe("ssh oracle-vps")
  expect(command.remoteSetup).toEqual({ profile: target })
})

test("remote Codex starts a persistent daemon and connects through a disposable SSH proxy", () => {
  const target = profile()
  const directory = "/srv/project with 'quote'"
  const launch = createRemoteCodexAppServerLaunch(target, directory)
  const proxy = remoteCodexProxySshCommand(target, directory)
  const daemon = remoteCodexDaemonStartSshCommand(target, directory)
  const probe = remoteCodexPreflightSshCommand(target, directory)
  const temporaryConnection = remoteCodexAppServerSshCommand(target, directory)

  expect(proxy.slice(0, -1)).toEqual([
    "ssh",
    "-T",
    "-o",
    "BatchMode=yes",
    "-o",
    "ConnectTimeout=10",
    "-o",
    "ConnectionAttempts=1",
    "-o",
    "ServerAliveInterval=30",
    "-o",
    "ServerAliveCountMax=3",
    "-o",
    "RemoteCommand=none",
    "-o",
    "SessionType=default",
    "-o",
    "StdinNull=no",
    "-o",
    "ForkAfterAuthentication=no",
    "-o",
    "PermitLocalCommand=no",
    "-o",
    "ControlMaster=no",
    "-o",
    "ControlPersist=no",
    "-S",
    "none",
    "-o",
    "ClearAllForwardings=yes",
    "oracle-vps",
  ])
  expect(proxy.at(-1)).toContain("exec /bin/sh -c")
  expect(proxy.at(-1)).toContain("/srv/project with")
  expect(proxy.at(-1)).toContain("quote")
  expect(proxy.at(-1)).toContain('exec "$codex_command" app-server proxy')
  expect(daemon.at(-1)).toContain(
    '"$codex_command" app-server daemon start </dev/null >/dev/null || exit 73',
  )
  expect(daemon.at(-1)).toContain(
    'exec "$codex_command" app-server daemon version </dev/null || exit 73',
  )
  expect(probe.at(-1)).toContain('"$codex_command" app-server daemon --help')
  expect(probe.at(-1)).toContain('"$codex_command" app-server proxy --help')
  expect(probe.at(-1)).toContain("$HOME/.codex/packages/standalone/current/bin/codex")
  expect(probe.at(-1)).toContain('"$codex_command" login status')
  expect(launch).toEqual({ daemonStartCommand: daemon, proxyCommand: proxy })
  expect(temporaryConnection.at(-1)).toContain(
    "app-server daemon start </dev/null >/dev/null 2>&1 || exit 73",
  )
  expect(temporaryConnection.at(-1)).toContain('exec "$codex_command" app-server proxy')
  for (const command of [daemon.at(-1), proxy.at(-1), probe.at(-1), temporaryConnection.at(-1)]) {
    expect(command).not.toContain("daemon stop")
    expect(command).not.toContain("mkfifo")
    expect(command).not.toContain("heartbeat")
    expect(command).not.toContain("watchdog")
  }
  expect(remoteInteractiveSshCommand(target)[1]).toBe("-tt")

  expect(remoteCodexTuiCommand("ws://127.0.0.1:4500", "/srv/project")).toEqual([
    "codex",
    "--remote",
    "ws://127.0.0.1:4500",
    "-C",
    "/srv/project",
  ])
  expect(remoteCodexTuiCommand("ws://127.0.0.1:4500", "/srv/project", "thread-1")).toEqual([
    "codex",
    "resume",
    "thread-1",
    "--remote",
    "ws://127.0.0.1:4500",
    "-C",
    "/srv/project",
  ])

  expect(
    createRemoteCodexAgentCommand({ profile: target, workingDirectory: "/srv/project" }),
  ).toMatchObject({
    label: "Codex · oracle-vps",
    workingDirectory: "/srv/project",
    agentLaunch: {
      providerId: "codex",
      transport: "app-server",
      remote: { profile: target, workingDirectory: "/srv/project" },
    },
  })
  expect(() => remoteCodexAppServerSshCommand(target, "relative/project")).toThrow()
  expect(() => remoteCodexTuiCommand("ws://127.0.0.1:4500", "relative/project")).toThrow()
})

test("automated SSH commands isolate alias side effects and detect tunnel conflicts", () => {
  const command = remoteSshEffectiveConfigurationCommand(profile())
  expect(command).toContain("RemoteCommand=none")
  expect(command).toContain("SessionType=none")
  expect(command).toContain("StdinNull=no")
  expect(command).toContain("ForkAfterAuthentication=no")
  expect(command).toContain("PermitLocalCommand=no")
  expect(command).toContain("ControlMaster=no")
  expect(command).toContain("ControlPersist=no")
  expect(command).toContain("none")
  expect(sshConfigurationHasForwarding("hostname host\nuser ubuntu\n")).toBe(false)
  expect(
    sshConfigurationHasForwarding("hostname host\nlocalforward 127.0.0.1:3000 [127.0.0.1]:3000\n"),
  ).toBe(true)
  expect(sshConfigurationHasForwarding("remoteforward 127.0.0.1:0 [127.0.0.1]:3000\n")).toBe(true)
  expect(sshConfigurationHasForwarding("  dynamicforward 127.0.0.1:1080\n")).toBe(true)
})

test("generated remote stdio command completes the app-server handshake", async () => {
  const root = fixtureRoot()
  const codex = join(root, "codex")
  const calls = join(root, "calls")
  writeFileSync(
    codex,
    [
      "#!/bin/sh",
      'printf "%s\\n" "$*" >> "$TUIMINAL_TEST_CALLS"',
      'case "$*" in',
      '  "app-server daemon start") exit 0 ;;',
      '  "app-server proxy") exec "$TUIMINAL_TEST_RUNTIME" "$TUIMINAL_TEST_APP_SERVER" handshake "$TUIMINAL_TEST_RESPONSE" ;;',
      "  *) exit 1 ;;",
      "esac",
    ].join("\n"),
  )
  chmodSync(codex, 0o700)
  const command = remoteCodexAppServerSshCommand(profile(), root).at(-1)
  if (!command) throw new Error("Missing remote app-server command")
  const response = JSON.stringify({ result: { userAgent: "codex_cli_rs/0.158.0" } })
  const environment = `HOME='${root}'; PATH='${root}:/usr/bin:/bin'; TUIMINAL_TEST_CALLS='${calls}'; TUIMINAL_TEST_RUNTIME='${process.execPath}'; TUIMINAL_TEST_APP_SERVER='${proxyFixture}'; TUIMINAL_TEST_RESPONSE='${response}'; export HOME PATH TUIMINAL_TEST_CALLS TUIMINAL_TEST_RUNTIME TUIMINAL_TEST_APP_SERVER TUIMINAL_TEST_RESPONSE;`
  const result = await handshakeRemoteCodex(profile(), root, new AbortController().signal, {
    remoteCommand: ["/bin/sh", "-c", `${environment} ${command}`],
    localVersionCommand: [process.execPath, "-e", 'process.stdout.write("codex-cli 0.158.0\\n")'],
    timeoutMs: 3_000,
  })
  expect(result).toMatchObject({ remoteVersion: "0.158.0" })
  expect(readFileSync(calls, "utf8")).toBe("app-server daemon start\napp-server proxy\n")
})

test("closing a disposable proxy leaves the persistent remote daemon running", async () => {
  const root = fixtureRoot()
  const codex = join(root, "codex")
  const daemon = join(root, "daemon.js")
  const proxy = join(root, "proxy.js")
  const started = join(root, "started")
  writeFileSync(
    daemon,
    [
      'import { writeFileSync } from "node:fs"',
      "writeFileSync(process.env.TUIMINAL_TEST_STARTED, String(process.pid))",
      "setInterval(() => undefined, 1000)",
    ].join("\n"),
  )
  writeFileSync(proxy, "process.stdin.resume()\n")
  writeFileSync(
    codex,
    [
      "#!/bin/sh",
      'case "$*" in',
      '  "app-server daemon start") "$TUIMINAL_TEST_RUNTIME" "$TUIMINAL_TEST_DAEMON" & ;;',
      '  "app-server daemon version") printf \'%s\\n\' \'{"status":"running","appServerVersion":"0.158.0"}\' ;;',
      '  "app-server proxy") exec "$TUIMINAL_TEST_RUNTIME" "$TUIMINAL_TEST_PROXY" ;;',
      "  *) exit 1 ;;",
      "esac",
    ].join("\n"),
  )
  chmodSync(codex, 0o700)
  const launch = createRemoteCodexAppServerLaunch(profile(), root)
  const daemonCommand = launch.daemonStartCommand.at(-1)
  const proxyCommand = launch.proxyCommand.at(-1)
  if (!daemonCommand || !proxyCommand) throw new Error("Missing remote daemon/proxy command")
  const environment = [
    `HOME='${root}'`,
    `PATH='${root}:/usr/bin:/bin'`,
    `TUIMINAL_TEST_RUNTIME='${process.execPath}'`,
    `TUIMINAL_TEST_DAEMON='${daemon}'`,
    `TUIMINAL_TEST_PROXY='${proxy}'`,
    `TUIMINAL_TEST_STARTED='${started}'`,
  ].join("; ")
  const exports =
    "export HOME PATH TUIMINAL_TEST_RUNTIME TUIMINAL_TEST_DAEMON TUIMINAL_TEST_PROXY TUIMINAL_TEST_STARTED"
  const starter = Bun.spawn(["/bin/sh", "-c", `${environment}; ${exports}; ${daemonCommand}`], {
    stdin: "ignore",
    stdout: "ignore",
    stderr: "pipe",
  })
  const proxyProcess = Bun.spawn(["/bin/sh", "-c", `${environment}; ${exports}; ${proxyCommand}`], {
    stdin: "pipe",
    stdout: "ignore",
    stderr: "pipe",
  })
  let daemonPid = 0
  try {
    expect(await starter.exited).toBe(0)
    for (let attempt = 0; attempt < 50 && !existsSync(started); attempt += 1) await Bun.sleep(20)
    expect(existsSync(started)).toBe(true)
    daemonPid = Number(readFileSync(started, "utf8"))
    process.kill(daemonPid, 0)
    proxyProcess.kill("SIGTERM")
    await proxyProcess.exited
    process.kill(daemonPid, 0)
  } finally {
    if (proxyProcess.exitCode === null) proxyProcess.kill("SIGKILL")
    if (daemonPid) {
      try {
        process.kill(daemonPid, "SIGTERM")
      } catch {
        // The test owns this simulated daemon and it may already be gone.
      }
    }
    await proxyProcess.exited.catch(() => undefined)
  }
})

test("remote Codex refresh lists and hydrates agents through the raw SSH proxy", async () => {
  const controller = new AbortController()
  const requests = join(fixtureRoot(), "remote-resume-requests.jsonl")
  const threads = await refreshRemoteCodexResumeThreads(profile(), controller.signal, {
    executable: [
      process.execPath,
      proxyFixture,
      "resume",
      JSON.stringify({ result: {} }),
      requests,
    ],
  })

  expect(threads).toEqual([
    {
      id: "remote-1",
      title: "Agente remoto",
      preview: "Projeto remoto",
      lastResponse: "Concluído remotamente.",
      cwd: "/srv/project",
      projectName: "project",
      gitBranch: "feature/remote",
      updatedAt: 10,
      state: "idle",
      remoteProfileId: "oracle-vps",
      remoteProfileName: "oracle-vps",
    },
  ])
})
