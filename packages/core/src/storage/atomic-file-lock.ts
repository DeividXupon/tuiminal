import { Database } from "bun:sqlite"
import { closeSync, lstatSync, mkdirSync, openSync } from "node:fs"
import { basename, dirname, join } from "node:path"

/** Keep the sidecar: unlinking it could give concurrent writers different locks. */
export function withAtomicFileLock<T>(target: string, write: () => T): T {
  const directory = join(dirname(target), ".tuiminal-locks")
  try {
    mkdirSync(directory, { mode: 0o700 })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error
  }
  const parent = lstatSync(directory)
  if (parent.isSymbolicLink() || !parent.isDirectory()) {
    throw new Error("O destino não pode atravessar symlinks ou arquivos de configuração.")
  }
  // Keeping the basename also preserves filesystem case/Unicode alias handling
  // and does not extend an already maximum-length filename.
  const path = join(directory, basename(target))
  try {
    closeSync(openSync(path, "wx", 0o600))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error
  }
  const info = lstatSync(path)
  if (info.isSymbolicLink() || !info.isFile() || info.nlink !== 1) {
    throw new Error("O destino precisa ser um arquivo regular.")
  }
  const lock = new Database(path, { readwrite: true, create: false })
  try {
    // SQLite owns the OS lock, which is also released on process termination.
    // No rows or file contents are stored here, and no stale PID cleanup is needed.
    lock.exec("PRAGMA busy_timeout = 0; BEGIN IMMEDIATE")
    return write()
  } finally {
    lock.close()
  }
}
