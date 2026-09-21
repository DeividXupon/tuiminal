import { CliRenderEvents } from "@opentui/core"

type TerminalCapabilitySource = {
  capabilities: { terminal: { from_xtversion: boolean } } | null
  on(event: CliRenderEvents.CAPABILITIES, listener: () => void): unknown
  off(event: CliRenderEvents.CAPABILITIES, listener: () => void): unknown
}

function terminalIdentificationReady(renderer: TerminalCapabilitySource) {
  return renderer.capabilities?.terminal.from_xtversion === true
}

export function waitForPinnedSidebarTerminalReady(
  renderer: TerminalCapabilitySource,
  timeoutMs = 500,
) {
  if (terminalIdentificationReady(renderer)) return Promise.resolve()
  return new Promise<void>((resolve) => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const finish = () => {
      if (timer) clearTimeout(timer)
      renderer.off(CliRenderEvents.CAPABILITIES, onCapabilities)
      resolve()
    }
    const onCapabilities = () => {
      if (terminalIdentificationReady(renderer)) finish()
    }
    renderer.on(CliRenderEvents.CAPABILITIES, onCapabilities)
    timer = setTimeout(finish, Math.max(0, timeoutMs))
    if (terminalIdentificationReady(renderer)) finish()
  })
}
