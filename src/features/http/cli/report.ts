import type { HttpRunCase } from "../services/collection-runner"

export type HttpReportKind = "text" | "json" | "junit"

export function httpRunExitCode(cases: HttpRunCase[]) {
  if (cases.some((item) => item.items.some((result) => result.error))) return 3
  if (
    cases.some((item) =>
      item.items.some((result) =>
        result.response?.assertions?.some((assertion) => !assertion.passed),
      ),
    )
  ) {
    return 4
  }
  return 0
}

function reportData(cases: HttpRunCase[]) {
  return {
    version: 1,
    cases: cases.map((testCase) => ({
      name: testCase.name,
      requests: testCase.items.map((item) => ({
        name: item.requestName,
        method: item.method,
        url: item.url,
        ...(item.response
          ? {
              status: item.response.status,
              durationMs: item.response.timings.totalMs,
              assertions: item.response.assertions ?? [],
            }
          : {}),
        ...(item.error ? { error: item.error } : {}),
      })),
    })),
  }
}

function textReport(cases: HttpRunCase[]) {
  const lines: string[] = []
  for (const testCase of cases) {
    if (cases.length > 1) lines.push(`CASO ${testCase.name}`)
    for (const item of testCase.items) {
      if (item.error) {
        lines.push(
          `× ${item.method} ${item.requestName} · ${item.error.kind}: ${item.error.message}`,
        )
        continue
      }
      const response = item.response!
      const failed = response.assertions?.filter((assertion) => !assertion.passed) ?? []
      lines.push(
        `${failed.length ? "×" : "✓"} ${item.method} ${item.requestName} · ${response.status} · ${Math.round(response.timings.totalMs)} ms`,
      )
      for (const assertion of response.assertions ?? []) {
        lines.push(`  ${assertion.passed ? "✓" : "×"} ${assertion.expression}`)
      }
    }
  }
  return `${lines.join("\n")}\n`
}

function xml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
}

function junitReport(cases: HttpRunCase[]) {
  const tests = cases.flatMap((testCase) =>
    testCase.items.map((item) => {
      const failures = item.response?.assertions?.filter((assertion) => !assertion.passed) ?? []
      const error = item.error
      const failure = error
        ? `<error message="${xml(error.message)}" type="${xml(error.kind)}"/>`
        : failures.length
          ? `<failure message="${xml(`${failures.length} assertion(s) falharam`)}">${xml(
              failures.map((assertion) => assertion.expression).join("\n"),
            )}</failure>`
          : ""
      return `<testcase classname="${xml(testCase.name)}" name="${xml(item.requestName)}" time="${(
        (item.response?.timings.totalMs ?? 0) / 1_000
      ).toFixed(3)}">${failure}</testcase>`
    }),
  )
  const failures = cases
    .flatMap((item) => item.items)
    .filter((item) => item.response?.assertions?.some((assertion) => !assertion.passed)).length
  const errors = cases.flatMap((item) => item.items).filter((item) => item.error).length
  return `<?xml version="1.0" encoding="UTF-8"?>\n<testsuite name="tuiminal-http" tests="${tests.length}" failures="${failures}" errors="${errors}">${tests.join("")}</testsuite>\n`
}

export function formatHttpRunReport(cases: HttpRunCase[], kind: HttpReportKind) {
  if (kind === "json") return `${JSON.stringify(reportData(cases), null, 2)}\n`
  if (kind === "junit") return junitReport(cases)
  return textReport(cases)
}
