import { afterEach, expect, test } from "bun:test"
import { existsSync, readFileSync } from "node:fs"
import { dirname } from "node:path"
import {
  DEFAULT_TERMINAL_AGENT_SOUNDS,
  normalizeTerminalAgentSounds,
} from "../packages/core/src/settings/terminal-sounds"
import {
  getUiSettings,
  initializeUiSettings,
  updateUiSettings,
} from "../packages/core/src/settings/theme"
import { AgentSoundTransition } from "../packages/feature-terminal/src/model/agent-sound-transition"
import {
  agentSoundCommands,
  createAgentSoundPlayer,
} from "../packages/feature-terminal/src/services/agent-sounds"
import sounds from "../packages/feature-terminal/src/audio/agent-sounds.json"

const settings = getUiSettings()
afterEach(() => {
  updateUiSettings(settings)
})

test("sound choices are validated by event, cloned and persisted", () => {
  expect(
    normalizeTerminalAgentSounds({ question: "../../bad", completed: "question_004", error: null }),
  ).toEqual({ ...DEFAULT_TERMINAL_AGENT_SOUNDS, error: null })
  const chosen = { question: "question_002", completed: "select_006", error: null } as const
  expect(updateUiSettings({ terminalAgentSounds: chosen }).error).toBeNull()
  expect(initializeUiSettings().terminalAgentSounds).toEqual(chosen)
  getUiSettings().terminalAgentSounds.question = null
  expect(getUiSettings().terminalAgentSounds.question).toBe("question_002")
  updateUiSettings({ palette: "nord" })
  expect(getUiSettings().terminalAgentSounds).toEqual(chosen)
})

test("live questions and successful work cycles play once, without replaying hydration", () => {
  const observer = new AgentSoundTransition()
  expect(observer.observe("done")).toBeNull()
  expect(observer.observe("idle")).toBeNull()
  observer.observe("working")
  expect(observer.observe("blocked")).toBe("question")
  expect(observer.observe("blocked")).toBeNull()
  observer.observe("working")
  expect(observer.observe("done")).toBe("completed")
  expect(observer.observe("done")).toBeNull()
  observer.observe("idle")
  expect(observer.observe("done")).toBeNull()
  observer.reset("blocked")
  expect(observer.observe("blocked")).toBeNull()
})

test("failure and interruption do not claim successful completion; screen idle needs work", () => {
  const observer = new AgentSoundTransition()
  observer.observe("working")
  expect(observer.error()).toBe("error")
  expect(observer.error()).toBeNull()
  expect(observer.observe("done")).toBeNull()
  observer.observe("working")
  expect(observer.observe("unknown")).toBeNull()
  expect(observer.observe("idle")).toBeNull()
  const screen = new AgentSoundTransition()
  screen.observe("idle", true)
  screen.observe("working", true)
  expect(screen.observe("idle", true)).toBe("completed")
  expect(screen.observe("idle", true)).toBeNull()
})

test("all seven embedded recordings use mono 44.1 kHz PCM WAV", () => {
  expect(Object.keys(sounds)).toHaveLength(7)
  for (const encoded of Object.values(sounds)) {
    const wav = Buffer.from(encoded, "base64")
    expect(wav.toString("ascii", 0, 4)).toBe("RIFF")
    expect(wav.toString("ascii", 8, 12)).toBe("WAVE")
    expect(wav.readUInt16LE(20)).toBe(1)
    expect(wav.readUInt16LE(22)).toBe(1)
    expect(wav.readUInt32LE(24)).toBe(44100)
    expect(wav.readUInt16LE(34)).toBe(16)
  }
})

test("players receive an owned WAV outside the project and cleanup after fallback", async () => {
  const files: string[] = []
  const commands: string[] = []
  const player = createAgentSoundPlayer({
    platform: "linux",
    windowsRoot: "unused",
    available: () => true,
    run: async (command, file) => {
      files.push(file)
      commands.push(command[0]!)
      expect(readFileSync(file)).toEqual(Buffer.from(sounds.question_004, "base64"))
      return commands.length === 2
    },
  })
  expect(await player.play("question_004")).toBe("played")
  expect(commands).toEqual(["/usr/bin/pw-play", "/usr/bin/paplay"])
  expect(files.every((file) => !existsSync(dirname(file)))).toBe(true)
  await player.stop()
})

test("preview cancellation and shutdown retire owned playback before removing its file", async () => {
  let started!: () => void
  const ready = new Promise<void>((resolve) => {
    started = resolve
  })
  let file = ""
  const player = createAgentSoundPlayer({
    platform: "darwin",
    windowsRoot: "unused",
    available: () => true,
    run: async (_command, path, signal) => {
      file = path
      started()
      await new Promise<void>((resolve) =>
        signal.addEventListener("abort", () => resolve(), { once: true }),
      )
      expect(existsSync(file)).toBe(true)
      return false
    },
  })
  const pending = player.play("select_006")
  await ready
  await player.stop()
  expect(await pending).toBe("cancelled")
  expect(existsSync(dirname(file))).toBe(false)
})

test("unavailable audio is reported; Windows paths never become PowerShell source", async () => {
  const player = createAgentSoundPlayer({
    platform: "linux",
    windowsRoot: "",
    available: () => false,
    run: async () => {
      throw new Error("must not spawn")
    },
  })
  expect(await player.play("error_005")).toBe("unavailable")
  const command = agentSoundCommands("win32", "C:\\user's data\\$(unsafe).wav")[0]!
  expect(command.join(" ")).not.toContain("unsafe")
  expect(command.at(-1)).toContain("$env.TUIMINAL_AGENT_SOUND_FILE")
  expect(command.at(-1)).toContain(".Load()")
  expect(command.at(-1)).toContain(".PlaySync()")
  expect(agentSoundCommands("darwin", "/tmp/example.wav")).toEqual([
    ["/usr/bin/afplay", "/tmp/example.wav"],
  ])
})
