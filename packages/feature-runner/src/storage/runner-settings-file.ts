import { readFileSync } from "node:fs"
import {
  atomicWriteFileSync,
  currentFileHash,
  fileContentHash,
} from "@xupon/tuiminal-core/storage/atomic-file"

export class RunnerSettingsFileState<T> {
  private readonly hashes = new Map<string, string | null>()
  private readonly corrupted = new Set<string>()

  read(path: string, decode: (content: string) => T, empty: T) {
    try {
      const content = readFileSync(path, "utf8")
      const settings = decode(content)
      this.hashes.set(path, fileContentHash(content))
      this.corrupted.delete(path)
      return settings
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        this.hashes.set(path, null)
        this.corrupted.delete(path)
        return structuredClone(empty)
      }
      try {
        this.hashes.set(path, currentFileHash(path))
      } catch {
        this.hashes.set(path, null)
      }
      this.corrupted.add(path)
      return structuredClone(empty)
    }
  }

  write(path: string, settings: T) {
    if (this.corrupted.has(path)) {
      throw new Error("runner.json está corrompido e foi preservado; corrija-o antes de salvar.")
    }
    const content = `${JSON.stringify(settings, null, 2)}\n`
    const expectedHash = this.hashes.has(path) ? this.hashes.get(path)! : currentFileHash(path)
    const hash = atomicWriteFileSync(path, content, { expectedHash, mode: 0o600, backup: true })
    this.hashes.set(path, hash)
  }
}
