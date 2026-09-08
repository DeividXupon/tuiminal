import { chmod, mkdir, open, unlink } from "node:fs/promises"
import { resolve } from "node:path"
import type { HttpPreparedRequest } from "../model/types"
import type { HttpCookieJar } from "./cookies"
import { fetchWithHttpRedirects } from "./redirects"
import type { HttpInsecureTlsAuthorizer } from "../model/tls-policy"

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

async function availableHandle(directory: string, stem: string, extension: string) {
  for (let suffix = 0; suffix < 1_000; suffix += 1) {
    const path = resolve(directory, `${stem}${suffix ? `-${suffix + 1}` : ""}.${extension}`)
    try {
      return { path, handle: await open(path, "wx", 0o600) }
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
  now = new Date(),
}: {
  root: string
  requestName: string
  request: HttpPreparedRequest
  signal: AbortSignal
  cookieJar?: HttpCookieJar
  authorizeInsecureTls?: HttpInsecureTlsAuthorizer
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
  )
  const directory = resolve(root, "tuiminal-exports", "http")
  await mkdir(directory, { recursive: true, mode: 0o700 })
  await chmod(directory, 0o700)
  const stem = `${safeStem(requestName)}-completo-${now.toISOString().replace(/[:.]/g, "-")}`
  const extension = responseExtension(response.headers.get("content-type") ?? "")
  const { path, handle } = await availableHandle(directory, stem, extension)
  let bytes = 0
  try {
    const reader = response.body?.getReader()
    while (reader) {
      if (combinedSignal.aborted) throw combinedSignal.reason
      const chunk = await reader.read()
      if (chunk.done) break
      await handle.write(chunk.value)
      bytes += chunk.value.length
    }
    await handle.sync()
    await handle.close()
    return { path, bytes, status: response.status, url: response.url || request.url }
  } catch (error) {
    await handle.close().catch(() => undefined)
    await unlink(path).catch(() => undefined)
    throw error
  }
}
