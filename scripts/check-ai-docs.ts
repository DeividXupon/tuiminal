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
for (const name of new Bun.Glob("**/*.md").scanSync(guideDirectory)) {
  const file = resolve(guideDirectory, name)
  if (!files.includes(file)) files.push(file)
}
const problems: string[] = []
let totalBytes = 0

for (const file of files) {
  if (!existsSync(file)) {
    problems.push(`Missing agent guide: ${file}`)
    continue
  }
  const limit = file === entry || file === resolve(guideDirectory, "index.md") ? 3 * 1024 : 8 * 1024
  const size = statSync(file).size
  totalBytes += size
  if (size > limit) {
    problems.push(
      `${file}: exceeds ${limit / 1024} KiB; shorten or link to the owning specification`,
    )
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

if (totalBytes > 48 * 1024) {
  problems.push("Agent guidance exceeds 48 KiB total; remove duplication before adding more notes")
}
for (const problem of problems) console.error(problem)
console.log(
  `Agent guidance: ${files.length} files, ${totalBytes} bytes, ${problems.length} problems`,
)
process.exitCode = problems.length ? 1 : 0
