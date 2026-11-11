import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  getUiSettings,
  type TerminalAgentSoundEvent,
  type TerminalAgentSoundId,
} from "@xupon/tuiminal-core/settings/theme"
import sounds from "../audio/agent-sounds.json"
import { registerTerminalResource } from "./terminal-resources"

export type AgentSoundPlayback = "played" | "unavailable" | "failed" | "cancelled"

export function agentSoundCommands(platform: string, file: string, windowsRoot = "C:\\Windows") {
  if (platform === "darwin") return [["/usr/bin/afplay", file]]
  if (platform === "win32")
    return [
      [
        `${windowsRoot}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`,
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "$ErrorActionPreference='Stop'; $player=New-Object System.Media.SoundPlayer; try { $player.SoundLocation=$env.TUIMINAL_AGENT_SOUND_FILE; $player.Load(); $player.PlaySync() } finally { $player.Dispose() }",
      ],
    ]
  if (platform === "linux")
    return ["pw-play", "paplay", "aplay"].map((name) => [`/usr/bin/${name}`, file])
  return []
}

export function runAgentSoundCommand(command: string[], file: string, signal: AbortSignal) {
  return new Promise<boolean>((resolve) => {
    if (signal.aborted) return resolve(false)
    const child = spawn(command[0]!, command.slice(1), {
      cwd: tmpdir(),
      stdio: "ignore",
      windowsHide: true,
      env: { ...process.env, TUIMINAL_AGENT_SOUND_FILE: file },
    })
    const stop = () => child.kill("SIGKILL")
    const timeout = setTimeout(stop, 5000)
    signal.addEventListener("abort", stop, { once: true })
    child.once("error", () => undefined)
    child.once("close", (code) => {
      clearTimeout(timeout)
      signal.removeEventListener("abort", stop)
      resolve(code === 0 && !signal.aborted)
    })
  })
}

async function playCommands(
  commands: string[][],
  file: string,
  signal: AbortSignal,
  run: typeof runAgentSoundCommand,
): Promise<AgentSoundPlayback> {
  for (const command of commands) {
    if (signal.aborted) return "cancelled"
    if (await run(command, file, signal)) return "played"
  }
  return signal.aborted ? "cancelled" : "failed"
}

/** One owned player at a time; files and children never belong to the opened project. */
export function createAgentSoundPlayer(
  dependencies = {
    platform: process.platform as string,
    windowsRoot: process.env.SystemRoot ?? "C:\\Windows",
    available: existsSync,
    run: runAgentSoundCommand,
  },
) {
  let active: AbortController | undefined
  let pending: Promise<AgentSoundPlayback> = Promise.resolve("cancelled")
  async function perform(
    id: TerminalAgentSoundId,
    signal: AbortSignal,
  ): Promise<AgentSoundPlayback> {
    if (signal.aborted) return "cancelled"
    let directory: string | undefined
    try {
      if (!Object.hasOwn(sounds, id)) return "failed"
      directory = await mkdtemp(join(tmpdir(), "tuiminal-agent-sound-"))
      const file = join(directory, `${id}.wav`)
      const commands = agentSoundCommands(
        dependencies.platform,
        file,
        dependencies.windowsRoot,
      ).filter((command) => dependencies.available(command[0]!))
      if (!commands.length) return "unavailable"
      await writeFile(file, Buffer.from(sounds[id], "base64"), { mode: 0o600 })
      return await playCommands(commands, file, signal, dependencies.run)
    } catch {
      return signal.aborted ? "cancelled" : "failed"
    } finally {
      if (directory) await rm(directory, { recursive: true, force: true }).catch(() => undefined)
    }
  }
  return {
    play(id: TerminalAgentSoundId, signal?: AbortSignal) {
      active?.abort()
      const controller = new AbortController()
      active = controller
      const combined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal
      pending = pending.then(() => perform(id, combined))
      return pending
    },
    async stop() {
      active?.abort()
      await pending
    },
  }
}

const player = createAgentSoundPlayer()
registerTerminalResource(player)

export function previewTerminalAgentSound(id: TerminalAgentSoundId, signal?: AbortSignal) {
  return player.play(id, signal)
}

export function playTerminalAgentSound(event: TerminalAgentSoundEvent) {
  if (process.env.TUIMINAL_AGENT_SOUNDS === "0") return
  const id = getUiSettings().terminalAgentSounds[event]
  if (id) void player.play(id)
}
