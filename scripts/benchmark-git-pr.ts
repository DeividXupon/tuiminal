import { writeFileSync } from "node:fs"
import { pullRequestMarkdownLines } from "../packages/feature-git/src/model/pr/content"
import { movePullRequestIndex } from "../packages/feature-git/src/model/pr/navigation"
import type { PullRequestSummary } from "../packages/feature-git/src/model/pr/types"
import { parseDiffDocuments } from "../packages/feature-git/src/rendering/diff"
import { mergePullRequestItems } from "../packages/feature-git/src/services/pr-session"
import { defineBenchmark, measureBenchmark } from "./benchmarks/harness"

function benchmarkCounts() {
  const samples = Number(process.env.BENCHMARK_SAMPLES ?? 20)
  const warmup = Number(process.env.BENCHMARK_WARMUP ?? 3)
  if (!Number.isSafeInteger(samples) || samples < 1) throw new Error("Invalid BENCHMARK_SAMPLES")
  if (!Number.isSafeInteger(warmup) || warmup < 0) throw new Error("Invalid BENCHMARK_WARMUP")
  return { samples, warmup }
}

function fixture(index: number): PullRequestSummary {
  return {
    identity: {
      host: "github.com",
      nodeId: `PR_benchmark_${index}`,
      owner: `team-${index % 12}`,
      repository: `repo-${index % 120}`,
      number: index + 1,
      url: `https://github.com/team/repo/pull/${index + 1}`,
    },
    title: `Mudança Unicode 日本語 ${index}`,
    state: "open",
    author: { login: `user-${index % 40}` },
    assignees: [],
    baseBranch: "main",
    headBranch: `feature/${index}`,
    headSha: index.toString(16).padStart(40, "0"),
    commentCount: index % 10,
    reviewState: "review-required",
    checkState: "pending",
    labels: [{ name: "benchmark" }],
    additions: index % 500,
    deletions: index % 100,
    changedFiles: (index % 20) + 1,
    updatedAt: new Date(1_780_000_000_000 - index * 1_000).toISOString(),
    isFork: false,
  }
}

function largeDiff(targetBytes = 2 * 1024 * 1024) {
  const blocks: string[] = []
  let bytes = 0
  let index = 0
  while (bytes < targetBytes) {
    const block = `diff --git a/src/file-${index}.ts b/src/file-${index}.ts
--- a/src/file-${index}.ts
+++ b/src/file-${index}.ts
@@ -1,2 +1,2 @@
-const value = "antes-${index}"
+const value = "depois-${index}"
 export { value }
`
    blocks.push(block)
    bytes += Buffer.byteLength(block)
    index += 1
  }
  return blocks.join("")
}

const current = Array.from({ length: 20_000 }, (_, index) => fixture(index))
const additions = Array.from({ length: 5_000 }, (_, index) => fixture(index + 17_500))
const markdown =
  `${"# Título\n- item com **ênfase** e [link](https://example.test)\n".repeat(4_500)}`.slice(
    0,
    256 * 1024,
  )
const diff = largeDiff()

const cases = [
  defineBenchmark({
    id: "git.pr_large_selection",
    tool: "git",
    description: "Move PR selection through 100,000 bounded rows",
    operationsPerSample: 100_000,
    run: () => {
      let index = 0
      for (let step = 0; step < 100_000; step += 1) index = movePullRequestIndex(index, 20, 1)
      return index
    },
    verify: (index) => {
      if (index !== 19) throw new Error("Large PR selection did not remain bounded")
    },
  }),
  defineBenchmark({
    id: "git.pr_large_merge",
    tool: "git",
    description: "Merge 5,000 PR updates into a 20,000-item cache",
    run: () => mergePullRequestItems(current, additions),
    verify: (items) => {
      if (items.length !== 22_500) throw new Error("Large PR merge returned the wrong item count")
    },
  }),
  defineBenchmark({
    id: "git.pr_large_markdown",
    tool: "git",
    description: "Parse a bounded 256 KiB PR description",
    run: () => pullRequestMarkdownLines(markdown),
    verify: (lines) => {
      if (!lines.length) throw new Error("Large PR Markdown returned no lines")
    },
  }),
  defineBenchmark({
    id: "git.pr_large_diff",
    tool: "git",
    description: "Parse a bounded 2 MiB remote PR diff",
    run: () => parseDiffDocuments(diff),
    verify: (documents) => {
      if (!documents.length) throw new Error("Large PR diff returned no documents")
    },
  }),
]

const { samples, warmup } = benchmarkCounts()
const results = []
for (const benchmark of cases) {
  const result = await measureBenchmark(benchmark, samples, warmup)
  results.push(result)
  console.log(
    `${result.id.padEnd(28)} p50 ${result.p50Ms.toFixed(6)} ms  p95 ${result.p95Ms.toFixed(6)} ms`,
  )
}
if (process.env.BENCHMARK_OUTPUT) {
  writeFileSync(
    process.env.BENCHMARK_OUTPUT,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        createdAt: new Date().toISOString(),
        runtime: { bun: Bun.version, platform: process.platform, arch: process.arch },
        configuration: { samples, warmup },
        results,
      },
      null,
      2,
    )}\n`,
  )
}
