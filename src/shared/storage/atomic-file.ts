import { createHash, randomUUID } from "node:crypto"
import {
  chmodSync,
  closeSync,
  copyFileSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs"
import { dirname, parse, resolve } from "node:path"

export class AtomicFileConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "AtomicFileConflictError"
  }
}

export function fileContentHash(content: string | Uint8Array) {
  return createHash("sha256").update(content).digest("hex")
}

export function currentFileHash(path: string) {
  try {
    const info = lstatSync(path)
    if (info.isSymbolicLink() || !info.isFile()) {
      throw new AtomicFileConflictError("O destino precisa ser um arquivo regular.")
    }
    return fileContentHash(readFileSync(path))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null
    throw error
  }
}

function ensureSafeParent(path: string) {
  const parent = dirname(resolve(path))
  const root = parse(parent).root
  let current = root
  const parts = parent.slice(root.length).split(/[\\/]/).filter(Boolean)
  for (const [index, part] of parts.entries()) {
    current = resolve(current, part)
    if (!existsSync(current)) mkdirSync(current, { mode: 0o700 })
    const info = lstatSync(current)
    if (info.isSymbolicLink() && index === 0) {
      // macOS exposes system-owned root aliases such as /var -> /private/var
      // and /tmp -> /private/tmp. Canonicalize only that trusted root-level
      // component; application-controlled symlinks deeper in the path remain
      // forbidden.
      current = realpathSync(current)
      if (lstatSync(current).isDirectory()) continue
    }
    if (info.isSymbolicLink() || !info.isDirectory()) {
      throw new AtomicFileConflictError(
        "O destino não pode atravessar symlinks ou arquivos de configuração.",
      )
    }
  }
  return parent
}

export function atomicWriteFileSync(
  path: string,
  content: string | Uint8Array,
  options: {
    expectedHash?: string | null
    mode?: number
    backup?: boolean
  } = {},
) {
  const target = resolve(path)
  const parent = ensureSafeParent(target)
  const mode = options.mode ?? 0o600
  const currentHash = currentFileHash(target)
  if (options.expectedHash !== undefined && currentHash !== options.expectedHash) {
    throw new AtomicFileConflictError(
      "O arquivo mudou em outra instância; recarregue antes de salvar.",
    )
  }

  const temporary = resolve(parent, `.${randomUUID()}.tuiminal.tmp`)
  const descriptor = openSync(temporary, "wx", mode)
  try {
    writeFileSync(descriptor, content)
    fsyncSync(descriptor)
    closeSync(descriptor)
    if (currentFileHash(target) !== currentHash) {
      throw new AtomicFileConflictError("O arquivo mudou durante a gravação.")
    }
    if (options.backup && currentHash !== null) {
      const backupTemporary = `${target}.${randomUUID()}.backup.tmp`
      copyFileSync(target, backupTemporary)
      chmodSync(backupTemporary, mode)
      renameSync(backupTemporary, `${target}.bak`)
    }
    renameSync(temporary, target)
    chmodSync(target, mode)
    const directoryDescriptor = openSync(parent, "r")
    try {
      fsyncSync(directoryDescriptor)
    } finally {
      closeSync(directoryDescriptor)
    }
  } catch (error) {
    try {
      closeSync(descriptor)
    } catch {
      // The file was already closed before the final checks.
    }
    try {
      unlinkSync(temporary)
    } catch {
      // The temporary file may already have been renamed.
    }
    throw error
  }
  return fileContentHash(content)
}
