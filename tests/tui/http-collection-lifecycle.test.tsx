import "./setup"
import { afterEach, describe, expect, spyOn, test } from "bun:test"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act, useState } from "react"
import { useHttpCollectionRunner } from "../../src/features/http/hooks/use-http-collection-runner"
import { createScratchRequest } from "../../src/features/http/model/workspace"
import * as runner from "../../src/features/http/services/collection-runner"

let tui: TestRendererSetup | undefined
const cleanups: Array<() => void> = []
afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
  for (const cleanup of cleanups.splice(0).reverse()) cleanup()
})

function fixture() {
  const requests: Array<{
    signal: AbortSignal | undefined
    selector: string | undefined
    finish(name: string): void
    fail(error: Error): void
  }> = []
  const items = ["first", "second"].map((id) => ({
    filePath: "fixture.http",
    request: { ...createScratchRequest(id, "http://fixture.test/data"), name: "Same name" },
  }))
  const read = spyOn(runner, "runHttpCollectionCase").mockImplementation(
    ({ signal, selector }) =>
      new Promise((resolve, reject) => {
        requests.push({
          signal,
          selector,
          finish: (name) => resolve({ name, items: [] }),
          fail: reject,
        })
      }),
  )
  cleanups.push(() => read.mockRestore())
  let api: ReturnType<typeof useHttpCollectionRunner>
  let updateRoot: (root: string) => void
  function Harness() {
    const [root, setRoot] = useState("/fixture-one")
    updateRoot = setRoot
    api = useHttpCollectionRunner({
      root,
      items,
      variablesForRequest: () => new Map(),
      environmentName: null,
      isInsecureTlsApproved: () => false,
      approveInsecureTls: () => {},
      authorizeRedirect: () => false,
    })
    return (
      <text
        content={`${api.status}:${api.cases.map((item) => item.name).join(",")}:${api.error}`}
      />
    )
  }
  return {
    Harness,
    requests,
    get api() {
      return api
    },
    changeRoot: (root: string) => act(() => updateRoot(root)),
  }
}

describe("HTTP collection execution ownership", () => {
  test("unmount during dataset loading never starts its queued HTTP cases", async () => {
    const h = fixture()
    let finishDataset: (() => void) | undefined
    const dataset = spyOn(runner, "loadHttpProjectRunnerDataset").mockImplementation(
      () =>
        new Promise((resolve) => {
          finishDataset = () => resolve([{ name: "queued", values: {} }])
        }),
    )
    cleanups.push(() => dataset.mockRestore())
    tui = await testRender(<h.Harness />, { width: 70, height: 6 })
    act(() => h.api.setDatasetPath("fixture.json"))
    let pending: Promise<void> | undefined
    act(() => {
      pending = h.api.run()
    })
    expect(dataset).toHaveBeenCalledTimes(1)
    act(() => tui?.renderer.destroy())
    tui = undefined
    await act(async () => {
      finishDataset?.()
      await pending
    })
    expect(h.requests).toHaveLength(0)
  })
  test("rapid run/cancel activation never dispatches duplicate executions", async () => {
    const h = fixture()
    tui = await testRender(<h.Harness />, { width: 70, height: 6 })
    let pending: Promise<void>[] = []
    act(() => {
      pending = Array.from({ length: 3 }, () => h.api.run())
    })
    expect(h.requests).toHaveLength(1)
    expect(h.requests[0]?.signal?.aborted).toBe(true)
    await act(async () => {
      h.requests[0]?.finish("cancelled")
      await Promise.all(pending)
    })
    expect(h.api.status).toBe("cancelled")
  })

  test("unmount cancels the run and retained callbacks cannot restart it", async () => {
    const h = fixture()
    tui = await testRender(<h.Harness />, { width: 70, height: 6 })
    const retained = h.api.run
    let pending: Promise<void> | undefined
    act(() => {
      pending = retained()
    })
    act(() => tui?.renderer.destroy())
    tui = undefined
    expect(h.requests[0]?.signal?.aborted).toBe(true)
    await act(async () => {
      h.requests[0]?.finish("obsolete")
      await pending
      await retained()
    })
    expect(h.requests).toHaveLength(1)
  })

  test.each(["open", "cycleTarget"] as const)(
    "%s retires an old run before a replacement",
    async (action) => {
      const h = fixture()
      tui = await testRender(<h.Harness />, { width: 70, height: 6 })
      let old: Promise<void> | undefined
      let replacement: Promise<void> | undefined
      act(() => {
        old = h.api.run()
      })
      act(() => h.api[action]())
      expect(h.requests[0]?.signal?.aborted).toBe(true)
      act(() => {
        replacement = h.api.run()
      })
      await act(async () => {
        h.requests[0]?.finish("obsolete")
        await old
      })
      expect(h.api.status).toBe("running")
      expect(h.api.cases).toEqual([])
      await act(async () => {
        h.requests[1]?.finish("current")
        await replacement
      })
      expect(h.api.cases.map((item) => item.name)).toEqual(["current"])
      expect(h.api.status).toBe("complete")
    },
  )

  test("scope changes abort old work and ignore its later error", async () => {
    const h = fixture()
    tui = await testRender(<h.Harness />, { width: 70, height: 6 })
    const retained = h.api.run
    let old: Promise<void> | undefined
    let current: Promise<void> | undefined
    act(() => {
      old = retained()
    })
    h.changeRoot("/fixture-two")
    expect(h.requests[0]?.signal?.aborted).toBe(true)
    act(() => {
      current = h.api.run()
    })
    await act(async () => {
      h.requests[0]?.fail(new Error("obsolete"))
      await old
      await retained()
    })
    expect(h.api.status).toBe("running")
    expect(h.api.error).toBe("")
    expect(h.requests).toHaveLength(2)
    await act(async () => {
      h.requests[1]?.finish("current")
      await current
    })
    expect(h.api.status).toBe("complete")
  })

  test("selecting requests with equal names passes the exact selected ID", async () => {
    const h = fixture()
    tui = await testRender(<h.Harness />, { width: 70, height: 6 })
    act(() => h.api.cycleTarget())
    act(() => h.api.cycleTarget())
    expect(h.api.targetId).toBe("second")
    let pending: Promise<void> | undefined
    act(() => {
      pending = h.api.run()
    })
    expect(h.requests[0]?.selector).toBe("second")
    await act(async () => {
      h.requests[0]?.finish("second")
      await pending
    })
  })
})
