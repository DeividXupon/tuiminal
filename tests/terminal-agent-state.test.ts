import { describe, expect, test } from "bun:test"
import { AgentOutput } from "../packages/feature-terminal/src/model/agent-output"
import { detectAgentScreen } from "../packages/feature-terminal/src/model/agent-screen"
import {
  observeAgent,
  type AgentIdentity,
  type AgentObservation,
  type AgentSignal,
} from "../packages/feature-terminal/src/model/agent-state"

const codex: AgentIdentity = { key: "123:codex", label: "Codex", profile: "codex" }
const encoder = new TextEncoder()

describe("agent live-screen profiles", () => {
  test("reads current Codex activity and ignores old approvals and completed spinner rows", () => {
    expect(
      detectAgentScreen("codex", "• Reading files (2s • esc to interrupt)\n› \n? for shortcuts"),
    ).toMatchObject({ state: "working", activity: "reading" })
    expect(
      detectAgentScreen(
        "codex",
        "› Make a change\nAllow command?\nPress enter to confirm or esc to cancel",
      ).state,
    ).toBe("blocked")
    expect(
      detectAgentScreen(
        "codex",
        "Press enter to confirm or esc to cancel\n• Reading files (2s • esc to interrupt)\n• Finished the task\n› \n? for shortcuts",
      ).state,
    ).toBe("idle")
    expect(
      detectAgentScreen("codex", "› Explain the words reading and thinking\n? for shortcuts"),
    ).toMatchObject({ state: "idle" })
    expect(
      detectAgentScreen("codex", "The docs say esc to interrupt when reading a file").state,
    ).toBe("unknown")
  })
  test("Claude prompt boxes distinguish a live spinner from transcript history", () => {
    const prompt = "────────────\n❯ \n────────────\n? for shortcuts"
    expect(detectAgentScreen("claude", `✻ Searching… (2s)\n${prompt}`)).toMatchObject({
      state: "working",
      activity: "searching",
    })
    expect(detectAgentScreen("claude", `✻ Reading…\n⏺ Here is the result\n${prompt}`).state).toBe(
      "idle",
    )
    expect(
      detectAgentScreen("claude", `Do you want to proceed?\n❯ 1. Yes\n2. No\n⏺ Done\n${prompt}`)
        .state,
    ).toBe("idle")
    expect(
      detectAgentScreen(
        "claude",
        "────────────\nDo you want to proceed?\n❯ 1. Yes\n2. No\nEnter to confirm · Esc to cancel",
      ).state,
    ).toBe("blocked")
  })
  test("Gemini and OpenCode use their own control shapes", () => {
    expect(detectAgentScreen("gemini", "│ Allow execution │\n│ ❯ Yes │").state).toBe("blocked")
    expect(
      detectAgentScreen("gemini", "Thinking (esc to cancel)\n> Type your message…").state,
    ).toBe("working")
    expect(detectAgentScreen("gemini", "Thinking · esc to cancel")).toMatchObject({
      state: "working",
      activity: "thinking",
    })
    expect(detectAgentScreen("opencode", "△ Permission required").state).toBe("blocked")
    expect(detectAgentScreen("opencode", "esc dismiss · enter submit · ↑↓ select").state).toBe(
      "blocked",
    )
    expect(detectAgentScreen("opencode", "Running tests · esc to interrupt")).toMatchObject({
      state: "working",
      activity: "running",
    })
    expect(
      detectAgentScreen(
        "opencode",
        "⬝⬝⬝◆⬝⬝⬝⬝ esc interrupt                         ctrl+p commands · OpenCode 1.17.17",
      ),
    ).toMatchObject({ state: "working" })
    expect(
      detectAgentScreen(
        "opencode",
        '✱ Grep "agent" in packages\n⬝⬝⬝◆⬝⬝⬝⬝ esc interrupt     ctrl+p commands',
      ),
    ).toMatchObject({ state: "working", activity: "searching" })
    expect(
      detectAgentScreen(
        "opencode",
        "~ Preparing edit...\n⬝⬝⬝◆⬝⬝⬝⬝ esc again to interrupt     ctrl+p commands",
      ),
    ).toMatchObject({ state: "working", activity: "writing" })
    expect(
      detectAgentScreen(
        "opencode",
        "⬝⬝◆⬝⬝⬝⬝⬝ Read packages/app.tsx\n⬝⬝⬝◆⬝⬝⬝⬝ esc interrupt     ctrl+p commands",
      ),
    ).toMatchObject({ state: "working", activity: "reading" })
    expect(
      detectAgentScreen(
        "opencode",
        "⬝⬝◆⬝⬝⬝⬝⬝ Thinking: checking the layout\n⬝⬝⬝◆⬝⬝⬝⬝ esc interrupt     ctrl+p commands",
      ),
    ).toMatchObject({ state: "working", activity: "thinking" })
    expect(
      detectAgentScreen(
        "opencode",
        "~ Writing command...\n⬝⬝⬝◆⬝⬝⬝⬝ esc interrupt     ctrl+p commands",
      ),
    ).toMatchObject({ state: "working", activity: "running" })
    expect(detectAgentScreen("opencode", "> Ask anything…").state).toBe("idle")
    expect(
      detectAgentScreen("opencode", "8.3K (2%)  ctrl+p commands    • OpenCode 1.17.17").state,
    ).toBe("idle")
    expect(detectAgentScreen("opencode", "> Explain esc to interrupt").state).toBe("unknown")
    expect(detectAgentScreen("gemini", "> Explain esc to cancel").state).toBe("unknown")
    expect(detectAgentScreen("generic", "reading thinking done idle working").state).toBe("unknown")
  })
  test("transcript viewers preserve state instead of creating completion", () => {
    expect(detectAgentScreen("claude", "Showing detailed transcript\nctrl+o to toggle").skip).toBe(
      true,
    )
    expect(detectAgentScreen("codex", "↑/↓ to scroll\nhome/end to jump\nq to quit").skip).toBe(true)
  })
  test("title signals supplement screens and a plain title alone cannot create completion", () => {
    expect(detectAgentScreen("codex", "", "⠋ project").state).toBe("working")
    expect(detectAgentScreen("codex", "", "project — Action Required").state).toBe("blocked")
    expect(detectAgentScreen("codex", "", "[ ! ] Action Required | Fix login").state).toBe(
      "blocked",
    )
    expect(detectAgentScreen("codex", "", "Investigate Action Required banner").state).toBe(
      "unknown",
    )
    expect(detectAgentScreen("codex", "", "project").state).toBe("unknown")
    expect(detectAgentScreen("codex", "", "project", true).state).toBe("idle")
    expect(detectAgentScreen("claude", "", "◐ project").state).toBe("working")
    expect(detectAgentScreen("claude", "", "✳ project").state).toBe("idle")
    expect(detectAgentScreen("codex", "Allow command?", "⠋ project").state).toBe("blocked")
  })
})

describe("agent state transitions", () => {
  function observer() {
    let current: AgentObservation | undefined
    return (signal: AgentSignal, now: number, seen = false, identity = codex) => {
      current = observeAgent(current, identity, signal, seen, now)
      return current.status
    }
  }
  test("initial idle is not completion; unseen completed work is acknowledged only on viewing", () => {
    const observe = observer()
    expect(observe({ state: "idle" }, 0).state).toBe("idle")
    expect(observe({ state: "working", activity: "reading" }, 100).activity).toBe("reading")
    expect(observe({ state: "idle" }, 200).state).toBe("working")
    expect(observe({ state: "idle" }, 899).state).toBe("working")
    expect(observe({ state: "idle" }, 900).state).toBe("done")
    expect(observe({ state: "unknown" }, 9000).state).toBe("done")
    expect(observe({ state: "idle" }, 10000, true).state).toBe("idle")
    expect(observe({ state: "idle" }, 11000).state).toBe("idle")
  })
  test("visible completion is idle and a second turn can finish unseen", () => {
    const observe = observer()
    observe({ state: "working" }, 0)
    observe({ state: "idle" }, 100, true)
    expect(observe({ state: "idle" }, 800, true).state).toBe("idle")
    observe({ state: "working" }, 900)
    observe({ state: "blocked" }, 1000)
    expect(observe({ state: "blocked" }, 9000).state).toBe("blocked")
    observe({ state: "idle" }, 10000)
    expect(observe({ state: "idle" }, 10700).state).toBe("done")
  })
  test("redraws and viewer overlays cannot confirm idle; no signal eventually becomes unknown", () => {
    const observe = observer()
    observe({ state: "working" }, 0)
    observe({ state: "idle" }, 100)
    observe({ state: "unknown", skip: true }, 200)
    expect(observe({ state: "idle" }, 800).state).toBe("working")
    expect(observe({ state: "unknown" }, 900).state).toBe("working")
    expect(observe({ state: "unknown" }, 3900).state).toBe("unknown")
    expect(observe({ state: "idle" }, 4000, false, { ...codex, key: "124:codex" }).state).toBe(
      "idle",
    )
  })
})

describe("incremental OSC observations", () => {
  test("handles split Unicode, BEL and ST terminators and ignores non-title OSCs", () => {
    const output = new AgentOutput()
    const data = encoder.encode("\x1b]2;⠋ Reading\x07")
    for (const byte of data) output.write(new Uint8Array([byte]))
    expect(output.title).toBe("⠋ Reading")
    const revision = output.titleRevision
    output.write(encoder.encode("\x1b]52;c;clipboard\x07\x1b]2;⠋ Reading\x07"))
    expect(output.titleRevision).toBe(revision)
    output.write(encoder.encode("\x1b]0;Ready\x1b"))
    expect(output.title).toBe("⠋ Reading")
    output.write(encoder.encode("\\"))
    expect(output.title).toBe("Ready")
    output.clearTitle()
    expect(output.title).toBe("")
  })
  test("ignores embedded titles in control strings, oversized values and bidi controls", () => {
    const output = new AgentOutput()
    output.write(encoder.encode("\x1bP\x1b]2;Fake\x07\x1b\\"))
    expect(output.title).toBe("")
    output.write(encoder.encode(`\x1b]2;${"x".repeat(5000)}\x07\x1b]2;safe\u202e\x07`))
    expect(output.title).toBe("safe")
  })
})
