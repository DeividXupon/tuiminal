import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { TmuxMirrorRefresh } from "../packages/feature-terminal/src/services/tmux-mirror-refresh"

const restores: Array<() => void> = []
const mirrors: TmuxMirrorRefresh[] = []
afterEach(async () => {
  await Promise.all(mirrors.splice(0).map((mirror) => mirror.stop()))
  for (const restore of restores.splice(0)) restore()
})

/** Drive only this fixture's scheduled captures, without wall-clock assertions. */
function clock() {
  const timers = new Map<object, { delay: number; fire: () => Promise<void> | void }>()
  const schedule = spyOn(globalThis, "setTimeout").mockImplementation(
    new Proxy(globalThis.setTimeout, {
      apply(_target, _receiver, [callback, delay]) {
        const token = {}
        timers.set(token, { delay, fire: callback })
        return token
      },
    }),
  )
  const cancel = spyOn(globalThis, "clearTimeout").mockImplementation(
    new Proxy(globalThis.clearTimeout, {
      apply(_target, _receiver, [token]) {
        timers.delete(token)
      },
    }),
  )
  restores.push(
    () => schedule.mockRestore(),
    () => cancel.mockRestore(),
  )
  return {
    get delays() {
      return [...timers.values()].map((timer) => timer.delay)
    },
    async fire() {
      const next = timers.entries().next().value
      if (!next) throw new Error("No mirror capture scheduled")
      const [token, timer] = next
      timers.delete(token)
      await timer.fire()
    },
  }
}

test("active mirrors refresh quickly, idle mirrors back off and typing wakes them immediately", async () => {
  const timers = clock()
  const capture = mock(async () => true)
  const refresh = new TmuxMirrorRefresh(
    capture,
    mock(() => {}),
  )
  mirrors.push(refresh)
  refresh.start()
  expect(timers.delays).toEqual([33])
  await timers.fire()
  expect(timers.delays).toEqual([33])

  capture.mockResolvedValue(false)
  for (const delay of [66, 132, 250, 250]) {
    await timers.fire()
    expect(timers.delays).toEqual([delay])
  }
  refresh.request()
  expect(timers.delays).toEqual([0])
  capture.mockResolvedValue(true)
  await timers.fire()
  expect(timers.delays).toEqual([33])
  await refresh.stop()
  expect(timers.delays).toEqual([])
  refresh.request()
  expect(timers.delays).toEqual([])
})

test("input arriving during a slow capture schedules one fresh capture without overlap", async () => {
  const timers = clock()
  const pending = Promise.withResolvers<boolean>()
  const capture = mock(() => pending.promise)
  const refresh = new TmuxMirrorRefresh(
    capture,
    mock(() => {}),
  )
  mirrors.push(refresh)
  refresh.start()
  const current = timers.fire()
  try {
    refresh.request()
    refresh.request()
    refresh.request()
    expect(capture).toHaveBeenCalledTimes(1)
    expect(timers.delays).toEqual([])
  } finally {
    pending.resolve(false)
    await current
  }
  expect(timers.delays).toEqual([0])
  capture.mockResolvedValue(true)
  await timers.fire()
  expect(capture).toHaveBeenCalledTimes(2)
  expect(timers.delays).toEqual([33])
})

test("disconnect drains the active capture and discards requested follow-ups", async () => {
  const timers = clock()
  const pending = Promise.withResolvers<boolean>()
  const capture = mock(() => pending.promise)
  const refresh = new TmuxMirrorRefresh(
    capture,
    mock(() => {}),
  )
  mirrors.push(refresh)
  refresh.start()
  const current = timers.fire()
  refresh.request()
  const stopping = refresh.stop()
  pending.resolve(true)
  await Promise.all([current, stopping])
  expect(timers.delays).toEqual([])
  expect(capture).toHaveBeenCalledTimes(1)
})

test("capture failures retain a bounded retry interval instead of spinning", async () => {
  const timers = clock()
  const error = mock(() => {})
  const refresh = new TmuxMirrorRefresh(
    mock(async () => {
      throw new Error("unavailable")
    }),
    error,
  )
  mirrors.push(refresh)
  refresh.start()
  await timers.fire()
  expect(error).toHaveBeenCalledTimes(1)
  expect(timers.delays).toEqual([250])
})
