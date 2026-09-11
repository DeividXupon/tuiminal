import {
  forceKillOwnedProcessTree,
  OWNED_PROCESS_STOP_GRACE_MS,
  signalOwnedProcessGroup,
} from "../../../../core/process/owned-process"

export type GitHubCliInstallMode = "install" | "upgrade"

export type GitHubCliInstallPlan = {
  available: boolean
  manager: string
  displayCommand: string
  command: readonly string[] | null
  guideUrl: string
}

export type GitHubCliInstallerExit = {
  code: number | null
  signal: string | null
  stopped: boolean
}

export type GitHubCliInstallerProcess = {
  pid: number
  write: (data: string | Uint8Array) => void
  resize: (columns: number, rows: number) => void
  stop: () => void
}

type BunTerminalLike = {
  write(data: string | Uint8Array): void
  resize(columns: number, rows: number): void
  close(): void
}

type BunSubprocessLike = {
  pid: number
  terminal?: BunTerminalLike
  exited: Promise<number>
  exitCode: number | null
  signalCode: string | null
  kill(signal?: string | number): void
}

type BunRuntimeLike = {
  spawn(
    command: string[],
    options: {
      cwd: string
      env: Record<string, string>
      terminal: {
        cols: number
        rows: number
        name: string
        data: (terminal: BunTerminalLike, data: Uint8Array) => void
      }
    },
  ): BunSubprocessLike
}

const GUIDE_URL = "https://github.com/cli/cli#installation"
const KNOWN_INSTALLERS = [
  "winget",
  "brew",
  "apt",
  "apt-get",
  "dnf",
  "pacman",
  "zypper",
  "apk",
  "sudo",
]
const bunRuntime = (globalThis as typeof globalThis & { Bun?: BunRuntimeLike }).Bun

function elevatedPrefix(commands: ReadonlySet<string>, root: boolean) {
  if (root) return ""
  return commands.has("sudo") ? "sudo " : null
}

function shellPlan(manager: string, script: string): GitHubCliInstallPlan {
  return {
    available: true,
    manager,
    displayCommand: script,
    command: ["/bin/sh", "-lc", script],
    guideUrl: GUIDE_URL,
  }
}

function executablePlan(manager: string, command: string[]): GitHubCliInstallPlan {
  return {
    available: true,
    manager,
    displayCommand: command.join(" "),
    command,
    guideUrl: GUIDE_URL,
  }
}

function aptInstallPlan(commands: ReadonlySet<string>, elevated: string) {
  const apt = commands.has("apt") ? "apt" : "apt-get"
  const script = [
    `(type -p wget >/dev/null || (${elevated}${apt} update && ${elevated}${apt} install wget -y))`,
    `${elevated}mkdir -p -m 755 /etc/apt/keyrings`,
    "out=$(mktemp)",
    "trap 'rm -f \"$out\"' EXIT",
    'wget -nv -O"$out" https://cli.github.com/packages/githubcli-archive-keyring.gpg',
    `cat "$out" | ${elevated}tee /etc/apt/keyrings/githubcli-archive-keyring.gpg >/dev/null`,
    'rm -f "$out"',
    "trap - EXIT",
    `${elevated}chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg`,
    `${elevated}mkdir -p -m 755 /etc/apt/sources.list.d`,
    `echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | ${elevated}tee /etc/apt/sources.list.d/github-cli.list >/dev/null`,
    `${elevated}${apt} update`,
    `${elevated}${apt} install gh -y`,
  ].join(" && ")
  return shellPlan("APT · pacote oficial", script)
}

function linuxInstallPlan(commands: ReadonlySet<string>, root: boolean) {
  const elevated = elevatedPrefix(commands, root)
  if (elevated !== null && (commands.has("apt") || commands.has("apt-get"))) {
    return aptInstallPlan(commands, elevated)
  }
  const packageManagers = [
    ["dnf", `${elevated ?? ""}dnf install -y gh`, "DNF"],
    ["pacman", `${elevated ?? ""}pacman -S --needed github-cli`, "Pacman"],
    ["zypper", `${elevated ?? ""}zypper install gh`, "Zypper"],
    ["apk", `${elevated ?? ""}apk add github-cli`, "APK"],
  ] as const
  const available = packageManagers.find(
    ([executable]) => commands.has(executable) && (root || commands.has("sudo")),
  )
  return available ? shellPlan(available[2], available[1]) : null
}

export function resolveGitHubCliInstallPlan({
  platform,
  commands,
  root = false,
  mode = "install",
}: {
  platform: NodeJS.Platform
  commands: ReadonlySet<string>
  root?: boolean
  mode?: GitHubCliInstallMode
}): GitHubCliInstallPlan {
  if (platform === "win32" && commands.has("winget")) {
    const verb = mode === "upgrade" ? "upgrade" : "install"
    const command = [
      "winget",
      verb,
      "--id",
      "GitHub.cli",
      "--exact",
      "--source",
      "winget",
      "--accept-package-agreements",
      "--accept-source-agreements",
    ]
    return executablePlan("WinGet", command)
  }

  if ((platform === "darwin" || platform === "linux") && commands.has("brew")) {
    const command = ["brew", mode === "upgrade" ? "upgrade" : "install", "gh"]
    return executablePlan("Homebrew", command)
  }

  if (platform === "linux") {
    const plan = linuxInstallPlan(commands, root)
    if (plan) return plan
  }

  return {
    available: false,
    manager: "instalação manual",
    displayCommand: "Consulte o guia oficial para este sistema.",
    command: null,
    guideUrl: GUIDE_URL,
  }
}

export function detectGitHubCliInstallPlan(mode: GitHubCliInstallMode): GitHubCliInstallPlan {
  const commands = new Set(
    KNOWN_INSTALLERS.filter((command) => Boolean(globalThis.Bun?.which(command))),
  )
  return resolveGitHubCliInstallPlan({
    platform: process.platform,
    commands,
    root: process.getuid?.() === 0,
    mode,
  })
}

function processEnvironment() {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  )
}

export function startGitHubCliInstaller(
  plan: GitHubCliInstallPlan,
  options: {
    columns: number
    rows: number
    onData: (data: Uint8Array) => void
    onExit: (result: GitHubCliInstallerExit) => void
  },
): GitHubCliInstallerProcess {
  if (!bunRuntime || !plan.command) throw new Error("Instalador interativo indisponível.")
  let stopped = false
  let closed = false
  let exited = false
  let forceStopTimer: ReturnType<typeof setTimeout> | null = null
  const subprocess = bunRuntime.spawn([...plan.command], {
    cwd: process.cwd(),
    env: {
      ...processEnvironment(),
      TERM: "xterm-256color",
      COLORTERM: "truecolor",
    },
    terminal: {
      cols: Math.max(20, Math.floor(options.columns)),
      rows: Math.max(5, Math.floor(options.rows)),
      name: "xterm-256color",
      data(_terminal, data) {
        options.onData(data)
      },
    },
  })
  const kill = (signal: "SIGTERM" | "SIGKILL") => {
    try {
      subprocess.kill(signal)
    } catch {
      // The child may exit between a state check and the signal.
    }
  }
  const terminal = subprocess.terminal
  if (!terminal) {
    kill("SIGTERM")
    throw new Error("O Bun não conseguiu criar o terminal PTY do instalador.")
  }
  const closeTerminal = () => {
    if (closed) return
    closed = true
    try {
      terminal.close()
    } catch {
      // The child may close the PTY before its exit promise settles.
    }
  }
  const handle: GitHubCliInstallerProcess = {
    pid: subprocess.pid,
    write(data) {
      if (closed) return
      try {
        terminal.write(data)
      } catch {
        // PTY shutdown can race an input event.
      }
    },
    resize(columns, rows) {
      if (closed) return
      try {
        terminal.resize(Math.max(20, columns), Math.max(5, rows))
      } catch {
        // PTY shutdown can race a resize event.
      }
    },
    stop() {
      if (exited) return
      stopped = true
      try {
        terminal.write("\u0003")
      } catch {
        // The process may already have stopped accepting input.
      }
      signalOwnedProcessGroup(subprocess.pid, "SIGTERM", () => kill("SIGTERM"))
      forceStopTimer = setTimeout(() => {
        if (exited) return
        forceKillOwnedProcessTree(subprocess.pid, () => kill("SIGKILL"))
      }, OWNED_PROCESS_STOP_GRACE_MS)
    },
  }
  void subprocess.exited.then((code) => {
    exited = true
    if (forceStopTimer) clearTimeout(forceStopTimer)
    closeTerminal()
    options.onExit({
      code: Number.isFinite(code) ? code : subprocess.exitCode,
      signal: subprocess.signalCode,
      stopped,
    })
  })
  return handle
}
