import { expect, test } from "bun:test"
import {
  createRemoteSectionId,
  moveRemoteSection,
  orderRemoteItems,
  parseRemoteSectionOptions,
  removeRemoteSection,
} from "../packages/feature-git/src/model/remote-sections"

test("shared remote section transitions keep source arrays intact and bound movement", () => {
  const sections = [{ id: "mine" }, { id: "review" }, { id: "open" }]
  expect(createRemoteSectionId("Minha Equipe", sections)).toBe("minha-equipe")
  expect(createRemoteSectionId("Mine", sections)).toBe("mine-2")
  expect(moveRemoteSection(sections, "review", 1).map((section) => section.id)).toEqual([
    "mine",
    "open",
    "review",
  ])
  expect(moveRemoteSection(sections, "mine", -1)).toEqual(sections)
  expect(moveRemoteSection(sections, "missing", 1)).toEqual(sections)
  expect(removeRemoteSection(sections, "review").map((section) => section.id)).toEqual([
    "mine",
    "open",
  ])
  expect(sections.map((section) => section.id)).toEqual(["mine", "review", "open"])
  expect(() => removeRemoteSection(sections.slice(0, 1), "mine")).toThrow("one section")
})

test("shared section options and ordering retain the PR/Issue validation contract", () => {
  expect(
    parseRemoteSectionOptions(
      { columns: "title,labels,title", sort: "number-asc", limit: "30" },
      ["title", "labels"],
      ["updated-desc", "number-asc"],
    ),
  ).toEqual({ columns: ["title", "labels"], sort: "number-asc", limit: 30 })
  expect(() =>
    parseRemoteSectionOptions(
      { columns: "unknown", sort: "number-asc", limit: "30" },
      ["title"],
      ["number-asc"],
    ),
  ).toThrow("valid column")

  const items = [
    { identity: { number: 2 }, updatedAt: "2025-01-01" },
    { identity: { number: 1 }, updatedAt: "2026-01-01" },
  ]
  expect(orderRemoteItems(items, "updated-desc").map((item) => item.identity.number)).toEqual([
    1, 2,
  ])
  expect(orderRemoteItems(items, "number-desc").map((item) => item.identity.number)).toEqual([2, 1])
  expect(items[0]?.identity.number).toBe(2)
})
