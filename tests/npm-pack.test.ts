import { describe, expect, test } from "bun:test"
import { parseNpmPackResult } from "../scripts/npm-pack-model"

const expected = { name: "@xupon/tuiminal-win32-arm64", version: "0.2.0-alpha.0" }
const packed = {
  ...expected,
  filename: "xupon-tuiminal-win32-arm64-0.2.0-alpha.0.tgz",
  integrity: `sha512-${Buffer.alloc(64, 1).toString("base64")}`,
  files: [{ path: "package.json" }, { path: "bin/tuiminal.exe" }],
}

describe("npm pack output", () => {
  test("accepts both legacy arrays and npm 12 package maps", () => {
    for (const result of [[packed], { [expected.name]: packed }])
      expect(parseNpmPackResult(JSON.stringify(result), expected)).toEqual(packed)
    const launcher = { ...packed, name: "tuiminal", filename: "tuiminal-0.2.0-alpha.0.tgz" }
    expect(parseNpmPackResult(JSON.stringify({ tuiminal: launcher }), launcher)).toEqual(launcher)
  })

  test("rejects missing, multiple or wrongly keyed packages", () => {
    for (const result of [
      null,
      [],
      {},
      packed,
      [packed, packed],
      { wrong: packed },
      { [expected.name]: packed, other: packed },
    ])
      expect(() => parseNpmPackResult(JSON.stringify(result), expected)).toThrow()
  })

  test("requires the exact identity, safe artifact name, integrity and file list", () => {
    for (const patch of [
      { name: "tuiminal" },
      { version: "0.2.0" },
      { filename: "../package.tgz" },
      { filename: "/tmp/package.tgz" },
      { filename: "wrong-package.tgz" },
      { integrity: "sha512-incomplete" },
      { integrity: null },
      { files: [] },
      { files: null },
      { files: [{ path: 1 }] },
    ]) {
      const changed = { ...packed, ...patch }
      for (const result of [[changed], { [expected.name]: changed }])
        expect(() => parseNpmPackResult(JSON.stringify(result), expected)).toThrow()
    }
    expect(() => parseNpmPackResult("not json", expected)).toThrow()
  })
})
