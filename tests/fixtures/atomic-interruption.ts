import { spyOn } from "bun:test"
import * as fs from "node:fs"
import {
  AtomicFileConflictError,
  atomicWriteFileSync,
  currentFileHash,
} from "../../packages/core/src/storage/atomic-file"

const [path, stage, expectedHash] = process.argv.slice(2)
if (!path || !stage) throw new Error("Missing isolated storage fixture arguments")

if (stage === "external-write") {
  fs.writeFileSync(path, "replacement")
  process.exit(0)
}

if (stage === "try-write") {
  if (!expectedHash) throw new Error("Missing expected hash for competing writer")
  try {
    atomicWriteFileSync(path, "replacement", {
      expectedHash: expectedHash === "missing" ? null : expectedHash,
      backup: true,
    })
    console.log("accepted")
  } catch (error) {
    if (!(error instanceof AtomicFileConflictError)) throw error
    console.log("conflict")
  }
  process.exit(0)
}

if (stage === "hold-lock") {
  const flush = fs.fsyncSync
  spyOn(fs, "fsyncSync").mockImplementation((fd) => {
    flush(fd)
    if (!fs.fstatSync(fd).isFile()) return
    fs.writeFileSync(`${path}.ready`, "ready")
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0)
  })
}

if (stage === "before-publish") {
  const flush = fs.fsyncSync
  spyOn(fs, "fsyncSync").mockImplementation((fd) => {
    flush(fd)
    if (fs.fstatSync(fd).isFile()) process.exit(73)
  })
} else if (stage === "after-publish") {
  const rename = fs.renameSync
  spyOn(fs, "renameSync").mockImplementation((source, destination) => {
    rename(source, destination)
    if (destination === path) process.exit(73)
  })
}

atomicWriteFileSync(path, "replacement", { expectedHash: currentFileHash(path), backup: true })
