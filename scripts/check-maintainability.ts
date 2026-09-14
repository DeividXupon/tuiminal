import { relative, resolve } from "node:path"

type Budget = { maxLines: number; complexity: number[] }
type Baseline = { version: 1; newFileMaxLines: number; files: Record<string, Budget> }
type Diagnostic = { message: string; location: { path: string } }
const baselinePath = new URL("../docs/quality-baseline.json", import.meta.url)
const normalizeProjectPath = (path: string) => path.replaceAll("\\", "/")
const check = Bun.spawnSync(
  [
    "node_modules/.bin/biome",
    "lint",
    "src",
    "--only=complexity/noExcessiveCognitiveComplexity",
    "--reporter=json",
    "--max-diagnostics=10000",
  ],
  { stdout: "pipe", stderr: "pipe" },
)
if (check.exitCode !== 0) {
  console.error(check.stderr.toString() || check.stdout.toString())
  process.exit(1)
}
const report = JSON.parse(check.stdout.toString()) as {
  diagnostics: Diagnostic[]
  summary: { diagnosticsNotPrinted: number }
}
if (report.summary.diagnosticsNotPrinted) throw new Error("Incomplete complexity report")
const current: Baseline = { version: 1, newFileMaxLines: 400, files: {} }
for (const discoveredFile of [...new Bun.Glob("src/**/*.{ts,tsx}").scanSync()].sort()) {
  const file = normalizeProjectPath(discoveredFile)
  const maxLines = (await Bun.file(discoveredFile).text()).trimEnd().split("\n").length
  current.files[file] = { maxLines, complexity: [] }
}
for (const diagnostic of report.diagnostics) {
  const score = Number(diagnostic.message.match(/complexity of (\d+)/)?.[1])
  const file = normalizeProjectPath(relative(process.cwd(), resolve(diagnostic.location.path)))
  const budget = current.files[file]
  if (!Number.isFinite(score) || !budget)
    throw new Error(`Unrecognized complexity diagnostic: ${file}`)
  budget.complexity.push(score)
}
for (const budget of Object.values(current.files))
  budget.complexity.sort((left, right) => right - left)

if (process.argv.includes("--write-baseline")) {
  const exceptions = Object.fromEntries(
    Object.entries(current.files).filter(
      ([, budget]) => budget.maxLines > current.newFileMaxLines || budget.complexity.length,
    ),
  )
  await Bun.write(baselinePath, `${JSON.stringify({ ...current, files: exceptions }, null, 2)}\n`)
  console.log("Baseline written. Review changes; never regenerate just to bypass a failing check.")
} else {
  const baseline = (await Bun.file(baselinePath).json()) as Baseline
  const violations: string[] = []
  for (const [file, currentBudget] of Object.entries(current.files)) {
    const allowed = baseline.files[file] ?? { maxLines: baseline.newFileMaxLines, complexity: [] }
    if (currentBudget.maxLines > Math.max(baseline.newFileMaxLines, allowed.maxLines)) {
      violations.push(
        `${file}: ${currentBudget.maxLines} lines exceed budget ${Math.max(baseline.newFileMaxLines, allowed.maxLines)}`,
      )
    }
    currentBudget.complexity.forEach((score, index) => {
      if (score > (allowed.complexity[index] ?? 20)) {
        violations.push(
          `${file}: complexity ${score} exceeds budget ${allowed.complexity[index] ?? 20}`,
        )
      }
    })
  }
  for (const violation of violations) console.error(violation)
  const debt = Object.values(current.files).reduce(
    (sum, budget) => sum + budget.complexity.length,
    0,
  )
  console.log(
    `Maintainability: ${violations.length} regressions, ${debt} existing functions above complexity 20`,
  )
  process.exitCode = violations.length ? 1 : 0
}
