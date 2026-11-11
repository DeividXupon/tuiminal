import { expect, test } from "bun:test"
import { environmentData } from "../packages/feature-http/src/services/environment-editor"

const baseline = (metadata: Record<string, unknown>) =>
  environmentData("Global", [{ id: "row", name: "token", value: "fixture", metadata }]).baseline

test("environment baselines compare metadata values independently of object-field order", () => {
  expect(
    baseline({ key: "token", value: "fixture", source: { id: "vault", details: { a: 1, b: 2 } } }),
  ).toBe(
    baseline({ source: { details: { b: 2, a: 1 }, id: "vault" }, value: "fixture", key: "token" }),
  )
})

test("an omitted enabled flag matches the enabled default used when saving", () => {
  expect(baseline({ key: "token" })).toBe(baseline({ enabled: true, key: "token" }))
  expect(baseline({ key: "token" })).not.toBe(baseline({ enabled: false, key: "token" }))
})

test("environment baselines retain remote metadata and ordered array changes", () => {
  expect(baseline({ type: "secret" })).not.toBe(baseline({ type: "default" }))
  expect(baseline({ source: { id: "first" } })).not.toBe(baseline({ source: { id: "second" } }))
  expect(baseline({ extra: ["first", "second"] })).not.toBe(
    baseline({ extra: ["second", "first"] }),
  )
  expect(baseline({ description: "original" })).not.toBe(baseline({ description: "changed" }))
})
