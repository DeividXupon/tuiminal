import { dirname, join } from "node:path"
import { type BenchmarkCase, defineBenchmark } from "./harness"

export async function terminalRuntimeBenchmarks(root: string): Promise<BenchmarkCase[]> {
  const { EMPTY_AGENT_MESSAGE_TURN_DETAIL } = await import(
    "../../packages/feature-terminal/src/model/agent-message-history"
  )
  const { codexAppServerActivity, codexAppServerState } = await import(
    "../../packages/feature-terminal/src/services/codex-app-server"
  )
  const { CodexMessagePublisher } = await import(
    "../../packages/feature-terminal/src/services/codex-message-publisher"
  )
  const { TerminalLaunches } = await import(
    "../../packages/feature-terminal/src/services/terminal-launches"
  )
  const { stopTerminalBeforeRestart } = await import(
    "../../packages/feature-terminal/src/services/terminal-lifecycle"
  )
  const { parseTmuxPanes, TMUX_PANE_FORMAT } = await import(
    "../../packages/feature-terminal/src/model/tmux"
  )
  const { hasTmux, runTmux } = await import(
    "../../packages/feature-terminal/src/services/tmux-command"
  )
  const { startTmuxPaneMirror } = await import(
    "../../packages/feature-terminal/src/services/tmux-mirror"
  )
  type CodexObservedUserMessage =
    import("../../packages/feature-terminal/src/services/codex-message-history").CodexObservedUserMessage

  const messages: CodexObservedUserMessage[] = Array.from({ length: 100 }, (_, index) => ({
    id: `runtime-message-${index}`,
    turnId: `runtime-turn-${index}`,
    text: `Implement runtime feature ${index}`,
    sentAt: 1_780_000_000_000 + index,
    durationMs: null,
    status: "inProgress",
    hasImage: false,
    hasAudio: false,
    hasSkill: false,
    model: "gpt-benchmark",
    effort: "medium",
    serviceTier: "fast",
    ...EMPTY_AGENT_MESSAGE_TURN_DETAIL,
  }))
  const appServerEvents = [
    { method: "turn/started", params: { turn: { status: "inProgress" } } },
    { method: "item/started", params: { item: { type: "reasoning" } } },
    { method: "item/agentMessage/delta", params: {} },
    { method: "item/fileChange/patchUpdated", params: {} },
    {
      method: "thread/status/changed",
      params: { status: { type: "active", activeFlags: ["waitingOnApproval"] } },
    },
    { method: "turn/completed", params: { turn: { status: "completed" } } },
  ]

  const cases: BenchmarkCase[] = [
    defineBenchmark({
      id: "terminal.app_server_events",
      tool: "terminal",
      description: "Classify 60,000 Codex app-server activity and state events",
      operationsPerSample: 60_000,
      run: () => {
        let blocked = 0
        for (let index = 0; index < 10_000; index += 1) {
          for (const event of appServerEvents) {
            codexAppServerActivity(event)
            if (codexAppServerState(event) === "blocked") blocked += 1
          }
        }
        return blocked
      },
      verify: (result) => {
        if (result !== 10_000) throw new Error("App-server state classification changed")
      },
    }),
    defineBenchmark({
      id: "terminal.message_publish",
      tool: "terminal",
      description: "Publish and complete 100 live Codex message-history rows",
      operationsPerSample: 100,
      run: () => {
        const publisher = new CodexMessagePublisher()
        let published = 0
        const events = {
          onUserMessageHistory: (entries: readonly CodexObservedUserMessage[]) => {
            published += entries.length
          },
        }
        publisher.publish(messages, true, (message) => message, events)
        for (let index = 0; index < messages.length; index += 1) {
          publisher.updateTurnMessage(
            `runtime-turn-${index}`,
            { status: "completed", durationMs: 1_000 + index },
            (message) => message,
            events,
          )
        }
        return published
      },
      verify: (result) => {
        if (result !== 200) throw new Error("Live message updates were not published")
      },
    }),
    defineBenchmark({
      id: "terminal.launch_replacement",
      tool: "terminal",
      description: "Serialize 100 same-pane launch replacements and keep the latest generation",
      operationsPerSample: 100,
      run: async () => {
        const launches = new TerminalLaunches()
        let started = 0
        const pending = Array.from({ length: 100 }, () =>
          launches.run("pane", async ({ isCurrent }) => {
            if (!isCurrent()) throw new Error("A stale Terminal generation launched")
            started += 1
            await Promise.resolve()
          }),
        )
        await Promise.all(pending)
        const active = launches.has("pane")
        launches.dispose()
        return { started, active }
      },
      verify: ({ started, active }) => {
        if (started !== 2 || !active)
          throw new Error("Terminal launch generations were not bounded")
      },
    }),
    defineBenchmark({
      id: "terminal.restart_retirement",
      tool: "terminal",
      description: "Retire 1,000 owned Terminal handles before restart",
      operationsPerSample: 1_000,
      run: async () => {
        let stopped = 0
        const results = await Promise.all(
          Array.from({ length: 1_000 }, () =>
            stopTerminalBeforeRestart({
              handle: {
                pid: 42,
                write: () => undefined,
                resize: () => undefined,
                stop: async () => {
                  stopped += 1
                },
              },
              write: () => undefined,
              onError: () => undefined,
            }),
          ),
        )
        return { stopped, succeeded: results.filter(Boolean).length }
      },
      verify: ({ stopped, succeeded }) => {
        if (stopped !== 1_000 || succeeded !== 1_000) {
          throw new Error("Terminal retirement did not finish")
        }
      },
    }),
  ]
  if (await hasTmux()) {
    let sequence = 0
    cases.push(
      defineBenchmark({
        id: "terminal.tmux_live_mirror",
        tool: "terminal",
        description: "Create, capture, resize and retire an isolated live tmux pane mirror",
        run: async () => {
          sequence += 1
          const socket = join(
            dirname(root),
            `terminal-benchmark-tmux-${process.pid}-${sequence}.sock`,
          )
          let mirror: Awaited<ReturnType<typeof startTmuxPaneMirror>> | undefined
          let output = ""
          try {
            const paneOutput = await runTmux([
              "-S",
              socket,
              "-f",
              "/dev/null",
              "new-session",
              "-d",
              "-P",
              "-F",
              TMUX_PANE_FORMAT,
              "-s",
              "benchmark",
              "-x",
              "80",
              "-y",
              "24",
              "--",
              process.execPath,
              "-e",
              "console.log('TMUX_BENCHMARK_READY'); setInterval(() => {}, 1000)",
            ])
            const target = parseTmuxPanes(paneOutput)[0]
            if (!target) throw new Error("Isolated tmux pane was not created")
            const ready = Promise.withResolvers<void>()
            mirror = await startTmuxPaneMirror(target, {
              cwd: root,
              columns: 80,
              rows: 24,
              onData(data) {
                output += new TextDecoder().decode(data)
                if (output.includes("TMUX_BENCHMARK_READY")) ready.resolve()
              },
              onExit: () => undefined,
            })
            let timer: ReturnType<typeof setTimeout> | undefined
            try {
              await Promise.race([
                ready.promise,
                new Promise<never>((_, reject) => {
                  timer = setTimeout(
                    () => reject(new Error("Live tmux mirror output timed out")),
                    1_000,
                  )
                }),
              ])
            } finally {
              clearTimeout(timer)
            }
            mirror.resize(100, 30)
            const pid = await mirror.readAgentPid?.()
            return { output, pid }
          } finally {
            await mirror?.stop().catch(() => undefined)
            await runTmux(["-S", socket, "kill-server"]).catch(() => undefined)
          }
        },
        verify: ({ output, pid }) => {
          if (!output.includes("TMUX_BENCHMARK_READY") || !pid) {
            throw new Error("Live tmux mirror did not capture its owned pane")
          }
        },
      }),
    )
  }
  return cases
}
