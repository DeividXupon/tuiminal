import { createHash, randomUUID } from "node:crypto"
import {
  chmod,
  lstat,
  link,
  mkdir,
  open,
  readFile,
  realpath,
  rename,
  stat,
  unlink,
} from "node:fs/promises"
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path"

export class ProjectFileSafetyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ProjectFileSafetyError"
  }
}

function missing(error: unknown) {
  return (error as NodeJS.ErrnoException | undefined)?.code === "ENOENT"
}

function inside(root: string, candidate: string) {
  return candidate === root || candidate.startsWith(`${root}${sep}`)
}

export function projectFileHash(source: string | Uint8Array) {
  return createHash("sha256").update(source).digest("hex")
}

async function checkedProjectRoot(root: string) {
  const canonical = await realpath(root)
  const info = await stat(canonical)
  if (!info.isDirectory()) throw new ProjectFileSafetyError("A raiz do projeto é inválida.")
  return canonical
}

async function ensureDirectory(root: string, directory: string, create: boolean) {
  const relativeDirectory = relative(root, directory)
  if (relativeDirectory.startsWith("..") || isAbsolute(relativeDirectory)) {
    throw new ProjectFileSafetyError("O destino precisa permanecer dentro do projeto.")
  }
  let current = root
  for (const part of relativeDirectory.split(sep).filter(Boolean)) {
    current = resolve(current, part)
    try {
      const info = await lstat(current)
      if (info.isSymbolicLink() || !info.isDirectory()) {
        throw new ProjectFileSafetyError(
          "O destino não pode atravessar symlinks ou arquivos no projeto.",
        )
      }
    } catch (error) {
      if (!missing(error)) throw error
      if (!create) throw error
      await mkdir(current, { mode: 0o700 })
      const created = await lstat(current)
      if (created.isSymbolicLink() || !created.isDirectory()) {
        throw new ProjectFileSafetyError("O diretório criado não é seguro.")
      }
    }
  }
  const canonicalDirectory = await realpath(directory)
  if (!inside(root, canonicalDirectory)) {
    throw new ProjectFileSafetyError("O destino resolveu para fora do projeto.")
  }
  return canonicalDirectory
}

export async function resolveSafeProjectFile(
  root: string,
  relativePath: string,
  options: { createParents?: boolean; allowMissing?: boolean } = {},
) {
  const canonicalRoot = await checkedProjectRoot(root)
  const target = resolve(canonicalRoot, relativePath)
  if (!inside(canonicalRoot, target)) {
    throw new ProjectFileSafetyError("O arquivo precisa permanecer dentro do projeto.")
  }
  const parent = await ensureDirectory(
    canonicalRoot,
    dirname(target),
    Boolean(options.createParents),
  )
  const safeTarget = resolve(parent, basename(target))
  if (!inside(canonicalRoot, safeTarget)) {
    throw new ProjectFileSafetyError("O arquivo resolveu para fora do projeto.")
  }
  try {
    const info = await lstat(safeTarget)
    if (info.isSymbolicLink() || !info.isFile()) {
      throw new ProjectFileSafetyError("O destino precisa ser um arquivo regular.")
    }
  } catch (error) {
    if (!missing(error) || !options.allowMissing) throw error
  }
  return {
    root: canonicalRoot,
    path: safeTarget,
    relativePath: relative(canonicalRoot, safeTarget),
  }
}

export async function removeSafeProjectFile(
  root: string,
  relativePath: string,
  expectedHash?: string,
) {
  const resolved = await resolveSafeProjectFile(root, relativePath)
  if (expectedHash !== undefined) {
    const current = await readFile(resolved.path)
    if (projectFileHash(current) !== expectedHash) {
      throw new ProjectFileSafetyError("O arquivo mudou antes de ser removido.")
    }
  }
  await unlink(resolved.path)
}

export async function atomicWriteProjectFile(
  root: string,
  relativePath: string,
  content: string | Uint8Array,
  options: { expectedHash?: string | null; exclusive?: boolean; mode?: number } = {},
) {
  const mode = options.mode ?? 0o600
  const resolved = await resolveSafeProjectFile(root, relativePath, {
    createParents: true,
    allowMissing: true,
  })
  const parent = dirname(resolved.path)
  const parentBefore = await stat(parent)
  const current = await readFile(resolved.path).catch((error) => {
    if (missing(error)) return null
    throw error
  })
  if (options.exclusive && current) {
    throw new ProjectFileSafetyError("O destino passou a existir; escolha outro nome.")
  }
  if (
    options.expectedHash !== undefined &&
    (current ? projectFileHash(current) : null) !== options.expectedHash
  ) {
    throw new ProjectFileSafetyError("O arquivo mudou fora do Tuiminal; reabra-o antes de salvar.")
  }
  const temporary = resolve(parent, `.${randomUUID()}.tuiminal.tmp`)
  const handle = await open(temporary, "wx", mode)
  try {
    await handle.writeFile(content)
    await handle.sync()
    await handle.close()
    const checked = await resolveSafeProjectFile(root, resolved.relativePath, {
      allowMissing: true,
    })
    const parentAfter = await stat(dirname(checked.path))
    if (parentBefore.dev !== parentAfter.dev || parentBefore.ino !== parentAfter.ino) {
      throw new ProjectFileSafetyError("O diretório de destino mudou durante a gravação.")
    }
    const latest = await readFile(checked.path).catch((error) => {
      if (missing(error)) return null
      throw error
    })
    if (
      options.expectedHash !== undefined &&
      (latest ? projectFileHash(latest) : null) !== options.expectedHash
    ) {
      throw new ProjectFileSafetyError("O arquivo mudou durante a gravação.")
    }
    if (options.exclusive) {
      await link(temporary, checked.path)
      await unlink(temporary)
    } else {
      await rename(temporary, checked.path)
    }
    await chmod(checked.path, mode)
    const directoryHandle = await open(parent, "r")
    try {
      await directoryHandle.sync()
    } finally {
      await directoryHandle.close()
    }
    return checked.path
  } catch (error) {
    await handle.close().catch(() => undefined)
    await unlink(temporary).catch(() => undefined)
    throw error
  }
}
