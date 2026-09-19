import { describe, expect, test } from "bun:test"
import { createRunnerPlan, type RunnerFlow } from "../packages/feature-runner/src/model/plan"
import {
  RunnerPlanRun,
  type RunnerLaunchOptions,
} from "../packages/feature-runner/src/services/plan-run"
import { createShellRunnerCommand } from "../packages/feature-runner/src/services/shell-command"

const command = (id: string, extra = {}) =>
  createShellRunnerCommand(`echo ${id}`, { id, label: id, ...extra })
async function flush() {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}
function fixture(commands: ReturnType<typeof command>[], targets: string[], flow?: RunnerFlow) {
  const launched: string[] = []
  const callbacks = new Map<string, RunnerLaunchOptions>()
  const run = new RunnerPlanRun(
    createRunnerPlan(commands, targets, flow),
    "/fixture",
    (item, options) => {
      launched.push(item.id)
      callbacks.set(item.id, options)
      options.onEvent?.("started")
      options.signal?.addEventListener("abort", () => options.onSettled?.(), { once: true })
    },
  )
  run.start()
  return { run, launched, callbacks }
}
describe("Runner dependency plans", () => {
  test("validates missing, ambiguous, duplicate and cyclic references before launching", () => {
    expect(() =>
      createRunnerPlan(
        [command("a", { dependsOn: [{ commandId: "missing", condition: "started" }] })],
        ["a"],
      ),
    ).toThrow("Referência")
    expect(() =>
      createRunnerPlan(
        [
          command("a", { dependsOn: [{ commandId: "b", condition: "started" }] }),
          command("b", { dependsOn: [{ commandId: "a", condition: "completed" }] }),
        ],
        ["a"],
      ),
    ).toThrow("Ciclo")
    expect(() =>
      createRunnerPlan(
        [command("a", { label: "same" }), command("b", { label: "same" })],
        ["same"],
      ),
    ).toThrow("Referência")
  })
  test("simple groups remain parallel; completion and health gates release only when ready", async () => {
    const { launched, callbacks, run } = fixture(
      [
        command("build"),
        command("server", { healthCheck: { type: "log", pattern: "ready", timeoutMs: 500 } }),
        command("test", {
          dependsOn: [
            { commandId: "build", condition: "completed" },
            { commandId: "server", condition: "started" },
          ],
        }),
      ],
      ["test"],
    )
    await flush()
    expect(launched).toEqual(["build", "server"])
    callbacks.get("build")!.onEvent!("success")
    await flush()
    expect(launched).toEqual(["build", "server"])
    callbacks.get("server")!.onEvent!("healthy")
    await flush()
    expect(launched).toEqual(["build", "server", "test"])
    await run.stop()
  })
  test("a failed or cancelled stage blocks all transitive dependents, including late health", async () => {
    for (const failure of ["failed", "stopped"] as const) {
      const { launched, callbacks, run } = fixture(
        [
          command("a"),
          command("b", { dependsOn: [{ commandId: "a", condition: "completed" }] }),
          command("c", { dependsOn: [{ commandId: "b", condition: "started" }] }),
        ],
        ["c"],
      )
      await flush()
      callbacks.get("a")!.onEvent!(failure)
      callbacks.get("a")!.onEvent!("healthy")
      callbacks.get("a")!.onEvent!("success")
      await flush()
      expect(launched).toEqual(["a"])
      expect(run.states.get("c")).toBe("blocked")
      await run.stop()
    }
  })
  test("flows mix parallel and sequential stages and stop owns only launched nodes", async () => {
    const flow: RunnerFlow = {
      id: "f",
      label: "dev",
      autostart: false,
      stages: [
        { commandIds: ["build", "lint"], waitFor: "completed" },
        { commandIds: ["api", "worker"], waitFor: "started" },
        { commandIds: ["test"], waitFor: "completed" },
      ],
    }
    const { launched, callbacks, run } = fixture(
      ["build", "lint", "api", "worker", "test"].map((id) => command(id)),
      [],
      flow,
    )
    await flush()
    expect(launched).toEqual(["build", "lint"])
    callbacks.get("build")!.onEvent!("success")
    await flush()
    expect(launched).toHaveLength(2)
    callbacks.get("lint")!.onEvent!("success")
    await flush()
    expect(launched).toEqual(["build", "lint", "api", "worker", "test"])
    await run.stop()
    expect([...callbacks.values()].every((options) => options.signal!.aborted)).toBe(true)
  })
  test("cancellation before the launch microtask executes no commands", async () => {
    const { launched, run } = fixture([command("a")], ["a"])
    await run.stop()
    await flush()
    expect(launched).toEqual([])
  })
})

test("a failed ancestor blocks pending descendants even across an already started service", async () => {
  const { run, launched, callbacks } = fixture(
    [
      command("a"),
      command("b", {
        dependsOn: [{ commandId: "a", condition: "started" }],
        healthCheck: { type: "log", pattern: "READY", timeoutMs: 500 },
      }),
      command("c", { dependsOn: [{ commandId: "b", condition: "started" }] }),
    ],
    ["c"],
  )
  await flush()
  expect(launched).toEqual(["a", "b"])
  callbacks.get("a")!.onEvent!("failed")
  callbacks.get("b")!.onEvent!("healthy")
  await flush()
  expect(run.states.get("c")).toBe("blocked")
  expect(launched).toEqual(["a", "b"])
  await run.stop()
})

test("stopping a selected queued command prevents later launch while independent group members continue", async () => {
  const { run, launched, callbacks } = fixture(
    [
      command("a"),
      command("b", { dependsOn: [{ commandId: "a", condition: "completed" }] }),
      command("independent"),
    ],
    ["b", "independent"],
  )
  await flush()
  await run.stopCommands(["b"])
  callbacks.get("a")!.onEvent!("success")
  await flush()
  expect(launched).toEqual(["a", "independent"])
  expect(callbacks.get("independent")!.signal!.aborted).toBe(false)
  await run.stop()
})
