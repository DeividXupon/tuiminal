import { expect, test } from "bun:test"
import { DEMO_PULL_REQUESTS } from "../src/features/git/model/pr/fixtures"
import { summarizePullRequestChecks } from "../src/features/git/model/pr/checks"
import type { PullRequestCheck } from "../src/features/git/model/pr/types"
import { PullRequestWatchScheduler } from "../src/features/git/services/pr-watch"

const item = DEMO_PULL_REQUESTS[0]
if (!item) throw new Error("Missing PR fixture")
const check = (state: PullRequestCheck["state"]): PullRequestCheck => ({
  id: "fixture-check",
  name: "CI",
  state,
  detailsUrl: "",
  provider: "fixture",
})

function harness(notify: () => void = () => {}) {
  const reads: Array<{
    signal: AbortSignal | undefined
    resolve: (checks: PullRequestCheck[]) => void
    reject: (error: Error) => void
  }> = []
  const timers = new Map<number, () => void>()
  let id = 0
  const scheduler = new PullRequestWatchScheduler(
    (_item, signal) => new Promise((resolve, reject) => reads.push({ signal, resolve, reject })),
    notify,
    {
      setTimer: ((callback: () => void) => {
        timers.set(++id, callback)
        return id
      }) as unknown as typeof setTimeout,
      clearTimer: ((timer: number) => timers.delete(timer)) as unknown as typeof clearTimeout,
      random: () => 0.5,
    },
  )
  function next() {
    const entry = timers.entries().next().value
    if (!entry) throw new Error("No scheduled watch read")
    timers.delete(entry[0])
    entry[1]()
  }
  return { scheduler, reads, timers, next }
}

async function flush() {
  await Promise.resolve()
  await Promise.resolve()
}

test("a stopped watch cannot notify or remove its replacement when the old read finishes", async () => {
  let notices = 0
  const h = harness(() => {
    notices += 1
  })
  try {
    h.scheduler.watch(item)
    h.reads[0]?.resolve([check("pending")])
    await flush()
    h.next()
    expect(h.scheduler.unwatch(item)).toBe(true)
    h.scheduler.watch(item)
    h.reads[1]?.resolve([check("success")])
    await flush()
    expect(notices).toBe(0)
    expect(h.scheduler.isWatching(item)).toBe(true)
    h.reads[2]?.resolve([check("pending")])
    await flush()
    h.next()
    h.reads[3]?.resolve([check("success")])
    await flush()
    expect(notices).toBe(1)
    expect(h.scheduler.isWatching(item)).toBe(false)
  } finally {
    h.scheduler.dispose()
  }
})

test.each(["unwatch", "dispose"] as const)(
  "%s aborts the exact active watch read and leaves no timer",
  async (action) => {
    const h = harness()
    try {
      h.scheduler.watch(item)
      const signal = h.reads[0]?.signal
      expect(signal?.aborted).toBe(false)
      if (action === "unwatch") h.scheduler.unwatch(item)
      else h.scheduler.dispose()
      expect(signal?.aborted).toBe(true)
      h.reads[0]?.reject(new Error("late cancellation"))
      await flush()
      expect(h.timers.size).toBe(0)
      expect(h.scheduler.isWatching(item)).toBe(false)
    } finally {
      h.scheduler.dispose()
    }
  },
)

test("late terminal success after dispose never publishes a completion", async () => {
  let notices = 0
  const h = harness(() => {
    notices += 1
  })
  h.scheduler.watch(item)
  h.reads[0]?.resolve([check("pending")])
  await flush()
  h.next()
  h.scheduler.dispose()
  h.reads[1]?.resolve([check("success")])
  await flush()
  expect(notices).toBe(0)
  expect(h.timers.size).toBe(0)
})

test("notification failure cannot restart a completed watch or cause duplicate notices", async () => {
  let notices = 0
  const h = harness(() => {
    notices += 1
    throw new Error("notification unavailable")
  })
  try {
    h.scheduler.watch(item)
    h.reads[0]?.resolve([check("pending")])
    await flush()
    h.next()
    h.reads[1]?.resolve([check("success")])
    await flush()
    expect(notices).toBe(1)
    expect(h.scheduler.isWatching(item)).toBe(false)
    expect(h.timers.size).toBe(0)
  } finally {
    h.scheduler.dispose()
  }
})

test("an already queued timer cannot read again after its watch is stopped", async () => {
  const h = harness()
  try {
    h.scheduler.watch(item)
    h.reads[0]?.resolve([check("pending")])
    await flush()
    const callback = h.timers.values().next().value
    expect(callback).toBeDefined()
    h.scheduler.unwatch(item)
    callback?.()
    await flush()
    expect(h.reads).toHaveLength(1)
    expect(h.timers.size).toBe(0)
  } finally {
    h.scheduler.dispose()
  }
})

test("CI summary reads each check state once while keeping counts and deterministic signature", () => {
  let stateReads = 0
  const states = [
    "pending",
    "success",
    "failure",
    "cancelled",
    "skipped",
    "unknown",
    "none",
  ] as const
  const checks = Array.from({ length: 700 }, (_, index) => ({
    ...check("success"),
    id: String(index),
    attempt: 2,
    get state() {
      stateReads += 1
      return states[index % states.length] ?? "unknown"
    },
  }))
  const summary = summarizePullRequestChecks(checks)
  expect(stateReads).toBe(700)
  expect(summary).toMatchObject({
    state: "pending",
    terminal: false,
    pending: 100,
    success: 100,
    failure: 100,
    cancelled: 100,
    skipped: 100,
    unknown: 100,
  })
  expect(summary.signature).toBe(
    Array.from({ length: 700 }, (_, index) => `${index}:2:${states[index % states.length]}`)
      .sort()
      .join("|"),
  )
})
