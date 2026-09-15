const check = Bun.spawnSync(
  [
    process.execPath,
    "node_modules/dependency-cruiser/bin/dependency-cruise.mjs",
    "apps",
    "packages",
    "--config",
    ".dependency-cruiser.cjs",
    "--output-type",
    "json",
  ],
  { stdout: "pipe", stderr: "pipe" },
)

type CruiseReport = {
  modules: Array<{ source: string }>
  summary: {
    violations: Array<{ from: string; to: string; rule: { name: string } }>
    totalDependenciesCruised: number
  }
}
const output = check.stdout.toString()
if (!output.startsWith("{")) {
  console.error(check.stderr.toString() || output || "Dependency analysis produced no report")
  process.exit(1)
}
const report = JSON.parse(output) as CruiseReport
const normalizeReportPath = (path: string) => path.replaceAll("\\", "/")
const sources = [
  ...new Bun.Glob("apps/cli/**/*.ts").scanSync(),
  ...new Bun.Glob("apps/cli/**/*.tsx").scanSync(),
  ...new Bun.Glob("packages/*/src/**/*.{ts,tsx}").scanSync(),
]
  .map(normalizeReportPath)
  .sort()
if (!sources.length) throw new Error("Architecture analysis found no source files")
const analyzed = new Set(report.modules.map((module) => normalizeReportPath(module.source)))
const missing = sources.filter((source) => !analyzed.has(source))
if (missing.length) {
  console.error("Architecture analysis skipped source files:", missing.join(", "))
  process.exit(1)
}
for (const violation of report.summary.violations) {
  console.error(`${violation.rule.name}: ${violation.from} -> ${violation.to}`)
}
console.log(
  `Architecture: ${sources.length} source modules, ${report.summary.totalDependenciesCruised} dependencies, ${report.summary.violations.length} violations`,
)
process.exit(check.exitCode === 0 && !report.summary.violations.length ? 0 : 1)
