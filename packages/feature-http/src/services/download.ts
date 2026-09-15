import { randomUUID } from "node:crypto"
import { type FileHandle, link, lstat, open, unlink } from "node:fs/promises"
import { basename, dirname, resolve } from "node:path"
import type { HttpPreparedRequest } from "../model/types"
import type { HttpCookieJar } from "./cookies"
import { fetchWithHttpRedirects } from "./redirects"
import type { HttpInsecureTlsAuthorizer } from "../model/tls-policy"
import type { HttpRedirectAuthorizer } from "../model/redirect-policy"
import { resolveSafeProjectFile } from "@xupon/tuiminal-core/storage/project-files"

export const HTTP_DOWNLOAD_MAX_BYTES = 256 * 1024 * 1024

function safeStem(value: string) {
  return (
    value
      .normalize("NFKD")
      .replace(/[^\w.-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "response"
  )
}

function responseExtension(contentType: string) {
  const normalized = contentType.toLowerCase()
  if (normalized.includes("json")) return "json"
  if (normalized.includes("xml")) return "xml"
  if (normalized.includes("html")) return "html"
  if (normalized.startsWith("text/")) return "txt"
  const subtype = normalized.split(";")[0]?.split("/")[1]?.trim()
  return subtype && /^[a-z0-9.+-]{1,16}$/.test(subtype) ? subtype.replace(/^x-/, "") : "bin"
}

async function availableHandle(root: string, stem: string, extension: string) {
  for (let suffix = 0; suffix < 1_000; suffix += 1) {
    const name = `${stem}${suffix ? `-${suffix + 1}` : ""}.${extension}`
    const path = (
      await resolveSafeProjectFile(root, `tuiminal-exports/http/${name}`, {
        createParents: true,
        allowMissing: true,
      })
    ).path
    try {
      await lstat(path)
      continue
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
    }
    const temporary = resolve(dirname(path), `.${basename(path)}.${randomUUID()}.part`)
    try {
      return { path, temporary, handle: await open(temporary, "wx", 0o600) }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error
    }
  }
  throw new Error("Não foi possível escolher um nome livre para o download.")
}

async function writeChunk(handle: FileHandle, chunk: Uint8Array, signal: AbortSignal) {
  let offset = 0
  while (offset < chunk.length) {
    signal.throwIfAborted()
    const { bytesWritten } = await handle.write(chunk, offset, chunk.length - offset)
    if (bytesWritten <= 0) throw new Error("Não foi possível gravar o download completo.")
    offset += bytesWritten
  }
}

async function writeBody(
  reader: ReadableStreamDefaultReader<Uint8Array> | undefined,
  handle: FileHandle,
  signal: AbortSignal,
) {
  let bytes = 0
  while (reader) {
    signal.throwIfAborted()
    const chunk = await reader.read()
    signal.throwIfAborted()
    if (chunk.done) break
    if (bytes + chunk.value.length > HTTP_DOWNLOAD_MAX_BYTES) {
      throw new Error("O download excede o limite de 256 MB.")
    }
    await writeChunk(handle, chunk.value, signal)
    bytes += chunk.value.length
  }
  return bytes
}

async function saveDownloadedResponse(
  response: Response,
  root: string,
  requestName: string,
  signal: AbortSignal,
  now: Date,
) {
  const reader = response.body?.getReader()
  let file: Awaited<ReturnType<typeof availableHandle>> | undefined
  try {
    signal.throwIfAborted()
    if (!response.ok) {
      throw new Error(`O download foi recusado pelo servidor com status HTTP ${response.status}.`)
    }
    const declaredBytes = Number(response.headers.get("content-length"))
    if (Number.isFinite(declaredBytes) && declaredBytes > HTTP_DOWNLOAD_MAX_BYTES) {
      throw new Error("O download excede o limite de 256 MB.")
    }
    const stem = `${safeStem(requestName)}-completo-${now.toISOString().replace(/[:.]/g, "-")}`
    const extension = responseExtension(response.headers.get("content-type") ?? "")
    file = await availableHandle(root, stem, extension)
    const bytes = await writeBody(reader, file.handle, signal)
    await file.handle.sync()
    await file.handle.close()
    signal.throwIfAborted()
    // Linking publishes the complete file without overwriting a concurrent export.
    // The link inherits the temporary file's 0600 mode; no path-based chmod is needed.
    await link(file.temporary, file.path)
    await unlink(file.temporary)
    return { path: file.path, bytes }
  } catch (error) {
    if (file) {
      await file.handle.close().catch(() => undefined)
      await unlink(file.temporary).catch(() => undefined)
    }
    throw error
  } finally {
    if (reader) {
      await reader.cancel().catch(() => undefined)
      reader.releaseLock()
    }
  }
}

export async function downloadCompleteHttpResponse({
  root,
  requestName,
  request,
  signal,
  cookieJar,
  authorizeInsecureTls = false,
  authorizeRedirect,
  now = new Date(),
}: {
  root: string
  requestName: string
  request: HttpPreparedRequest
  signal: AbortSignal
  cookieJar?: HttpCookieJar
  authorizeInsecureTls?: HttpInsecureTlsAuthorizer
  authorizeRedirect?: HttpRedirectAuthorizer
  now?: Date
}) {
  if (request.method.toUpperCase() !== "GET") {
    throw new Error("O download completo só pode reenviar requests GET com segurança.")
  }
  const timeoutSignal = AbortSignal.timeout(request.timeoutMs)
  const combinedSignal = AbortSignal.any([signal, timeoutSignal])
  const { response } = await fetchWithHttpRedirects(
    request,
    combinedSignal,
    fetch,
    10,
    cookieJar,
    authorizeInsecureTls,
    undefined,
    authorizeRedirect,
  )
  const saved = await saveDownloadedResponse(response, root, requestName, combinedSignal, now)
  return { ...saved, status: response.status, url: response.url || request.url }
}
