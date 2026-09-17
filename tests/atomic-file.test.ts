import { expect, spyOn, test } from "bun:test"
import * as fs from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  atomicWriteFileSync,
  AtomicFileConflictError,
  currentFileHash,
} from "../packages/core/src/storage/atomic-file"

test("native atomic settings create, replace, back up and reject stale writes", () => {
  const root = fs.mkdtempSync(join(tmpdir(), "tuiminal-atomic-native-"))
  try {
    const path = join(root, "settings Ω", "session.json")
    const first = atomicWriteFileSync(path, '{"session":"first"}\n', { expectedHash: null })
    const second = atomicWriteFileSync(path, '{"session":"second"}\n', {
      expectedHash: first,
      backup: true,
    })
    expect(currentFileHash(path)).toBe(second)
    expect(fs.readFileSync(path, "utf8")).toBe('{"session":"second"}\n')
    expect(fs.readFileSync(`${path}.bak`, "utf8")).toBe('{"session":"first"}\n')
    expect(() => atomicWriteFileSync(path, "stale", { expectedHash: first })).toThrow(
      AtomicFileConflictError,
    )
    expect(currentFileHash(path)).toBe(second)
    expect(fs.readdirSync(join(root, "settings Ω")).sort()).toEqual([
      "session.json",
      "session.json.bak",
    ])
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test("a failed file flush preserves the previous settings and removes the temporary file", () => {
  const root = fs.mkdtempSync(join(tmpdir(), "tuiminal-atomic-flush-"))
  const path = join(root, "session.json")
  const originalFlush = fs.fsyncSync
  let flush: ReturnType<typeof spyOn> | undefined
  try {
    const originalHash = atomicWriteFileSync(path, "original")
    flush = spyOn(fs, "fsyncSync").mockImplementation((fd) => {
      if (fs.fstatSync(fd).isFile()) throw new Error("simulated file flush failure")
      originalFlush(fd)
    })
    expect(() => atomicWriteFileSync(path, "replacement", { expectedHash: originalHash })).toThrow(
      "simulated file flush failure",
    )
    expect(fs.readFileSync(path, "utf8")).toBe("original")
    expect(fs.readdirSync(root)).toEqual(["session.json"])
  } finally {
    flush?.mockRestore()
    fs.rmSync(root, { recursive: true, force: true })
  }
})
