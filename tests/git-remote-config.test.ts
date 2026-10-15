import { expect, test } from "bun:test"
import { parseIssueConfig } from "../packages/feature-git/src/model/issue/config"
import { parsePullRequestConfig } from "../packages/feature-git/src/model/pr/config"

test.each([
  ["PR", parsePullRequestConfig],
  ["Issue", parseIssueConfig],
] as const)("%s config keeps customized sections and normalizes shared fields", (_, parse) => {
  const config = parse({
    version: 1,
    defaults: {
      host: " enterprise.example ",
      pageSize: 3.8,
      refreshSeconds: Number.NaN,
      preview: { open: false, position: "invalid", widthRatio: 0, heightRatio: 1 },
    },
    profiles: {
      "/project": {
        host: " project.example ",
        repositories: ["team/api", "team/api", "invalid"],
        previewPosition: "auto",
        sections: [
          {
            id: "mine",
            title: " Custom ",
            query: " is:open ",
            columns: ["title", "title", "invalid"],
            sort: "not-a-sort",
            limit: 0.8,
          },
          { id: "mine", title: "Duplicate", query: "is:closed" },
        ],
      },
      " ": { repositories: ["team/hidden"] },
    },
    repoPaths: {
      "team/api": [" /checkout ", " /checkout ", ""],
      invalid: ["/ignored"],
    },
  })

  expect(config.defaults).toMatchObject({
    host: "enterprise.example",
    pageSize: 3,
    refreshSeconds: 300,
    preview: { open: false, position: "auto", widthRatio: 0.25, heightRatio: 0.7 },
  })
  expect(Object.keys(config.profiles)).toEqual(["/project"])
  expect(config.profiles["/project"]).toEqual({
    host: "project.example",
    repositories: ["team/api"],
    sections: [
      {
        id: "mine",
        title: "Custom",
        query: "is:open",
        columns: ["title"],
        limit: 1,
      },
    ],
    previewPosition: "auto",
  })
  expect(config.repoPaths).toEqual({ "team/api": [" /checkout "] })
})
