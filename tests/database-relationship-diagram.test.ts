import { expect, test } from "bun:test"
import { displayWidth } from "../packages/core/src/i18n/index"
import type {
  DatabaseRelationship,
  DatabaseTable,
} from "../packages/feature-database/src/model/types"
import { renderDatabaseRelationshipDiagram } from "../packages/feature-database/src/rendering/relationship-diagram"

const selected: DatabaseTable = { schema: "main", name: "users", type: "table" }
const incoming: DatabaseRelationship = {
  name: "fk_posts_user",
  direction: "incoming",
  columns: ["id"],
  relatedSchema: "main",
  relatedTable: "posts",
  relatedColumns: ["user_id"],
  onUpdate: "NO ACTION",
  onDelete: "CASCADE",
}
const outgoing: DatabaseRelationship = {
  name: "fk_users_team",
  direction: "outgoing",
  columns: ["team_id"],
  relatedSchema: "main",
  relatedTable: "teams",
  relatedColumns: ["id"],
  onUpdate: "NO ACTION",
  onDelete: "NO ACTION",
}

test("wide diagram places incoming sources left and outgoing targets right", () => {
  const lines = renderDatabaseRelationshipDiagram(selected, [incoming, outgoing], 96)
  const joined = lines.join("\n")
  expect(joined).toContain("main.users")
  expect(joined).toContain("main.posts")
  expect(joined).toContain("main.teams")
  expect(joined).toContain("--->")
  expect(lines.findIndex((line) => line.includes("main.posts"))).toBeGreaterThan(0)
  const row = lines.find((line) => line.includes("main.posts")) ?? ""
  expect(row.indexOf("main.posts")).toBeLessThan(row.indexOf("id"))
  const targetRow = lines.find((line) => line.includes("team_id")) ?? ""
  expect(targetRow.indexOf("team_id")).toBeLessThan(targetRow.indexOf("--->"))
  expect(lines.every((line) => displayWidth(line) <= 96)).toBe(true)
})

test("narrow diagram stacks source and target with composite columns", () => {
  const composite = {
    ...outgoing,
    columns: ["tenant_id", "team_id"],
    relatedColumns: ["tenant_id", "id"],
  }
  const lines = renderDatabaseRelationshipDiagram(selected, [composite], 35)
  expect(lines.some((line) => line.includes("tenant_id, team_id"))).toBe(true)
  expect(lines.some((line) => line.includes("tenant_id, id"))).toBe(true)
  expect(lines.indexOf(lines.find((line) => line.includes("main.users")) ?? "")).toBeLessThan(
    lines.indexOf(lines.find((line) => line.includes("main.teams")) ?? ""),
  )
  expect(lines).toContain("  v")
  expect(lines.every((line) => displayWidth(line) <= 35)).toBe(true)
})

test("self relation stays local and Unicode names keep terminal width", () => {
  const self = { ...outgoing, name: "fk_self", relatedTable: "users", columns: ["parent_id"] }
  const lines = renderDatabaseRelationshipDiagram(selected, [self], 30)
  expect(lines.join("\n")).toContain("fk_self (auto-relação)")
  expect(lines.join("\n")).toContain("--->")
  const unicode = renderDatabaseRelationshipDiagram(
    { schema: "主", name: "顧客一覧", type: "table" },
    [{ ...incoming, relatedSchema: "主", relatedTable: "注文履歴" }],
    74,
  )
  expect(unicode.every((line) => displayWidth(line) <= 74)).toBe(true)
})

test("no relations yields an empty diagram", () => {
  expect(renderDatabaseRelationshipDiagram(selected, [], 80)).toEqual([])
})
