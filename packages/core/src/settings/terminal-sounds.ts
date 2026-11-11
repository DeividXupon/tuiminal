export const TERMINAL_AGENT_SOUND_OPTIONS = {
  question: ["question_004", "question_003", "question_002"],
  completed: ["select_004", "select_005", "select_006"],
  error: ["error_005"],
} as const

export type TerminalAgentSoundEvent = keyof typeof TERMINAL_AGENT_SOUND_OPTIONS
export type TerminalAgentSoundId =
  (typeof TERMINAL_AGENT_SOUND_OPTIONS)[TerminalAgentSoundEvent][number]
export type TerminalAgentSounds = {
  [Event in TerminalAgentSoundEvent]: (typeof TERMINAL_AGENT_SOUND_OPTIONS)[Event][number] | null
}

export const DEFAULT_TERMINAL_AGENT_SOUNDS: TerminalAgentSounds = {
  question: "question_004",
  completed: "select_004",
  error: "error_005",
}

export function normalizeTerminalAgentSounds(value: unknown): TerminalAgentSounds {
  const source = value && typeof value === "object" ? value : {}
  const result = { ...DEFAULT_TERMINAL_AGENT_SOUNDS }
  for (const event of Object.keys(result) as TerminalAgentSoundEvent[]) {
    const candidate = Object.hasOwn(source, event) ? Reflect.get(source, event) : undefined
    const choices: readonly unknown[] = TERMINAL_AGENT_SOUND_OPTIONS[event]
    if (candidate === null || choices.includes(candidate)) Reflect.set(result, event, candidate)
  }
  return result
}
