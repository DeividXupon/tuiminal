type TerminalResource = { stop: () => Promise<void> }

const resources = new Set<TerminalResource>()
const launches = new Set<Promise<unknown>>()

export function registerTerminalResource(resource: TerminalResource) {
  resources.add(resource)
  return () => resources.delete(resource)
}

export function trackTerminalLaunch<T>(launch: Promise<T>): Promise<T> {
  launches.add(launch)
  void launch.finally(() => launches.delete(launch)).catch(() => undefined)
  return launch
}

export async function stopAllFreeTerminalProcesses() {
  // A detached session may be between creation and attaching its local client.
  // Keep it owned until the launch has either registered a handle or cleaned up.
  await Promise.allSettled([...launches])
  const results = await Promise.allSettled([...resources].map((resource) => resource.stop()))
  const failures = results.flatMap((result) =>
    result.status === "rejected" ? [result.reason] : [],
  )
  if (failures.length) throw new AggregateError(failures, "Falha ao encerrar terminais próprios.")
}
