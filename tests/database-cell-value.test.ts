import { describe, expect, test } from "bun:test"
import { coerceDatabaseCellValue } from "../src/features/database/model/cell-value"
import type { DatabaseColumn } from "../src/features/database/model/types"

function column(type: string): DatabaseColumn {
  return { field: "amount", type, nullable: false, key: "", defaultValue: null }
}

describe("exact decimal cell edits", () => {
  test("preserves every digit and the entered scale for exact numeric types", () => {
    for (const type of ["DECIMAL(30,10)", "NUMERIC", "MONEY", "DEC", "FIXED"]) {
      for (const value of [
        "9007199254740993.01",
        "-12345678901234567890.1234567890",
        "0.00000000000000000000000000000000000001",
        "12.50",
        ".50",
        "+12.",
      ]) {
        expect(coerceDatabaseCellValue(column(type), `  ${value}  `)).toBe(value)
      }
    }
  })

  test("expands scientific notation without a floating-point conversion", () => {
    for (const [input, expected] of [
      ["9.00719925474099301e15", "9007199254740993.01"],
      ["1.234567890123456789e-10", "0.0000000001234567890123456789"],
      ["1.20e3", "1200"],
      ["-1.20E-3", "-0.00120"],
      ["+.5e+1", "+5"],
      ["12.e-1", "1.2"],
      ["0e100", "0"],
      ["1e-324", `0.${"0".repeat(323)}1`],
    ]) {
      expect(coerceDatabaseCellValue(column("DECIMAL"), input ?? "")).toBe(expected)
    }
  })

  test("rejects malformed decimal input instead of accepting JavaScript-only numeric forms", () => {
    for (const value of [
      "",
      " ",
      "NaN",
      "Infinity",
      "0x10",
      "0b10",
      "0o10",
      "1,25",
      "1_000",
      ".",
      "1e",
      "1e+",
      "1e99999999999999999",
      "1e150001",
      "1e-150001",
    ]) {
      expect(() => coerceDatabaseCellValue(column("NUMERIC"), value)).toThrow("número")
    }
  })

  test("retains numeric values for approximate types and existing integer semantics", () => {
    for (const type of ["REAL", "FLOAT", "DOUBLE PRECISION"]) {
      expect(coerceDatabaseCellValue(column(type), "12.50")).toBe(12.5)
      expect(coerceDatabaseCellValue(column(type), "1.25e3")).toBe(1250)
      expect(() => coerceDatabaseCellValue(column(type), "Infinity")).toThrow("número")
    }
    expect(coerceDatabaseCellValue(column("INTEGER"), "42")).toBe(42)
    expect(coerceDatabaseCellValue(column("BIGINT"), "9007199254740993")).toBe(9007199254740993n)
    expect(coerceDatabaseCellValue(column("TEXT"), "001.20")).toBe("001.20")
  })
})
