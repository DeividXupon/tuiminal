import { describe, expect, test } from "bun:test"
import { measureBenchmark, percentile } from "../scripts/benchmarks/harness"

describe("benchmark harness", () => {
  test("uses nearest-rank percentiles over sorted samples", () => {
    expect(percentile([1, 2, 3, 4, 5], 0.5)).toBe(3)
    expect(percentile([1, 2, 3, 4, 5], 0.95)).toBe(5)
    expect(() => percentile([], 0.5)).toThrow()
  })

  test("warms up, prepares each run, and reports per-operation samples", async () => {
    let prepared = 0
    let ran = 0
    let verified = 0
    let cleaned = 0
    const result = await measureBenchmark(
      {
        id: "test.case",
        tool: "database",
        description: "test",
        operationsPerSample: 10,
        beforeEach: () => {
          prepared++
        },
        afterEach: () => {
          cleaned++
        },
        run: () => {
          ran++
          return 10
        },
        verify: (value) => {
          verified++
          expect(value).toBe(10)
        },
      },
      3,
      2,
    )
    expect({ prepared, ran, verified, cleaned }).toEqual({
      prepared: 5,
      ran: 5,
      verified: 5,
      cleaned: 5,
    })
    expect(result.samplesMs).toHaveLength(3)
    expect(result.minMs).toBeLessThanOrEqual(result.p50Ms)
    expect(result.p50Ms).toBeLessThanOrEqual(result.p95Ms)
    expect(result.p95Ms).toBeLessThanOrEqual(result.maxMs)
    expect(result.operationsPerSample).toBe(10)
  })

  test("fails instead of recording an invalid operation", async () => {
    let cleaned = false
    await expect(
      measureBenchmark(
        {
          id: "test.failure",
          tool: "git",
          description: "test",
          run: () => false,
          verify: (value) => {
            if (!value) throw new Error("operation failed")
          },
          afterEach: () => {
            cleaned = true
          },
        },
        2,
        0,
      ),
    ).rejects.toThrow("operation failed")
    expect(cleaned).toBe(true)
  })

  test("cleans up a partially prepared operation", async () => {
    let cleaned = false
    await expect(
      measureBenchmark(
        {
          id: "test.preparation-failure",
          tool: "terminal",
          description: "test",
          beforeEach: () => {
            throw new Error("preparation failed")
          },
          afterEach: () => {
            cleaned = true
          },
          run: () => true,
          verify: () => undefined,
        },
        1,
        0,
      ),
    ).rejects.toThrow("preparation failed")
    expect(cleaned).toBe(true)
  })
})
