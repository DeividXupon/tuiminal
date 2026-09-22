export type BenchmarkCase<T = unknown> = {
  id: string
  tool: "database" | "git" | "runner" | "http" | "terminal"
  description: string
  operationsPerSample?: number
  beforeEach?: () => void | Promise<void>
  run: () => T | Promise<T>
  verify: (result: T) => void
}

export type BenchmarkResult = {
  id: string
  tool: BenchmarkCase["tool"]
  description: string
  operationsPerSample: number
  samplesMs: number[]
  minMs: number
  p50Ms: number
  p95Ms: number
  maxMs: number
  meanMs: number
}

export function defineBenchmark<T>(benchmark: BenchmarkCase<T>): BenchmarkCase {
  return benchmark as BenchmarkCase
}

export function percentile(sorted: readonly number[], fraction: number) {
  if (!sorted.length) throw new Error("A percentile needs at least one sample")
  const rank = Math.ceil(fraction * sorted.length) - 1
  const value = sorted[Math.max(0, Math.min(sorted.length - 1, rank))]
  if (value === undefined) throw new Error("Missing percentile sample")
  return value
}

export async function measureBenchmark<T>(
  benchmark: BenchmarkCase<T>,
  samples: number,
  warmup: number,
): Promise<BenchmarkResult> {
  if (!Number.isSafeInteger(samples) || samples < 1) throw new Error("Invalid sample count")
  if (!Number.isSafeInteger(warmup) || warmup < 0) throw new Error("Invalid warmup count")
  const count = benchmark.operationsPerSample ?? 1
  if (!Number.isSafeInteger(count) || count < 1) throw new Error("Invalid operation count")
  for (let index = 0; index < warmup; index += 1) {
    await benchmark.beforeEach?.()
    benchmark.verify(await benchmark.run())
  }
  const samplesMs: number[] = []
  for (let index = 0; index < samples; index += 1) {
    await benchmark.beforeEach?.()
    const started = performance.now()
    const result = await benchmark.run()
    const elapsed = performance.now() - started
    benchmark.verify(result)
    samplesMs.push(elapsed / count)
  }
  const ordered = [...samplesMs].sort((left, right) => left - right)
  return {
    id: benchmark.id,
    tool: benchmark.tool,
    description: benchmark.description,
    operationsPerSample: count,
    samplesMs,
    minMs: percentile(ordered, 0),
    p50Ms: percentile(ordered, 0.5),
    p95Ms: percentile(ordered, 0.95),
    maxMs: percentile(ordered, 1),
    meanMs: samplesMs.reduce((sum, value) => sum + value, 0) / samplesMs.length,
  }
}
