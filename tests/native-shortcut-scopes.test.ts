import { beforeEach, afterEach, expect, spyOn, test } from "bun:test"
import { EventEmitter } from "node:events"
import { NativeShortcutScopes } from "../packages/core/src/keyboard/native-scopes"

const queued: VoidFunction[] = []
let restoreQueue = () => {}
beforeEach(() => {
  const enqueue = spyOn(globalThis, "queueMicrotask").mockImplementation((callback) =>
    queued.push(callback),
  )
  restoreQueue = () => enqueue.mockRestore()
})
afterEach(() => {
  restoreQueue()
  queued.length = 0
})
function flush() {
  for (const callback of queued.splice(0)) callback()
}

test("discarded renderer generations cannot resurrect an old native dispatcher", () => {
  const renderer = { isDestroyed: false, keyInput: new EventEmitter() }
  let calls = 0
  const scopes = new NativeShortcutScopes<typeof renderer, string>(() => {
    calls++
  })
  const disposeOld = scopes.register(renderer, "old")
  disposeOld()
  const disposeNew = scopes.register(renderer, "new")
  flush()
  expect(renderer.keyInput.listenerCount("keypress")).toBe(1)
  renderer.keyInput.emit("keypress", {})
  expect(calls).toBe(1)
  expect([...scopes.get(renderer)!]).toEqual(["new"])
  disposeNew()
  expect(renderer.keyInput.listenerCount("keypress")).toBe(0)
})

test("many mounted owners keep one dispatcher and cleanup leaves other listeners intact", () => {
  const renderer = { isDestroyed: false, keyInput: new EventEmitter() }
  const feature = () => undefined
  renderer.keyInput.on("keypress", feature)
  const scopes = new NativeShortcutScopes<typeof renderer, number>(() => undefined)
  const dispose = Array.from({ length: 30 }, (_, index) => scopes.register(renderer, index))
  flush()
  expect(renderer.keyInput.listenerCount("keypress")).toBe(2)
  for (const cleanup of dispose) cleanup()
  expect(renderer.keyInput.listeners("keypress")).toEqual([feature])
})

test("destroyed renderers never gain a queued dispatcher", () => {
  const renderer = { isDestroyed: false, keyInput: new EventEmitter() }
  const scopes = new NativeShortcutScopes<typeof renderer, string>(() => undefined)
  const dispose = scopes.register(renderer, "scope")
  renderer.isDestroyed = true
  flush()
  expect(renderer.keyInput.listenerCount("keypress")).toBe(0)
  dispose()
})
