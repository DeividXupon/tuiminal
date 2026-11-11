import { expect, spyOn, test } from "bun:test"
import * as fs from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  AtomicFileConflictError,
  atomicWriteFileSync,
  currentFileHash,
} from "../packages/core/src/storage/atomic-file"

function competingWrite(path: string, hash: string) {
  const child = Bun.spawnSync(
    [
      process.execPath,
      join(import.meta.dir, "fixtures/atomic-interruption.ts"),
      path,
      "try-write",
      hash,
    ],
    { env: process.env, stdout: "pipe", stderr: "pipe", timeout: 5_000 },
  )
  expect(child.stderr.toString()).toBe("")
  expect(child.exitCode).toBe(0)
  return child.stdout.toString().trim()
}

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
      ".tuiminal-locks",
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
    expect(fs.readdirSync(root).sort()).toEqual([".tuiminal-locks", "session.json"])
  } finally {
    flush?.mockRestore()
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test.each(["write", "rename"] as const)(
  "%s failure preserves the saved bytes and permits a later retry",
  (stage) => {
    const root = fs.mkdtempSync(join(tmpdir(), "tuiminal-atomic-failure-"))
    const path = join(root, "settings.json")
    let fault: ReturnType<typeof spyOn> | undefined
    try {
      const hash = atomicWriteFileSync(path, "original")
      const failure = Object.assign(new Error("simulated storage failure"), {
        code: stage === "write" ? "ENOSPC" : "EIO",
      })
      if (stage === "write") {
        const write = fs.writeFileSync
        fault = spyOn(fs, "writeFileSync").mockImplementation((target) => {
          write(target, "partial")
          throw failure
        })
      } else {
        fault = spyOn(fs, "renameSync").mockImplementation(() => {
          throw failure
        })
      }
      expect(() => atomicWriteFileSync(path, "replacement", { expectedHash: hash })).toThrow(
        failure,
      )
      expect(fs.readFileSync(path, "utf8")).toBe("original")
      expect(fs.readdirSync(root).sort()).toEqual([".tuiminal-locks", "settings.json"])
      fault.mockRestore()
      fault = undefined
      atomicWriteFileSync(path, "retry", { expectedHash: hash, backup: true })
      expect(fs.readFileSync(path, "utf8")).toBe("retry")
      expect(fs.readFileSync(`${path}.bak`, "utf8")).toBe("original")
    } finally {
      fault?.mockRestore()
      fs.rmSync(root, { recursive: true, force: true })
    }
  },
)

test.each(["before-publish", "after-publish"] as const)(
  "process interruption %s leaves a complete recoverable settings file",
  (stage) => {
    const root = fs.mkdtempSync(join(tmpdir(), "tuiminal-atomic-interruption-"))
    const path = join(root, "settings.json")
    try {
      const hash = atomicWriteFileSync(path, "original")
      const child = Bun.spawnSync(
        [process.execPath, join(import.meta.dir, "fixtures/atomic-interruption.ts"), path, stage],
        { env: process.env, stdout: "pipe", stderr: "pipe", timeout: 5_000 },
      )
      expect(child.stderr.toString()).toBe("")
      expect(child.exitCode).toBe(73)
      expect(fs.readFileSync(path, "utf8")).toBe(
        stage === "before-publish" ? "original" : "replacement",
      )
      if (stage === "after-publish") {
        expect(fs.readFileSync(`${path}.bak`, "utf8")).toBe("original")
        expect(() => atomicWriteFileSync(path, "stale", { expectedHash: hash })).toThrow(
          AtomicFileConflictError,
        )
      }
      atomicWriteFileSync(path, "recovered", { expectedHash: currentFileHash(path) })
      expect(fs.readFileSync(path, "utf8")).toBe("recovered")
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  },
)

test("an external edit during file flush is retained and the stale save is rejected", () => {
  const root = fs.mkdtempSync(join(tmpdir(), "tuiminal-atomic-concurrent-"))
  const path = join(root, "settings.json")
  let flush: ReturnType<typeof spyOn> | undefined
  try {
    const hash = atomicWriteFileSync(path, "original")
    const originalFlush = fs.fsyncSync
    flush = spyOn(fs, "fsyncSync").mockImplementation((fd) => {
      originalFlush(fd)
      if (!fs.fstatSync(fd).isFile()) return
      const child = Bun.spawnSync(
        [
          process.execPath,
          join(import.meta.dir, "fixtures/atomic-interruption.ts"),
          path,
          "external-write",
        ],
        { env: process.env, stdout: "pipe", stderr: "pipe", timeout: 5_000 },
      )
      expect(child.stderr.toString()).toBe("")
      expect(child.exitCode).toBe(0)
    })
    expect(() => atomicWriteFileSync(path, "stale", { expectedHash: hash })).toThrow(
      AtomicFileConflictError,
    )
    expect(fs.readFileSync(path, "utf8")).toBe("replacement")
    expect(fs.readdirSync(root).sort()).toEqual([".tuiminal-locks", "settings.json"])
  } finally {
    flush?.mockRestore()
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test.each([
  ["flush", false],
  ["flush", true],
  ["publish", false],
  ["publish", true],
] as const)(
  "serializes processes at %s with backup=%s and rejects a stale retry",
  (stage, backup) => {
    const root = fs.mkdtempSync(join(tmpdir(), "tuiminal-atomic-lock-"))
    const path = join(root, "settings.json")
    let seam: ReturnType<typeof spyOn> | undefined
    try {
      const hash = atomicWriteFileSync(path, "original")
      let attempts = 0
      const compete = () => {
        attempts++
        expect(competingWrite(path, hash)).toBe("conflict")
        expect(fs.readFileSync(path, "utf8")).toBe("original")
      }
      const flush = fs.fsyncSync
      const rename = fs.renameSync
      seam =
        stage === "flush"
          ? spyOn(fs, "fsyncSync").mockImplementation((fd) => {
              flush(fd)
              if (fs.fstatSync(fd).isFile()) compete()
            })
          : spyOn(fs, "renameSync").mockImplementation((source, destination) => {
              if (destination === path) compete()
              rename(source, destination)
            })
      const savedHash = atomicWriteFileSync(path, "first-writer", { expectedHash: hash, backup })
      seam.mockRestore()
      seam = undefined
      expect(attempts).toBe(1)
      expect(fs.readFileSync(path, "utf8")).toBe("first-writer")
      if (backup) expect(fs.readFileSync(`${path}.bak`, "utf8")).toBe("original")
      expect(competingWrite(path, hash)).toBe("conflict")
      expect(fs.readFileSync(path, "utf8")).toBe("first-writer")
      expect(competingWrite(path, savedHash)).toBe("accepted")
      expect(fs.readFileSync(path, "utf8")).toBe("replacement")
      expect(fs.readFileSync(`${path}.bak`, "utf8")).toBe("first-writer")
    } finally {
      seam?.mockRestore()
      fs.rmSync(root, { recursive: true, force: true })
    }
  },
)

test("killing a writer releases its lock and preserves the last complete save", async () => {
  const root = fs.mkdtempSync(join(tmpdir(), "tuiminal-atomic-killed-"))
  const path = join(root, "settings.json")
  let child: ReturnType<typeof Bun.spawn> | undefined
  try {
    const hash = atomicWriteFileSync(path, "original")
    child = Bun.spawn(
      [
        process.execPath,
        join(import.meta.dir, "fixtures/atomic-interruption.ts"),
        path,
        "hold-lock",
      ],
      { env: process.env, stdout: "ignore", stderr: "ignore" },
    )
    const deadline = Date.now() + 5_000
    while (!fs.existsSync(`${path}.ready`)) {
      if (child.exitCode !== null || Date.now() >= deadline)
        throw new Error("Writer did not acquire the lock")
      await Bun.sleep(10)
    }
    expect(competingWrite(path, hash)).toBe("conflict")
    child.kill("SIGKILL")
    await child.exited
    expect(fs.readFileSync(path, "utf8")).toBe("original")
    expect(competingWrite(path, hash)).toBe("accepted")
    expect(fs.readFileSync(path, "utf8")).toBe("replacement")
    expect(fs.readFileSync(`${path}.bak`, "utf8")).toBe("original")
  } finally {
    if (child && child.exitCode === null) child.kill("SIGKILL")
    await child?.exited
    fs.rmSync(root, { recursive: true, force: true })
  }
}, 10_000)

test("a competing first creation cannot replace the writer holding the lock", () => {
  const root = fs.mkdtempSync(join(tmpdir(), "tuiminal-atomic-create-"))
  const path = join(root, "new.json")
  const rename = fs.renameSync
  let seam: ReturnType<typeof spyOn> | undefined
  try {
    let attempts = 0
    seam = spyOn(fs, "renameSync").mockImplementation((source, destination) => {
      if (destination === path) {
        attempts++
        expect(competingWrite(path, "missing")).toBe("conflict")
        expect(fs.existsSync(path)).toBe(false)
      }
      rename(source, destination)
    })
    atomicWriteFileSync(path, "first-creation", { expectedHash: null })
    expect(attempts).toBe(1)
    expect(fs.readFileSync(path, "utf8")).toBe("first-creation")
  } finally {
    seam?.mockRestore()
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test("a rejected nested writer cannot release the outer process lock", () => {
  const root = fs.mkdtempSync(join(tmpdir(), "tuiminal-atomic-nested-"))
  const path = join(root, "settings.json")
  const rename = fs.renameSync
  let seam: ReturnType<typeof spyOn> | undefined
  try {
    const hash = atomicWriteFileSync(path, "original")
    let attempts = 0
    seam = spyOn(fs, "renameSync").mockImplementation((source, destination) => {
      if (destination === path) {
        attempts++
        expect(() => atomicWriteFileSync(path, "nested", { expectedHash: hash })).toThrow(
          AtomicFileConflictError,
        )
        expect(competingWrite(path, hash)).toBe("conflict")
      }
      rename(source, destination)
    })
    atomicWriteFileSync(path, "outer", { expectedHash: hash })
    expect(attempts).toBe(1)
    expect(fs.readFileSync(path, "utf8")).toBe("outer")
  } finally {
    seam?.mockRestore()
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test.skipIf(process.platform === "win32")(
  "lock paths reject symlinks without changing the target",
  () => {
    const root = fs.mkdtempSync(join(tmpdir(), "tuiminal-atomic-symlink-"))
    const path = join(root, "settings.json")
    try {
      const other = join(root, "other")
      fs.mkdirSync(other)
      fs.writeFileSync(path, "original")
      fs.symlinkSync(other, join(root, ".tuiminal-locks"))
      expect(() => atomicWriteFileSync(path, "changed")).toThrow()
      expect(fs.readFileSync(path, "utf8")).toBe("original")
      expect(fs.readdirSync(other)).toEqual([])
      fs.unlinkSync(join(root, ".tuiminal-locks"))
      fs.mkdirSync(join(root, ".tuiminal-locks"))
      fs.symlinkSync(path, join(root, ".tuiminal-locks", "settings.json"))
      expect(() => atomicWriteFileSync(path, "changed")).toThrow()
      expect(fs.readFileSync(path, "utf8")).toBe("original")
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  },
)
