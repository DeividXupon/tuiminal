type StdioInput = {
  write(value: string | Uint8Array): number | Promise<number>
  end(): void
}

type RemoteCodexHeartbeatOptions = {
  intervalMs?: number
}

export const REMOTE_CODEX_HEARTBEAT_INTERVAL_MS = 20_000

/** Keeps remote stdio writes ordered and renews the remote app-server lease while idle. */
export function startRemoteCodexHeartbeat(
  stdin: StdioInput,
  heartbeatLine: string,
  onError: () => void,
  options: RemoteCodexHeartbeatOptions = {},
) {
  let stopped = false
  let reportedError = false
  let pending: Promise<unknown> = Promise.resolve()

  const reportError = () => {
    if (reportedError || stopped) return
    reportedError = true
    onError()
  }
  const writeLine = (value: string) => {
    pending = pending
      .then(() => {
        if (stopped) return
        return Promise.resolve(stdin.write(`${value}\n`))
      })
      .catch(reportError)
  }

  writeLine(heartbeatLine)
  const timer = setInterval(
    () => writeLine(heartbeatLine),
    options.intervalMs ?? REMOTE_CODEX_HEARTBEAT_INTERVAL_MS,
  )

  return {
    write: writeLine,
    stop() {
      if (stopped) return
      stopped = true
      clearInterval(timer)
      try {
        stdin.end()
      } catch {
        // The SSH process may already have closed its input.
      }
    },
  }
}
