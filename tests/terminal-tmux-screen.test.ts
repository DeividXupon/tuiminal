import { expect, test } from "bun:test"
import { AgentMonitor } from "../packages/feature-terminal/src/services/agent-monitor"
import {
  parseTmuxScreen,
  renderTmuxScreen,
  type TmuxScreen,
} from "../packages/feature-terminal/src/rendering/tmux-screen"

function screen(lines: string[], overrides: Partial<TmuxScreen> = {}): TmuxScreen {
  return {
    pid: 1120,
    dead: false,
    code: null,
    width: 40,
    height: 10,
    x: 2,
    y: 1,
    cursor: true,
    arrows: false,
    keypad: false,
    title: "",
    lines,
    ...overrides,
  }
}

test("title metadata is sanitized, forwarded once and cleared without touching captured text", () => {
  const monitor = new AgentMonitor(40, 10)
  const before = parseTmuxScreen("1120\t0\t\t40\t10\t2\t1\t1\t0\t0\tOC | Fix\u202e login\nPROMPT\n")
  try {
    monitor.write(new TextEncoder().encode(renderTmuxScreen(before, 40, 10)))
    expect(monitor.title).toBe("OC | Fix login")
    const unchanged = renderTmuxScreen(before, 40, 10, before)
    expect(unchanged).not.toContain("\x1b]2;")
    const unsafe = { ...before, title: "Fix\x07\x1b]52;c;ignored\x07" }
    const update = renderTmuxScreen(unsafe, 40, 10, before)
    expect(update).not.toContain("\x1b]52;")
    expect(update).not.toContain("PROMPT")
    monitor.write(new TextEncoder().encode(update))
    monitor.write(
      new TextEncoder().encode(renderTmuxScreen({ ...unsafe, title: "" }, 40, 10, unsafe)),
    )
    expect(monitor.title).toBe("")
    expect(monitor.screen()).toContain("PROMPT")
  } finally {
    monitor.dispose()
  }
})

test("typing updates the changed tail without clearing or retransmitting earlier content", () => {
  const monitor = new AgentMonitor(40, 10)
  const before = screen(["AGENT_CONVERSATION", "PROMPT: very long input", "STALE_ROW"])
  const after = screen(["AGENT_CONVERSATION", "PROMPT: hi"])
  try {
    monitor.write(new TextEncoder().encode(renderTmuxScreen(before, 40, 10)))
    const update = renderTmuxScreen(after, 40, 10, before)
    expect(update).not.toContain("\x1b[2J")
    expect(update).not.toContain("AGENT_CONVERSATION")
    monitor.write(new TextEncoder().encode(update))
    expect(monitor.screen()).toContain("AGENT_CONVERSATION")
    expect(monitor.screen()).toContain("PROMPT: hi")
    expect(monitor.screen()).not.toContain("long input")
    expect(monitor.screen()).not.toContain("STALE_ROW")
  } finally {
    monitor.dispose()
  }
})

test("cursor and input mode changes do not repaint conversation text", () => {
  const before = screen(["AGENT_CONVERSATION", "PROMPT"])
  const after = { ...before, x: 4, arrows: true, keypad: true, cursor: false }
  const update = renderTmuxScreen(after, 40, 10, before)
  expect(update).not.toContain("AGENT_CONVERSATION")
  expect(update).not.toContain("PROMPT")
  expect(update).not.toContain("\x1b[2J")
  expect(update).not.toContain("\x1b[2K")
  expect(update).toContain("\x1b[2;5H")
  expect(update).toContain("\x1b[?1h")
  expect(update).toContain("\x1b=")
  expect(update).not.toContain("\x1b[?25h")
})

test("partial updates retain styles inherited from unchanged or clipped rows", () => {
  const before = screen(["\x1b[31mUNCHANGED", "PROMPT", "NEXT"])
  const after = { ...before, lines: [before.lines[0]!, "CHANGED", "NEXT"] }
  const update = renderTmuxScreen(after, 40, 10, before)
  expect(update).not.toContain("UNCHANGED")
  expect(update).toContain("\x1b[31m\x1b[2;1HCHANGED")
  const clipped = screen(["\x1b[34mOFFSCREEN", "VISIBLE", "PROMPT", "", "", ""], {
    height: 6,
    y: 5,
  })
  const clippedUpdate = renderTmuxScreen(
    { ...clipped, lines: [clipped.lines[0]!, "VISIBLE", "NEW"] },
    40,
    5,
    clipped,
  )
  expect(clippedUpdate).not.toContain("OFFSCREEN")
  expect(clippedUpdate).not.toContain("VISIBLE")
  expect(clippedUpdate).toContain("\x1b[34m\x1b[2;1HNEW")
})

test("viewport shifts and source resizes repaint the full screen", () => {
  const before = screen(["TOP", "ONE", "TWO", "THREE", "FOUR", "FIVE"], { height: 6 })
  const shifted = { ...before, y: 5 }
  const monitor = new AgentMonitor(40, 5)
  try {
    monitor.write(new TextEncoder().encode(renderTmuxScreen(before, 40, 5)))
    const update = renderTmuxScreen(shifted, 40, 5, before)
    expect(update).toContain("\x1b[2J")
    monitor.write(new TextEncoder().encode(update))
    expect(monitor.screen()).not.toContain("TOP")
    expect(monitor.screen()).toContain("ONE")
    expect(monitor.screen()).toContain("FIVE")
    expect(renderTmuxScreen({ ...shifted, width: 80 }, 40, 5, shifted)).toContain("\x1b[2J")
  } finally {
    monitor.dispose()
  }
})

test("fast clipping preserves wide characters, combining marks and styles past the edge", () => {
  const monitor = new AgentMonitor(20, 5)
  const source = screen([`${"a".repeat(17)}e\u0301界OVERFLOW\x1b[32m`, "GREEN_PROMPT"])
  try {
    const output = renderTmuxScreen(source, 20, 5)
    expect(output).toContain(`${"a".repeat(17)}e\u0301界\x1b[32m`)
    expect(output).not.toContain("OVERFLOW")
    monitor.write(new TextEncoder().encode(output))
    expect(monitor.screen()).toContain("界")
    expect(monitor.screen()).toContain("GREEN_PROMPT")
  } finally {
    monitor.dispose()
  }
})
