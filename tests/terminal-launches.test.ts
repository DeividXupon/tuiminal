import { expect, test } from "bun:test"
import { TerminalLaunches } from "../packages/feature-terminal/src/services/terminal-launches"

test("replacement waits until the cancelled detached launch has finished cleaning up", async () => {
  const launches = new TerminalLaunches()
  const cleanup = Promise.withResolvers<void>()
  const steps: string[] = []
  let oldSignal: AbortSignal | undefined
  const first = launches.run("pane", async ({ signal }) => {
    oldSignal = signal
    steps.push("create first")
    await cleanup.promise
    steps.push("retire first")
  })
  const second = launches.run("pane", async () => {
    steps.push("create second")
  })
  const third = launches.run("pane", async () => {
    steps.push("create third")
  })
  expect(oldSignal?.aborted).toBe(true)
  expect(steps).toEqual(["create first"])
  cleanup.resolve()
  await Promise.all([first, second, third])
  expect(steps).toEqual(["create first", "retire first", "create third"])
  expect(launches.has("pane")).toBe(true)
  launches.dispose()
})

test("closing or unmounting prevents a queued replacement from creating a session", async () => {
  for (const dispose of [false, true]) {
    const launches = new TerminalLaunches()
    const pending = Promise.withResolvers<void>()
    let replaced = false
    const first = launches.run("pane", async () => pending.promise)
    const second = launches.run("pane", async () => {
      replaced = true
    })
    if (dispose) launches.dispose()
    else launches.cancel("pane")
    pending.resolve()
    await Promise.all([first, second])
    expect(replaced).toBe(false)
    expect(launches.has("pane")).toBe(false)
  }
})
