import type { FreeTerminalProcessHandle } from "./terminal"

/** A launch failed while its owned process/session still needs retirement. */
export class TerminalRetirementError extends Error {
  readonly handle: FreeTerminalProcessHandle

  constructor(cause: unknown, stop: () => Promise<void>) {
    super("Não foi possível encerrar a sessão tmux.", { cause })
    this.handle = { pid: 0, write: () => {}, resize: () => {}, stop }
  }
}

export async function stopTerminalBeforeRestart({
  handle,
  write,
  onError,
  close = false,
}: {
  handle: FreeTerminalProcessHandle | undefined
  write: (data: string) => void
  onError: (message: string) => void
  close?: boolean
}) {
  if (!handle) return true
  try {
    await (close ? (handle.close?.() ?? handle.stop()) : handle.stop())
    return true
  } catch (error) {
    const message = error instanceof Error ? error.message : "O terminal anterior não encerrou."
    write(`\r\n\u001b[38;2;255;107;107m× ${message}\u001b[0m\r\n`)
    onError(message)
    return false
  }
}
