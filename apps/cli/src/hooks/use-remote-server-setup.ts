import type { RemoteServerSetupRequest } from "@xupon/tuiminal-feature-terminal"
import { useCallback, useRef, useState } from "react"

export function useRemoteServerSetup(closeSettings: () => void, openTerminal: () => void) {
  const [request, setRequest] = useState<RemoteServerSetupRequest | null>(null)
  const sequence = useRef(0)
  const configure = useCallback(
    (profile: RemoteServerSetupRequest["profile"]) => {
      sequence.current += 1
      setRequest({ id: sequence.current, profile })
      closeSettings()
      openTerminal()
    },
    [closeSettings, openTerminal],
  )
  const handled = useCallback((id: number) => {
    setRequest((current) => (current?.id === id ? null : current))
  }, [])
  return { request, configure, handled }
}
