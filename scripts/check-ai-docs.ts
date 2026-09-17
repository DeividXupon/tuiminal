import { existsSync, readFileSync, statSync } from "node:fs"
import { resolve } from "node:path"

const root = resolve(import.meta.dir, "..")
const entry = resolve(root, "AGENTS.md")
const guideDirectory = resolve(root, "docs/ai")
const guideNames = [
  "index",
  "conventions",
  "feature-installation",
  "git",
  "runner",
  "http",
  "terminal",
  "database",
  "validation",
]
const files = [entry, ...guideNames.map((name) => resolve(guideDirectory, `${name}.md`))]
const problems: string[] = []

for (const file of files) {
  if (!existsSync(file)) {
    problems.push(`Missing agent guide: ${file}`)
    continue
  }
  const limit = file === entry ? 8 * 1024 : 32 * 1024
  if (statSync(file).size > limit) {
    problems.push(`${file}: exceeds ${limit / 1024} KiB; split or shorten the guidance`)
  }
  const markdown = readFileSync(file, "utf8")
  for (const match of markdown.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    const destination = match[1]?.split("#", 1)[0]
    if (!destination || /^(?:https?:|mailto:)/.test(destination)) continue
    if (!existsSync(resolve(file, "..", decodeURIComponent(destination)))) {
      problems.push(`${file}: broken local link ${destination}`)
    }
  }
}

for (const problem of problems) console.error(problem)
console.log(`Agent guidance: ${files.length} files, ${problems.length} problems`)
process.exitCode = problems.length ? 1 : 0
