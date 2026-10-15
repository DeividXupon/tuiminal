import { expect, spyOn, test } from "bun:test"
import {
  buildGitPartialStagePatch,
  gitPartialStageChangeLineIds,
  gitPartialStageTargets,
  parseGitPartialStagePatch,
} from "../packages/feature-git/src/model/git-partial-stage"
import {
  documentLineCount,
  parseDiffDocuments,
  parseUnifiedDiff,
} from "../packages/feature-git/src/rendering/diff"

const patch = [
  "diff --git a/example.txt b/example.txt",
  "index 1111111..2222222 100644",
  "--- a/example.txt",
  "+++ b/example.txt",
  "@@ -1,3 +1,3 @@",
  "--- old section",
  "---tail",
  "+++ new section",
  "+++tail",
  " stable",
].join("\n")

test("unified parsing distinguishes file headers from header-like code inside hunks", () => {
  const lines = parseUnifiedDiff(patch)
  expect(lines.filter((line) => line.kind === "removed")).toEqual([
    { kind: "removed", content: "-- old section", oldLine: 1, newLine: null },
    { kind: "removed", content: "--tail", oldLine: 2, newLine: null },
  ])
  expect(lines.filter((line) => line.kind === "added")).toEqual([
    { kind: "added", content: "++ new section", oldLine: null, newLine: 1 },
    { kind: "added", content: "++tail", oldLine: null, newLine: 2 },
  ])
  expect(lines.at(-1)).toMatchObject({ kind: "context", oldLine: 3, newLine: 3 })
})

test("all document layouts count header-like code and preserve inline line numbers", () => {
  const document = parseDiffDocuments(patch)[0]
  if (!document) throw new Error("Missing diff document")
  expect(documentLineCount(document, "unified")).toBe(5)
  expect(documentLineCount(document, "split")).toBe(3)
  expect(
    document.inlineRows.map(({ kind, content, lineNumber }) => ({ kind, content, lineNumber })),
  ).toEqual([
    { kind: "modified", content: "++ new section", lineNumber: 1 },
    { kind: "modified", content: "++tail", lineNumber: 2 },
    { kind: "context", content: "stable", lineNumber: 3 },
  ])
})

test("document parsing preserves section boundaries and trailing source newlines", () => {
  const first = [
    "diff --git a/first.txt b/first.txt",
    "--- a/first.txt",
    "+++ b/first.txt",
    "@@ -1 +1 @@",
    "-before",
    "+after",
  ].join("\n")
  const second = first.replaceAll("first.txt", "second.txt")
  const documents = parseDiffDocuments(`── STAGED ──\n${first}\n\n── WORKTREE ──\n${second}\n`)
  expect(documents.map(({ section, path, source }) => ({ section, path, source }))).toEqual([
    { section: "STAGED", path: "first.txt", source: `${first}\n` },
    { section: "WORKTREE", path: "second.txt", source: `${second}\n` },
  ])
})

test.each(["hunk", "line"] as const)(
  "%s staging keeps every header-like changed line",
  (granularity) => {
    const document = parseGitPartialStagePatch(patch)
    if (!document) throw new Error("Missing partial-stage document")
    expect(gitPartialStageChangeLineIds(document)).toHaveLength(4)
    const targets = gitPartialStageTargets(document, granularity)
    expect(targets).toHaveLength(granularity === "hunk" ? 1 : 4)
    const selected = new Set(targets.map((target) => target.id))
    const result = buildGitPartialStagePatch({ document, granularity, selected })
    expect(result).toContain(
      "@@ -1,3 +1,3 @@\n--- old section\n---tail\n+++ new section\n+++tail\n stable\n",
    )
  },
)

test("character comparisons are deferred until an inline document is read and reused afterward", () => {
  const oldLine = "deferred-comparison old value"
  const newLine = "deferred-comparison new value"
  const input = [
    "diff --git a/example.txt b/example.txt",
    "--- a/example.txt",
    "+++ b/example.txt",
    "@@ -1 +1 @@",
    `-${oldLine}`,
    `+${newLine}`,
  ].join("\n")
  const arrays = spyOn(Array, "from")
  const comparisons = () =>
    arrays.mock.calls.filter(([value]) => value === oldLine || value === newLine).length
  try {
    const [first, second] = parseDiffDocuments(
      `${input}\n${input.replaceAll("example.txt", "second.txt")}`,
    )
    if (!first || !second) throw new Error("Missing diff documents")
    expect(documentLineCount(first, "unified")).toBe(2)
    expect(documentLineCount(first, "split")).toBe(1)
    expect(comparisons()).toBe(0)
    const rows = first.inlineRows
    expect(rows[0]).toMatchObject({ kind: "modified", content: newLine, lineNumber: 1 })
    const count = comparisons()
    expect(count).toBeGreaterThan(0)
    expect(first.inlineRows).toBe(rows)
    expect(documentLineCount(first, "inline")).toBe(1)
    expect(comparisons()).toBe(count)
    expect(second.inlineRows).toEqual(rows)
    expect(comparisons()).toBe(count * 2)
  } finally {
    arrays.mockRestore()
  }
})
