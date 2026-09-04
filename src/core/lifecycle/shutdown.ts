/** Attempt every owned resource, even if one disposer fails. Never stops foreign processes. */
export async function shutdownResources(disposers: Iterable<() => void | Promise<void>>) {
  return Promise.allSettled([...disposers].map((dispose) => Promise.resolve().then(dispose)))
}
