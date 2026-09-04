import { pullRequestMarkdownLines } from "../src/features/git/model/pr/content"
import { movePullRequestIndex } from "../src/features/git/model/pr/navigation"
import type { PullRequestSummary } from "../src/features/git/model/pr/types"
import { parseDiffDocuments } from "../src/features/git/rendering/diff"
import { mergePullRequestItems } from "../src/features/git/services/pr-session"

type Measurement = {
  name: string
  samples: number[]
  p50: number
  p95: number
  budget: string
}

function percentile(values: number[], fraction: number) {
  const ordered = [...values].sort((left, right) => left - right)
  return ordered[Math.min(ordered.length - 1, Math.floor(ordered.length * fraction))] ?? 0
}

function measure(name: string, operation: () => void, budget: string): Measurement {
  operation()
  const samples = Array.from({ length: 7 }, () => {
    const startedAt = performance.now()
    operation()
    return performance.now() - startedAt
  })
  return {
    name,
    samples,
    p50: percentile(samples, 0.5),
    p95: percentile(samples, 0.95),
    budget,
  }
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

const results = [
  measure(
    "100 mil movimentos de seleção",
    () => {
      let index = 0
      for (let step = 0; step < 100_000; step += 1) index = movePullRequestIndex(index, 20, 1)
    },
    "interação individual p95 < 50 ms",
  ),
  measure(
    "reconciliar cache 20k + 5k PRs",
    () => {
      mergePullRequestItems(current, additions)
    },
    "operação local limitada e sem rede",
  ),
  measure(
    "interpretar Markdown de 256 KiB",
    () => {
      pullRequestMarkdownLines(markdown)
    },
    "descrição limitada a 256 KiB",
  ),
  measure(
    "interpretar diff de 2 MiB",
    () => {
      parseDiffDocuments(diff)
    },
    "diff remoto limitado a 2 MiB",
  ),
]

console.log("Benchmark Git/PR local (7 amostras após aquecimento; sem rede)")
for (const result of results) {
  console.log(
    `${result.name}: p50=${result.p50.toFixed(2)}ms p95=${result.p95.toFixed(2)}ms · ${result.budget}`,
  )
}
