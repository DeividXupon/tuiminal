import { atomicWriteFileSync } from "@xupon/tuiminal-core/storage/atomic-file"
import { closeSync, constants, fstatSync, lstatSync, openSync, readSync, unlinkSync } from "node:fs"
import { join } from "node:path"
import { httpWorkspaceDirectory } from "../services/context"

export const POSTMAN_LOCAL_ACCOUNT_FILE = "postman-account.json"
const MAX_ACCOUNT_BYTES = 16_384

function localPath(root = httpWorkspaceDirectory()) {
  return join(root, POSTMAN_LOCAL_ACCOUNT_FILE)
}

function missing(error: unknown) {
  return (error as NodeJS.ErrnoException)?.code === "ENOENT"
}

export class PostmanLocalAccountError extends Error {
  constructor() {
    super("Não foi possível acessar o arquivo local da conta Postman.")
  }
}

function storageError() {
  return new PostmanLocalAccountError()
}

export function readLocalPostmanAccount(root?: string): { account: unknown } | undefined {
  let descriptor: number | undefined
  try {
    const path = localPath(root)
    if (!lstatSync(path).isFile()) throw storageError()
    descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
    const info = fstatSync(descriptor)
    if (!info.isFile() || info.size > MAX_ACCOUNT_BYTES) throw storageError()
    const buffer = Buffer.alloc(MAX_ACCOUNT_BYTES + 1)
    const length = readSync(descriptor, buffer)
    if (length > MAX_ACCOUNT_BYTES) throw storageError()
    const record: unknown = JSON.parse(buffer.subarray(0, length).toString("utf8"))
    if (
      !record ||
      typeof record !== "object" ||
      !("schema" in record) ||
      record.schema !== 1 ||
      !("account" in record)
    ) {
      throw storageError()
    }
    return { account: record.account }
  } catch (error) {
    if (missing(error)) return undefined
    throw storageError()
  } finally {
    if (descriptor !== undefined) closeSync(descriptor)
  }
}

// Only the explicitly confirmed CLI fallback writes credentials here. A null
// account records logout while an older OS credential cannot be removed.
export function writeLocalPostmanAccount(account: unknown, root?: string) {
  try {
    atomicWriteFileSync(localPath(root), `${JSON.stringify({ schema: 1, account })}\n`, {
      mode: 0o600,
      backup: false,
    })
  } catch {
    throw storageError()
  }
}

export function removeLocalPostmanAccount(root?: string) {
  try {
    const path = localPath(root)
    if (!lstatSync(path).isFile()) throw storageError()
    unlinkSync(path)
  } catch (error) {
    if (!missing(error)) throw storageError()
  }
}
