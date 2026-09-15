import { randomUUID } from "node:crypto"
import { constants } from "node:fs"
import { chmod, lstat, mkdir, open, readdir, rename, rm } from "node:fs/promises"
import { join } from "node:path"
import { featureDigest } from "./download"
import {
  FeatureInstallError,
  isFeatureId,
  featureFileNames,
  type FeatureArtifact,
  type FeatureFile,
} from "./model"

function missing(error: unknown) {
  return (error as NodeJS.ErrnoException)?.code === "ENOENT"
}

async function privateDirectory(path: string, recursive = false) {
  try {
    await mkdir(path, { recursive, mode: 0o700 })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error
  }
  const info = await lstat(path)
  if (!info.isDirectory() || info.isSymbolicLink())
    throw new FeatureInstallError("storage", "Feature storage cannot traverse symlinks")
  await chmod(path, 0o700)
}

export class FeatureStore {
  constructor(readonly directory: string) {}

  private folder(artifact: FeatureArtifact) {
    if (
      !isFeatureId(artifact.id) ||
      !/^[a-f0-9]{64}$/.test(artifact.sha256) ||
      !/^[0-9]+\.[0-9]+\.[0-9]+(?:-[a-zA-Z0-9.-]+)?$/.test(artifact.version)
    ) {
      throw new FeatureInstallError("storage", "Invalid feature storage identity")
    }
    return join(this.directory, artifact.version, `${artifact.id}-${artifact.sha256}`)
  }

  private async ensureVersion(artifact: FeatureArtifact) {
    this.folder(artifact)
    await privateDirectory(this.directory, true)
    const version = join(this.directory, artifact.version)
    await privateDirectory(version)
    return version
  }

  async read(artifact: FeatureArtifact) {
    const folder = this.folder(artifact)
    for (const path of [this.directory, join(this.directory, artifact.version), folder]) {
      const info = await lstat(path)
      if (!info.isDirectory() || info.isSymbolicLink())
        throw new FeatureInstallError("integrity", "Invalid feature directory")
    }
    const entries = await readdir(folder)
    if (entries.length !== artifact.files.length)
      throw new FeatureInstallError("integrity", "Unexpected files in official feature")
    const files = new Map<string, Buffer>()
    for (const file of artifact.files) {
      if (!featureFileNames(artifact.id).includes(file.name))
        throw new FeatureInstallError("integrity", "Invalid feature filename")
      files.set(file.name, await readVerifiedFile(join(folder, file.name), file))
    }
    return files
  }

  async installed(artifact: FeatureArtifact) {
    try {
      await this.read(artifact)
      return true
    } catch (error) {
      if (missing(error) || error instanceof FeatureInstallError) return false
      throw error
    }
  }

  async remove(artifact: FeatureArtifact) {
    const folder = this.folder(artifact)
    // Remove only this catalog entry; never traverse a substituted parent directory.
    for (const path of [this.directory, join(this.directory, artifact.version), folder]) {
      try {
        const info = await lstat(path)
        if (!info.isDirectory() || info.isSymbolicLink())
          throw new FeatureInstallError("storage", "Invalid feature removal directory")
      } catch (error) {
        if (missing(error)) return
        throw error
      }
    }
    await rm(folder, { recursive: true, force: true })
  }

  async publish(
    artifact: FeatureArtifact,
    files: ReadonlyMap<string, Buffer>,
    signal: AbortSignal,
  ) {
    signal.throwIfAborted()
    const version = await this.ensureVersion(artifact)
    const destination = this.folder(artifact)
    const temporary = join(version, `.install-${randomUUID()}`)
    await mkdir(temporary, { mode: 0o700 })
    let retired: string | null = null
    try {
      for (const file of artifact.files) {
        if (!featureFileNames(artifact.id).includes(file.name))
          throw new FeatureInstallError("integrity", "Invalid feature filename")
        const content = files.get(file.name)
        if (!content || featureDigest(content) !== file.sha256 || content.length !== file.size)
          throw new FeatureInstallError("integrity", "Refusing to store an unverified feature")
        signal.throwIfAborted()
        const handle = await open(join(temporary, file.name), "wx", 0o600)
        try {
          await handle.writeFile(content)
          await handle.sync()
        } finally {
          await handle.close()
        }
      }
      signal.throwIfAborted()
      if (await this.installed(artifact)) return
      try {
        const existing = await lstat(destination)
        if (!existing.isDirectory() || existing.isSymbolicLink())
          throw new FeatureInstallError("storage", "Invalid feature installation destination")
        retired = join(version, `.replaced-${randomUUID()}`)
        await rename(destination, retired)
      } catch (error) {
        if (!missing(error)) throw error
      }
      signal.throwIfAborted()
      try {
        await rename(temporary, destination)
      } catch (error) {
        if (!(await this.installed(artifact))) throw error
      }
    } finally {
      await rm(temporary, { recursive: true, force: true })
      if (retired) await rm(retired, { recursive: true, force: true })
    }
  }
}

async function readVerifiedFile(path: string, file: FeatureFile) {
  const info = await lstat(path)
  if (!info.isFile() || info.isSymbolicLink() || info.size !== file.size)
    throw new FeatureInstallError("integrity", "Invalid installed feature file")
  const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
  try {
    const current = await handle.stat()
    if (!current.isFile() || current.size !== file.size)
      throw new FeatureInstallError("integrity", "Installed feature changed before reading")
    const content = Buffer.alloc(file.size + 1)
    let offset = 0
    while (offset < content.length) {
      const { bytesRead } = await handle.read(content, offset, content.length - offset, offset)
      if (bytesRead === 0) break
      offset += bytesRead
    }
    const verified = content.subarray(0, offset)
    if (verified.length !== file.size || featureDigest(verified) !== file.sha256)
      throw new FeatureInstallError("integrity", "Installed feature checksum mismatch")
    return verified
  } finally {
    await handle.close()
  }
}
