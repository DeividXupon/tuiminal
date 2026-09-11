import { randomUUID } from "node:crypto"
import { chmod, link, lstat, open, unlink } from "node:fs/promises"
import { basename, dirname, resolve } from "node:path"
import type { HttpPreparedRequest } from "../model/types"
import type { HttpCookieJar } from "./cookies"
import { fetchWithHttpRedirects } from "./redirects"
import type { HttpInsecureTlsAuthorizer } from "../model/tls-policy"
import type { HttpRedirectAuthorizer } from "../model/redirect-policy"
import { resolveSafeProjectFile } from "../../../shared/storage/project-files"

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
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined)
    throw new Error(`O download foi recusado pelo servidor com status HTTP ${response.status}.`)
  }
  const declaredBytes = Number(response.headers.get("content-length"))
  if (Number.isFinite(declaredBytes) && declaredBytes > HTTP_DOWNLOAD_MAX_BYTES) {
    await response.body?.cancel().catch(() => undefined)
    throw new Error("O download excede o limite de 256 MB.")
  }
  const stem = `${safeStem(requestName)}-completo-${now.toISOString().replace(/[:.]/g, "-")}`
  const extension = responseExtension(response.headers.get("content-type") ?? "")
  const { path, temporary, handle } = await availableHandle(root, stem, extension)
  let bytes = 0
  try {
    const reader = response.body?.getReader()
    while (reader) {
      if (combinedSignal.aborted) throw combinedSignal.reason
      const chunk = await reader.read()
      if (chunk.done) break
      if (bytes + chunk.value.length > HTTP_DOWNLOAD_MAX_BYTES) {
        await reader.cancel("O download excedeu o limite de 256 MB.")
        throw new Error("O download excede o limite de 256 MB.")
      }
      await handle.write(chunk.value)
      bytes += chunk.value.length
    }
    await handle.sync()
    await handle.close()
    await link(temporary, path)
    await chmod(path, 0o600)
    await unlink(temporary)
    return { path, bytes, status: response.status, url: response.url || request.url }
  } catch (error) {
    await handle.close().catch(() => undefined)
    await unlink(temporary).catch(() => undefined)
    throw error
  }
}
