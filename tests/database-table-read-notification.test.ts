import { expect, test } from "bun:test"
import { COLORS } from "../packages/core/src/settings/theme"
import { tableReadNotification } from "../packages/feature-database/src/rendering/table-read-notification"

test("table read preview highlights SQL and preserves table and fetch bounds", () => {
  const sql =
    'SELECT "id", "name", "password"\nFROM "main"."demo"\nORDER BY "id" ASC\nLIMIT 51 OFFSET 0'
  const notification = tableReadNotification(sql, "sqlite", 52)

  expect(notification.message).toContain('SELECT … FROM "main"."demo"')
  expect(notification.message).toContain("LIMIT 51 OFFSET 0")
  expect(notification.message).toContain("ORDER BY …")
  expect(notification.message).not.toContain('"password"')
  expect(notification.messageChunks.map((chunk) => chunk.text).join("")).toBe(notification.message)
  expect(notification.messageChunks).toContainEqual({ text: "SELECT", color: COLORS.database })
  expect(notification.messageChunks).toContainEqual({ text: "51", color: COLORS.warning })
})

test("table read preview omits search literals but keeps the window direction visible", () => {
  const sql =
    'SELECT "id"\nFROM "main"."demo"\nWHERE LOWER("name") LIKE LOWER(\'%private%\')\nORDER BY "id" ASC\nLIMIT 41 OFFSET 50'
  const notification = tableReadNotification(sql, "sqlite", 52)

  expect(notification.message).toContain('FROM "main"."demo"')
  expect(notification.message).toContain("WHERE …")
  expect(notification.message).toContain("LIMIT 41 OFFSET 50")
  expect(notification.message).not.toContain("private")
  expect(notification.messageChunks.map((chunk) => chunk.text).join("")).toBe(notification.message)
})
