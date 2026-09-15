import { describe, expect, test } from "bun:test"
import {
  buildEffectiveIssueQueries,
  normalizeIssueQuery,
} from "../packages/feature-git/src/model/issue/query"
import {
  buildEffectivePullRequestQueries,
  normalizePullRequestQuery,
} from "../packages/feature-git/src/model/pr/query"

const accountScope = {
  viewerLogin: "viewer",
  organizations: ["team"],
  repositories: ["external/project"],
}

for (const [kind, opposite, build, normalize] of [
  ["pr", "issue", buildEffectivePullRequestQueries, normalizePullRequestQuery],
  ["issue", "pr", buildEffectiveIssueQueries, normalizeIssueQuery],
] as const) {
  describe(`${kind} query quoting`, () => {
    test.each(["repo:other/project", "user:other", "org:other", "author:@me", "mentions:@me"])(
      "does not infer scope from quoted %s text",
      (literal) => {
        const query = `"documentation for ${literal} here"`
        expect(build({ query, repositories: [], accountScope })).toEqual([
          { repository: null, query: `is:${kind} ${query} archived:false user:viewer` },
          { repository: null, query: `is:${kind} ${query} archived:false org:team` },
          {
            repository: "external/project",
            query: `is:${kind} ${query} archived:false repo:external/project`,
          },
        ])
      },
    )

    test("keeps required filters outside literal phrases", () => {
      const query = `"documentation is:${kind} archived:false here"`
      expect(build({ query, repositories: ["team/project"] })).toEqual([
        {
          repository: "team/project",
          query: `is:${kind} ${query} archived:false repo:team/project`,
        },
      ])
    })

    test("allows literal references to the opposite item type and repo qualifier", () => {
      const query = `label:"syntax is:${opposite} repo:other/project here"`
      expect(build({ query, repositories: ["team/project"] })).toEqual([
        {
          repository: "team/project",
          query: `is:${kind} ${query} archived:false repo:team/project`,
        },
      ])
    })

    test("recognizes complete filters with quoted values without duplicating them", () => {
      const query = `is:"${kind}" archived:"false" author:"@me"`
      expect(build({ query, repositories: [], accountScope })).toEqual([
        { repository: null, query },
      ])
      expect(() => build({ query: `is:"${opposite}"`, repositories: [] })).toThrow(`is:${opposite}`)
    })

    test("retains real explicit scopes, including quoted values", () => {
      for (const query of [
        "repo:other/project",
        'repo:"other/project"',
        'org:"other"',
        "user:other",
      ]) {
        expect(build({ query, repositories: [], accountScope })).toEqual([
          { repository: null, query: `is:${kind} ${query} archived:false` },
        ])
      }
      expect(() =>
        build({ query: 'repo:"other/project"', repositories: ["team/project"] }),
      ).toThrow("structured repository scope")
    })

    test("does not treat exclusions or qualifier suffixes as a viewer scope", () => {
      for (const query of ["-author:@me", "author:@me-extra", 'label:"author:@me"']) {
        expect(build({ query, repositories: [], accountScope })[0]?.query).toBe(
          `is:${kind} ${query} archived:false user:viewer`,
        )
      }
    })

    test("preserves escaped quote content and normalizes only outside whitespace", () => {
      const query = String.raw`  label:"say \"hi  there\"  repo:other/project  here"   is:open  `
      const expected = String.raw`label:"say \"hi  there\"  repo:other/project  here" is:open`
      expect(normalize(query)).toBe(expected)
      expect(build({ query, repositories: [], accountScope })[0]?.query).toBe(
        `is:${kind} ${expected} archived:false user:viewer`,
      )
    })

    test("keeps apostrophes inside ordinary words from opening a quoted token", () => {
      expect(normalize("  don't   panic   is:open  ")).toBe("don't panic is:open")
      expect(build({ query: "don't panic", repositories: [], accountScope })[0]?.query).toBe(
        `is:${kind} don't panic archived:false user:viewer`,
      )
    })

    test("preserves single-quoted values and escaped single quotes", () => {
      const query = String.raw` label:'can\'t  lose  spaces'   is:open `
      expect(normalize(query)).toBe(String.raw`label:'can\'t  lose  spaces' is:open`)
    })

    test("closes quotes after an even number of backslashes", () => {
      const query = String.raw`label:"path\\"   author:@me`
      const expected = String.raw`label:"path\\" author:@me`
      expect(normalize(query)).toBe(expected)
      expect(build({ query, repositories: [], accountScope })).toEqual([
        { repository: null, query: `is:${kind} ${expected} archived:false` },
      ])
    })

    test.each(['"unfinished repo:other/project', 'label:"unfinished', 'label:"trailing\\'])(
      "rejects unfinished quoted searches before appending a scope: %s",
      (query) => {
        // Editing remains possible; only an executable query needs closed quotes.
        expect(normalize(query)).toBe(query)
        expect(() => build({ query, repositories: [], accountScope })).toThrow(
          "Feche as aspas na query do GitHub.",
        )
      },
    )
  })
}
