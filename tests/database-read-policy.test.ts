import { describe, expect, test } from "bun:test"
import { isReadOnlySql as isReadOnlyEditorQuery } from "../src/features/database/model/sql-read-policy"

describe("SQL read-only classification", () => {
  test.each([
    "EXPLAIN ANALYZE DELETE FROM users",
    "EXPLAIN (ANALYZE true) UPDATE users SET name = 'changed'",
    "SELECT setval('audit_sequence', 100)",
    "SELECT nextval('audit_sequence')",
    "SELECT set_config('transaction_read_only', 'off', false)",
    "SELECT public.mutate_users()",
    "SELECT public.lower('potentially overloaded')",
    "SELECT 1, arbitrary_effect(id) AS effect FROM users",
    "WITH selected AS (SELECT 1) SELECT arbitrary_effect(id) AS effect FROM users",
    "SELECT pg_catalog.setval('audit_sequence', 100)",
    "SELECT 1; DELETE FROM users",
    "SELECT 1 /*! INTO OUTFILE '/tmp/unexpected' */",
    "SELECT 1 /*M! INTO OUTFILE '/tmp/unexpected' */",
    "WITH deleted AS (DELETE FROM users RETURNING *) SELECT * FROM deleted",
    "SELECT * FROM users FOR UPDATE",
    "SELECT * INTO snapshot FROM users",
  ])("requires write permission and confirmation for %s", (sql) => {
    expect(isReadOnlyEditorQuery(sql)).toBe(false)
  })

  test.each([
    "SELECT id, name FROM users",
    "SELECT count(*), lower(name), sum(id) FROM users GROUP BY name",
    "SELECT * FROM users WHERE id IN (1, 2) AND EXISTS (SELECT 1)",
    "WITH active AS (SELECT * FROM users) SELECT * FROM active",
    "WITH RECURSIVE cnt(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM cnt WHERE x < 5) SELECT sum(x) FROM cnt",
    "SELECT 'setval(1); DELETE' AS value /* DELETE */",
    "SELECT $$nextval('sequence')$$ AS value",
    "SELECT pg_catalog.lower('NAME')",
    "EXPLAIN SELECT * FROM users",
    "EXPLAIN (ANALYZE true, BUFFERS true) SELECT count(*) FROM users",
    "SHOW transaction_read_only",
  ])("retains known read operations: %s", (sql) => {
    expect(isReadOnlyEditorQuery(sql)).toBe(true)
  })

  test.each([
    "PRAGMA user_version = 7",
    "PRAGMA user_version(7)",
    "PRAGMA query_only = OFF",
    "PRAGMA writable_schema = ON",
    "PRAGMA wal_checkpoint(TRUNCATE)",
    "PRAGMA optimize",
    "PRAGMA main.application_id = 123",
  ])("does not call a setting a read: %s", (sql) => {
    expect(isReadOnlyEditorQuery(sql, "sqlite")).toBe(false)
  })

  test.each([
    "PRAGMA user_version",
    "PRAGMA main.user_version",
    "PRAGMA table_info('users')",
    'PRAGMA index_list("users")',
    "PRAGMA foreign_key_check",
    "PRAGMA database_list",
  ])("retains read-only SQLite metadata: %s", (sql) => {
    expect(isReadOnlyEditorQuery(sql, "sqlite")).toBe(true)
  })
})
