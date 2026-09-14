import type { FreeTerminalProcessHandle } from "./terminal"

export async function stopTerminalBeforeRestart({
  handle,
  write,
  onError,
}: {
  handle: FreeTerminalProcessHandle | undefined
  write: (data: string) => void
  onError: (message: string) => void
}) {
  if (!handle) return true
  try {
    await handle.stop()
    return true
  } catch (error) {
    const message = error instanceof Error ? error.message : "O terminal anterior não encerrou."
    write(`\r\n\u001b[38;2;255;107;107m× ${message}\u001b[0m\r\n`)
    onError(message)
    return false
  }
}
