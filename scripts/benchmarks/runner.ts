import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { createServer } from "node:http"
import type { AddressInfo } from "node:net"
import { join } from "node:path"
import { type BenchmarkCase, defineBenchmark } from "./harness"

export async function runnerBenchmarks(parent: string): Promise<{
  cases: BenchmarkCase[]
  cleanup: () => Promise<void>
}> {
  const root = join(parent, "runner-project")
  mkdirSync(root)
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ name: "benchmark-runner", scripts: { dev: "echo ready", test: "echo test" } }),
  )
  const { discoverRunnerCommands, resolveRunnerProjectContext, startRunnerProcess } = await import(
    "../../packages/feature-runner/src/services/runner"
  )
  const { createRunnerPlan, runnerPlanTransitions } = await import(
    "../../packages/feature-runner/src/model/plan"
  )
  const { filterRunnerLogs, buildRunnerLogDocument } = await import(
    "../../packages/feature-runner/src/rendering/log-document"
  )
  const { RunnerLogBuffer } = await import("../../packages/feature-runner/src/model/log-buffer")
  const { parseRunnerYaml } = await import(
    "../../packages/feature-runner/src/model/configuration-yaml"
  )
  const { waitForRunnerHealthCheck } = await import(
    "../../packages/feature-runner/src/services/health"
  )
  const { RunnerPlanRun } = await import("../../packages/feature-runner/src/services/plan-run")
  const { discoverRunnerListeningPorts, parseListeningPorts } = await import(
    "../../packages/feature-runner/src/services/ports"
  )
  const { exportRunnerLog } = await import(
    "../../packages/feature-runner/src/storage/runner-config"
  )
  const { loadRunnerHistory, saveRunnerHistoryEntry } = await import(
    "../../packages/feature-runner/src/storage/runner-settings"
  )
  type RunnerCommand = import("../../packages/feature-runner/src/model/types").RunnerCommand
  type RunnerProcessHandle =
    import("../../packages/feature-runner/src/model/types").RunnerProcessHandle
  type RunnerPersistedExecution =
    import("../../packages/feature-runner/src/model/config").RunnerPersistedExecution
  const commands: RunnerCommand[] = Array.from({ length: 40 }, (_, index) => ({
    id: `command-${index}`,
    label: `Command ${index}`,
    category: "custom",
    description: "Benchmark command",
    program: process.execPath,
    args: [],
    displayCommand: `command-${index}`,
    ...(index
      ? { dependsOn: [{ commandId: `command-${index - 1}`, condition: "completed" }] }
      : {}),
  }))
  const plan = createRunnerPlan(commands, ["command-39"])
  const flowPlan = createRunnerPlan(commands.slice(0, 3), ["command-2"], {
    id: "benchmark-flow",
    label: "Benchmark flow",
    autostart: false,
    stages: [
      { commandIds: ["command-0"], waitFor: "completed" },
      { commandIds: ["command-1"], waitFor: "completed" },
      { commandIds: ["command-2"], waitFor: "completed" },
    ],
  })
  const processFlowPlan = createRunnerPlan(
    commands.slice(0, 3).map((command, index) => ({
      ...command,
      args: ["-e", `console.log('stage ${index}')`],
    })),
    ["command-2"],
    {
      id: "benchmark-process-flow",
      label: "Benchmark process flow",
      autostart: false,
      stages: [
        { commandIds: ["command-0"], waitFor: "completed" },
        { commandIds: ["command-1"], waitFor: "completed" },
        { commandIds: ["command-2"], waitFor: "completed" },
      ],
    },
  )
  const firstCommand = commands[0]
  if (!firstCommand) throw new Error("Missing Runner fixture command")
  const restartPlan = createRunnerPlan(
    [{ ...firstCommand, args: ["-e", "console.log('READY');setInterval(()=>{},1000)"] }],
    [firstCommand.id],
  )
  const restartHandles = new Set<RunnerProcessHandle>()
  const startRestartableRun = () => {
    const ready = Promise.withResolvers<void>()
    const run = new RunnerPlanRun(restartPlan, root, (command, options) => {
      const handle = startRunnerProcess(root, command, {
        onLine: (line) => {
          if (line === "READY") {
            options.onEvent?.("started")
            ready.resolve()
          }
        },
        onExit: (result) => {
          restartHandles.delete(handle)
          options.onEvent?.(result.code === 0 ? "success" : "failed")
          options.onSettled?.()
        },
      })
      restartHandles.add(handle)
      options.signal?.addEventListener("abort", () => void handle.stop(), { once: true })
    })
    run.start()
    return { run, ready: ready.promise }
  }
  const waitRestartReady = async (ready: Promise<void>) => {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        ready,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error("Runner restart fixture timed out")), 5_000)
        }),
      ])
    } finally {
      clearTimeout(timer)
    }
  }
  let pendingRestart: ReturnType<typeof startRestartableRun> | null = null
  const states = new Map(plan.map((node) => [node.command.id, "pending" as const]))
  const logs = Array.from({ length: 2_000 }, (_, index) => ({
    id: index,
    text: `Build line ${index}: ${index % 10 ? "ready" : "error"}`,
    stream: index % 10 ? ("stdout" as const) : ("stderr" as const),
    at: 1_780_000_000_000 + index,
  }))
  const historyPath = join(parent, "runner-history.json")
  const historyEntry: RunnerPersistedExecution = {
    id: "benchmark-history",
    commandId: firstCommand.id,
    label: firstCommand.label,
    displayCommand: firstCommand.displayCommand,
    projectRoot: root,
    projectName: "runner-project",
    status: "success",
    pid: null,
    startedAt: 1_780_000_000_000,
    endedAt: 1_780_000_000_100,
    exitCode: 0,
    logs: [],
  }
  const persistedLogs = logs.slice(0, 1_200).map(({ text, stream, at }) => ({
    text,
    stream,
    at,
  }))
  const palette = {
    canvas: "#101010",
    danger: "#ff3333",
    runner: "#33aaff",
    success: "#33ff88",
    text: "#dddddd",
    warning: "#ffaa33",
  }
  const yaml = `commands:\n${Array.from(
    { length: 40 },
    (_, index) => `  task-${index}:\n    command: echo task-${index}\n    label: Task ${index}\n`,
  ).join("")}flows:\n  all:\n    stages:\n      - commandIds: [task-0, task-1]\n`
  const portOutput = Array.from(
    { length: 500 },
    (_, index) => `p${1_000 + index}\ncnode\nn127.0.0.1:${3_000 + index}\n`,
  ).join("")
  let pendingStop: RunnerProcessHandle | null = null
  let listeningHandle: RunnerProcessHandle | null = null
  let listeningPort: number | null = null
  const server = createServer((request, response) => {
    if (request.url === "/unhealthy") {
      response.statusCode = 503
      response.end("unhealthy")
      return
    }
    if (request.url === "/slow") {
      setTimeout(() => {
        if (!response.destroyed) response.end("ready")
      }, 100)
      return
    }
    response.end("ready")
  })
  server.listen(0, "127.0.0.1")
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve)
    server.once("error", reject)
  })
  const port = (server.address() as AddressInfo).port
  const cleanup = async () => {
    await listeningHandle?.stop()
    await pendingRestart?.run.stop()
    await Promise.all([...restartHandles].map((handle) => handle.stop()))
    await pendingStop?.stop()
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) =>
      server.close((error) =>
        error && (error as NodeJS.ErrnoException).code !== "ERR_SERVER_NOT_RUNNING"
          ? reject(error)
          : resolve(),
      ),
    )
  }
  const cases: BenchmarkCase[] = [
    defineBenchmark({
      id: "runner.discovery",
      tool: "runner",
      description: "Discover project commands from package.json",
      run: () => discoverRunnerCommands(root),
      verify: (result) => {
        if (result.length < 2) throw new Error("Commands missing")
      },
    }),
    defineBenchmark({
      id: "runner.context",
      tool: "runner",
      description: "Resolve project, commands and profiles",
      run: () => resolveRunnerProjectContext(root),
      verify: (result) => {
        if (!result?.commands.length) throw new Error("Project context missing")
      },
    }),
    defineBenchmark({
      id: "runner.plan",
      tool: "runner",
      description: "Build 40-command dependency plan",
      run: () => createRunnerPlan(commands, ["command-39"]),
      verify: (result) => {
        if (result.length !== 40) throw new Error("Incomplete plan")
      },
    }),
    defineBenchmark({
      id: "runner.transitions",
      tool: "runner",
      description: "Calculate ready/blocked transitions for 40 commands",
      run: () => runnerPlanTransitions(plan, states),
      verify: (result) => {
        if (result.ready[0] !== "command-0") throw new Error("Wrong ready command")
      },
    }),
    defineBenchmark({
      id: "runner.flow_schedule",
      tool: "runner",
      description: "Schedule and settle a three-stage Runner flow",
      run: async () => {
        const done = Promise.withResolvers<void>()
        const flowRun = new RunnerPlanRun(
          flowPlan,
          root,
          (_command, options) => {
            queueMicrotask(() => {
              options.onEvent?.("started")
              options.onEvent?.("success")
              options.onSettled?.()
            })
          },
          () => {
            if (!flowRun.active) done.resolve()
          },
        )
        flowRun.start()
        let timer: ReturnType<typeof setTimeout> | undefined
        try {
          await Promise.race([
            done.promise,
            new Promise<never>((_, reject) => {
              timer = setTimeout(() => reject(new Error("Runner flow timed out")), 5_000)
            }),
          ])
          return [...flowRun.states.values()]
        } finally {
          clearTimeout(timer)
          await flowRun.stop()
        }
      },
      verify: (result) => {
        if (result.length !== 3 || result.some((state) => state !== "success")) {
          throw new Error("Runner flow did not settle")
        }
      },
    }),
    defineBenchmark({
      id: "runner.flow_processes",
      tool: "runner",
      description: "Launch and settle three dependent process-backed flow stages",
      run: async () => {
        const done = Promise.withResolvers<void>()
        const handles = new Set<RunnerProcessHandle>()
        let launched = 0
        const flowRun = new RunnerPlanRun(
          processFlowPlan,
          root,
          (command, options) => {
            const handle = startRunnerProcess(root, command, {
              onLine: () => undefined,
              onExit: (result) => {
                handles.delete(handle)
                options.onEvent?.(result.code === 0 ? "success" : "failed")
                options.onSettled?.()
              },
            })
            handles.add(handle)
            launched += 1
            options.signal?.addEventListener("abort", () => void handle.stop(), { once: true })
            options.onEvent?.("started")
          },
          () => {
            if (!flowRun.active) done.resolve()
          },
        )
        flowRun.start()
        let timer: ReturnType<typeof setTimeout> | undefined
        try {
          await Promise.race([
            done.promise,
            new Promise<never>((_, reject) => {
              timer = setTimeout(() => reject(new Error("Runner process flow timed out")), 5_000)
            }),
          ])
          return { states: [...flowRun.states.values()], launched }
        } finally {
          clearTimeout(timer)
          await flowRun.stop()
          await Promise.all([...handles].map((handle) => handle.stop()))
        }
      },
      verify: (result) => {
        if (result.launched !== 3 || result.states.some((state) => state !== "success")) {
          throw new Error("Runner process flow did not settle")
        }
      },
    }),
    defineBenchmark({
      id: "runner.flow_restart",
      tool: "runner",
      description: "Stop one owned process plan and wait for its replacement",
      beforeEach: async () => {
        await pendingRestart?.run.stop()
        pendingRestart = startRestartableRun()
        await waitRestartReady(pendingRestart.ready)
      },
      run: async () => {
        const current = pendingRestart
        if (!current) throw new Error("Missing Runner restart fixture")
        await current.run.stop()
        const next = startRestartableRun()
        pendingRestart = next
        await waitRestartReady(next.ready)
        return {
          previous: current.run.states.get(firstCommand.id),
          replacement: next.run.states.get(firstCommand.id),
        }
      },
      verify: (result) => {
        if (result.previous !== "stopped" || result.replacement !== "started") {
          throw new Error("Runner process plan did not restart")
        }
      },
    }),
    defineBenchmark({
      id: "runner.log_filter",
      tool: "runner",
      description: "Filter 2,000 log lines by stream and text",
      run: () => filterRunnerLogs(logs, "stderr", "error"),
      verify: (result) => {
        if (result.length !== 200) throw new Error("Wrong log filter")
      },
    }),
    defineBenchmark({
      id: "runner.log_render",
      tool: "runner",
      description: "Render 2,000 colored log lines",
      run: () => buildRunnerLogDocument(logs, { width: 100, showTimestamps: false, palette }),
      verify: (result) => {
        if (!result) throw new Error("Missing log document")
      },
    }),
    defineBenchmark({
      id: "runner.log_buffer",
      tool: "runner",
      description: "Append 10,000 log entries and snapshot the bounded buffer",
      run: () => {
        const buffer = new RunnerLogBuffer()
        for (let index = 0; index < 10_000; index += 1) {
          const log = logs[index % logs.length]
          if (!log) throw new Error("Missing Runner log fixture")
          buffer.append(log)
        }
        return buffer.snapshot()
      },
      verify: (result) => {
        if (result.length !== 1_200) throw new Error("Runner log buffer exceeded its bound")
      },
    }),
    defineBenchmark({
      id: "runner.log_export",
      tool: "runner",
      description: "Write 2,000 process log lines to the disposable project",
      run: () => exportRunnerLog(root, "benchmark", logs.map((entry) => entry.text).join("\n")),
      verify: (result) => {
        if (!existsSync(result)) throw new Error("Runner log export failed")
      },
    }),
    defineBenchmark({
      id: "runner.history_metadata",
      tool: "runner",
      description: "Persist and reload one completed run without process logs",
      run: () => {
        saveRunnerHistoryEntry(historyEntry, historyPath)
        return loadRunnerHistory(historyPath)
      },
      verify: (result) => {
        if (result[0]?.id !== historyEntry.id || result[0].logs.length !== 0) {
          throw new Error("Runner metadata history was not restored")
        }
      },
    }),
    defineBenchmark({
      id: "runner.history_logs",
      tool: "runner",
      description: "Persist and reload a completed run with 1,200 opted-in logs",
      run: () => {
        saveRunnerHistoryEntry(
          { ...historyEntry, id: "benchmark-history-with-logs", logs: persistedLogs },
          historyPath,
        )
        return loadRunnerHistory(historyPath)
      },
      verify: (result) => {
        if (result[0]?.id !== "benchmark-history-with-logs" || result[0].logs.length !== 1_200) {
          throw new Error("Runner process logs were not restored")
        }
      },
    }),
    defineBenchmark({
      id: "runner.ports_parse",
      tool: "runner",
      description: "Parse 500 listening ports from lsof field output",
      run: () => parseListeningPorts(portOutput, 1_000),
      verify: (result) => {
        if (result.length !== 500) throw new Error("Runner port parse failed")
      },
    }),
    defineBenchmark({
      id: "runner.yaml_parse",
      tool: "runner",
      description: "Parse and validate a 40-command Runner YAML configuration",
      run: () => parseRunnerYaml(yaml),
      verify: (result) => {
        if (result.commands.length !== 40 || result.flows.length !== 1) {
          throw new Error("Runner YAML parse lost definitions")
        }
      },
    }),
    defineBenchmark({
      id: "runner.health_port",
      tool: "runner",
      description: "Probe a healthy local TCP port",
      run: () =>
        waitForRunnerHealthCheck({ type: "port", host: "127.0.0.1", port, timeoutMs: 1_000 }),
      verify: (result) => {
        if (!result) throw new Error("Runner port probe failed")
      },
    }),
    defineBenchmark({
      id: "runner.health_http",
      tool: "runner",
      description: "Probe a healthy local HTTP endpoint",
      run: () =>
        waitForRunnerHealthCheck({
          type: "http",
          url: `http://127.0.0.1:${port}`,
          timeoutMs: 1_000,
        }),
      verify: (result) => {
        if (!result) throw new Error("Runner HTTP probe failed")
      },
    }),
    defineBenchmark({
      id: "runner.health_unhealthy",
      tool: "runner",
      description: "Expire an unhealthy HTTP probe at its deadline",
      run: () =>
        waitForRunnerHealthCheck({
          type: "http",
          url: `http://127.0.0.1:${port}/unhealthy`,
          timeoutMs: 10,
        }),
      verify: (result) => {
        if (result) throw new Error("Unhealthy Runner endpoint passed")
      },
    }),
    defineBenchmark({
      id: "runner.health_cancel",
      tool: "runner",
      description: "Cancel a pending HTTP health probe",
      run: async () => {
        const controller = new AbortController()
        const pending = waitForRunnerHealthCheck(
          { type: "http", url: `http://127.0.0.1:${port}/slow`, timeoutMs: 1_000 },
          controller.signal,
        )
        controller.abort()
        return pending
      },
      verify: (result) => {
        if (result) throw new Error("Cancelled Runner health probe passed")
      },
    }),
    defineBenchmark({
      id: "runner.process",
      tool: "runner",
      description: "Launch a disposable command and observe exit",
      run: async () => {
        let complete!: (value: number | null) => void
        const exited = new Promise<number | null>((resolve) => {
          complete = resolve
        })
        const handle = startRunnerProcess(
          root,
          { ...firstCommand, args: ["-e", "console.log('ready')"] },
          { onLine: () => undefined, onExit: (result) => complete(result.code) },
        )
        let timer: ReturnType<typeof setTimeout> | undefined
        try {
          return await Promise.race([
            exited,
            new Promise<never>((_, reject) => {
              timer = setTimeout(() => reject(new Error("Runner process timed out")), 5_000)
            }),
          ])
        } finally {
          clearTimeout(timer)
          await handle.stop()
        }
      },
      verify: (result) => {
        if (result !== 0) throw new Error(`Runner process exited ${result}`)
      },
    }),
    defineBenchmark({
      id: "runner.pty_process",
      tool: "runner",
      description: "Launch a disposable Runner PTY and observe its output and exit",
      run: async () => {
        const exited = Promise.withResolvers<number | null>()
        let output = ""
        const handle = startRunnerProcess(
          root,
          {
            ...firstCommand,
            interactive: true,
            args: ["-e", "process.stdout.write('PTY_READY\\n')"],
          },
          {
            onLine: (line) => {
              output += line
            },
            onExit: (result) => exited.resolve(result.code),
          },
        )
        let timer: ReturnType<typeof setTimeout> | undefined
        try {
          const code = await Promise.race([
            exited.promise,
            new Promise<never>((_, reject) => {
              timer = setTimeout(() => reject(new Error("Runner PTY timed out")), 5_000)
            }),
          ])
          return { code, output }
        } finally {
          clearTimeout(timer)
          await handle.stop()
        }
      },
      verify: (result) => {
        if (result.code !== 0 || !result.output.includes("PTY_READY")) {
          throw new Error("Runner PTY did not complete")
        }
      },
    }),
    defineBenchmark({
      id: "runner.process_stop",
      tool: "runner",
      description: "Stop an already running disposable process",
      beforeEach: async () => {
        const ready = Promise.withResolvers<void>()
        pendingStop = startRunnerProcess(
          root,
          { ...firstCommand, args: ["-e", "console.log('READY');setInterval(()=>{},1000)"] },
          {
            onLine: (line) => {
              if (line === "READY") ready.resolve()
            },
            onExit: () => undefined,
          },
        )
        let timer: ReturnType<typeof setTimeout> | undefined
        try {
          await Promise.race([
            ready.promise,
            new Promise<never>((_, reject) => {
              timer = setTimeout(
                () => reject(new Error("Runner stop fixture did not become ready")),
                5_000,
              )
            }),
          ])
        } finally {
          clearTimeout(timer)
        }
      },
      run: async () => {
        const handle = pendingStop
        if (!handle) throw new Error("Missing owned Runner process")
        await handle.stop()
        pendingStop = null
        return true
      },
      verify: (result) => {
        if (!result) throw new Error("Runner process did not stop")
      },
    }),
  ]
  if (process.platform !== "win32" && !spawnSync("lsof", ["-v"], { stdio: "ignore" }).error) {
    cases.push(
      defineBenchmark({
        id: "runner.ports_discovery",
        tool: "runner",
        description: "Discover one owned listening process through a live lsof probe",
        beforeEach: async () => {
          if (listeningHandle && listeningPort) return
          await listeningHandle?.stop()
          const ready = Promise.withResolvers<number>()
          const handle = startRunnerProcess(
            root,
            {
              ...firstCommand,
              args: [
                "-e",
                'const server=require("node:http").createServer((_request,response)=>response.end("ready"));server.listen(0,"127.0.0.1",()=>console.log("PORT:"+server.address().port))',
              ],
            },
            {
              onLine: (line) => {
                if (line.startsWith("PORT:")) ready.resolve(Number(line.slice(5)))
              },
              onExit: () => {
                if (listeningHandle === handle) listeningPort = null
              },
            },
          )
          listeningHandle = handle
          let timer: ReturnType<typeof setTimeout> | undefined
          try {
            listeningPort = await Promise.race([
              ready.promise,
              new Promise<never>((_, reject) => {
                timer = setTimeout(() => reject(new Error("Runner port fixture timed out")), 5_000)
              }),
            ])
          } finally {
            clearTimeout(timer)
          }
        },
        run: async () => {
          const pid = listeningHandle?.pid
          const port = listeningPort
          if (!pid || !port) throw new Error("Missing owned Runner listening process")
          return { pid, port, discovered: await discoverRunnerListeningPorts([pid]) }
        },
        verify: ({ pid, port, discovered }) => {
          if (
            !discovered.some(
              (entry) => entry.groupId === pid && entry.pid === pid && entry.port === port,
            )
          ) {
            throw new Error("Runner did not discover its owned listening port")
          }
        },
      }),
    )
  }
  return { cases, cleanup }
}
