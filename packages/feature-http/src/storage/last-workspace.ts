import { closeSync, constants, fstatSync, lstatSync, openSync, readSync } from "node:fs"
import { join } from "node:path"
import { atomicWriteFileSync } from "@xupon/tuiminal-core/storage/atomic-file"
import { httpWorkspaceDirectory } from "../services/context"

export type HttpLastWorkspace =
  | { source: "local" }
  | { source: "postman"; workspaceId: string; environmentId?: string }

export const HTTP_LAST_WORKSPACE_FILE = "last-workspace.json"
const validId = (value: unknown): value is string =>
  typeof value === "string" && /^[\w-]{1,128}$/u.test(value)

export function readHttpLastWorkspace(root = httpWorkspaceDirectory()): HttpLastWorkspace {
  let descriptor: number | undefined
  try {
    const path = join(root, HTTP_LAST_WORKSPACE_FILE)
    if (!lstatSync(path).isFile()) return { source: "local" }
    descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
    const info = fstatSync(descriptor)
    if (!info.isFile() || info.size > 4096) return { source: "local" }
    const buffer = Buffer.alloc(4097)
    const length = readSync(descriptor, buffer)
    if (length > 4096) return { source: "local" }
    const value = JSON.parse(buffer.subarray(0, length).toString("utf8"))
    if (
      value?.schema === 1 &&
      value.source === "postman" &&
      validId(value.workspaceId) &&
      (value.environmentId === undefined || validId(value.environmentId))
    ) {
      return {
        source: "postman",
        workspaceId: value.workspaceId,
        ...(value.environmentId ? { environmentId: value.environmentId } : {}),
      }
    }
  } catch {
    // Missing or unreadable preferences must not block source selection.
  } finally {
    if (descriptor !== undefined) closeSync(descriptor)
  }
  return { source: "local" }
}

export function saveHttpLastWorkspace(value: HttpLastWorkspace, root = httpWorkspaceDirectory()) {
  const selection =
    value.source === "local"
      ? { source: "local" }
      : { source: "postman", workspaceId: value.workspaceId, environmentId: value.environmentId }
  try {
    atomicWriteFileSync(
      join(root, HTTP_LAST_WORKSPACE_FILE),
      `${JSON.stringify({ schema: 1, ...selection })}\n`,
    )
    return true
  } catch {
    // Remembering a selection is best effort; the opened session remains usable.
    return false
  }
}
