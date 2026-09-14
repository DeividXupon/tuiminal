import { expect, test } from "bun:test"
import { githubQuerySuggestions } from "../packages/feature-git/src/model/query-autocomplete"

function countedRepositories(count: number) {
  let reads = 0
  const repositories = new Proxy(
    Array.from({ length: count }, (_, index) => `team/repo-${index}`),
    {
      get(target, key, receiver) {
        if (typeof key === "string" && /^\d+$/.test(key)) reads += 1
        return Reflect.get(target, key, receiver)
      },
    },
  )
  return { repositories, reads: () => reads }
}

test("query autocomplete reads only enough repositories for its visible limit", () => {
  const h = countedRepositories(10000)
  expect(
    githubQuerySuggestions({
      kind: "pr",
      query: "repo:",
      repositories: h.repositories,
      limit: 3,
    }).map((item) => item.value),
  ).toEqual(["repo:team/repo-0", "repo:team/repo-1", "repo:team/repo-2"])
  expect(h.reads()).toBe(3)
})

test("repository completion preserves order and skips existing or nonmatching candidates", () => {
  const h = countedRepositories(100)
  expect(
    githubQuerySuggestions({
      kind: "issue",
      query: "repo:team/repo-1 repo:team/repo-2 repo:team/repo-",
      repositories: h.repositories,
      limit: 3,
    }).map((item) => item.value),
  ).toEqual(["repo:team/repo-0", "repo:team/repo-3", "repo:team/repo-4"])
  expect(h.reads()).toBe(5)
  expect(
    githubQuerySuggestions({
      kind: "pr",
      query: "review:",
      repositories: h.repositories,
      limit: 3,
    }).map((item) => item.value),
  ).toEqual(["review:approved", "review:changes_requested"])
  expect(h.reads()).toBe(5)
})

test.each([0, -1, Number.NaN, 0.9])("limit %s does not inspect repositories", (limit) => {
  const h = countedRepositories(100)
  expect(
    githubQuerySuggestions({ kind: "pr", query: "", repositories: h.repositories, limit }),
  ).toEqual([])
  expect(h.reads()).toBe(0)
})

test("fractional and unbounded limits retain slice semantics and built-in ordering", () => {
  const options = { kind: "issue" as const, query: "", repositories: ["team/a"] }
  expect(githubQuerySuggestions({ ...options, limit: 2.9 }).map((item) => item.value)).toEqual([
    "repo:team/a",
    "no:assignee",
  ])
  const all = githubQuerySuggestions({ ...options, limit: Number.POSITIVE_INFINITY })
  expect(all).toHaveLength(15)
  expect(all.at(-1)?.value).toBe("sort:updated-desc")
})
