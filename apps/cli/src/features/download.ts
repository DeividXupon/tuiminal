import { createHash } from "node:crypto"
import { createReadStream } from "node:fs"
import { gunzipSync } from "node:zlib"
import { fileURLToPath } from "node:url"
import {
  FeatureInstallError,
  MAX_FEATURE_EXPANDED,
  type FeatureArtifact,
  type FeaturePayload,
} from "./model"

export type FeatureProgress = { received: number; total: number }
export type FeatureDownloadOptions = {
  signal: AbortSignal
  onProgress?: (progress: FeatureProgress) => void
  allowLocalFiles?: boolean
  fetch?: typeof fetch
}

export function featureDigest(content: Uint8Array) {
  return createHash("sha256").update(content).digest("hex")
}

export function decodeFeaturePayload(archive: Uint8Array, artifact: FeatureArtifact) {
  if (archive.byteLength !== artifact.size || featureDigest(archive) !== artifact.sha256) {
    throw new FeatureInstallError("integrity", "Official feature download checksum mismatch")
  }
  let payload: FeaturePayload
  try {
    payload = JSON.parse(
      gunzipSync(archive, { maxOutputLength: MAX_FEATURE_EXPANDED }).toString("utf8"),
    ) as FeaturePayload
  } catch {
    throw new FeatureInstallError("integrity", "Invalid official feature archive")
  }
  if (
    !payload ||
    payload.schema !== 1 ||
    payload.id !== artifact.id ||
    payload.version !== artifact.version ||
    !payload.files ||
    typeof payload.files !== "object" ||
    Array.isArray(payload.files) ||
    Object.keys(payload.files).length !== artifact.files.length
  ) {
    throw new FeatureInstallError("integrity", "Official feature identity mismatch")
  }
  const files = new Map<string, Buffer>()
  for (const file of artifact.files) {
    const encoded = Object.hasOwn(payload.files, file.name) ? payload.files[file.name] : undefined
    if (typeof encoded !== "string" || encoded.length !== 4 * Math.ceil(file.size / 3)) {
      throw new FeatureInstallError("integrity", "Official feature file is incomplete")
    }
    const content = Buffer.from(encoded, "base64")
    if (
      content.length !== file.size ||
      content.toString("base64") !== encoded ||
      featureDigest(content) !== file.sha256
    ) {
      throw new FeatureInstallError("integrity", "Official feature file checksum mismatch")
    }
    files.set(file.name, content)
  }
  return files
}

async function responseStream(
  url: URL,
  options: FeatureDownloadOptions,
  redirects = 0,
): Promise<{ chunks: AsyncIterable<Uint8Array>; close: () => unknown }> {
  if (url.protocol === "file:" && options.allowLocalFiles) {
    const stream = createReadStream(fileURLToPath(url), { signal: options.signal })
    return { chunks: stream as AsyncIterable<Uint8Array>, close: () => stream.destroy() }
  }
  if (
    url.protocol !== "https:" &&
    !(url.protocol === "http:" && ["127.0.0.1", "[::1]", "localhost"].includes(url.hostname))
  ) {
    throw new FeatureInstallError("network", "Official downloads require HTTPS")
  }
  if (url.username || url.password)
    throw new FeatureInstallError("network", "Download URL cannot contain credentials")
  const response = await (options.fetch ?? fetch)(url, {
    signal: options.signal,
    redirect: "manual",
    credentials: "omit",
  })
  if ([301, 302, 303, 307, 308].includes(response.status)) {
    await response.body?.cancel()
    const location = response.headers.get("location")
    if (!location || redirects >= 5)
      throw new FeatureInstallError("network", "Invalid official download redirect")
    const next = new URL(location, url)
    if (next.protocol !== "https:" && next.origin !== url.origin)
      throw new FeatureInstallError("network", "Unsafe official download redirect")
    return responseStream(next, options, redirects + 1)
  }
  if (!response.ok || !response.body) {
    await response.body?.cancel()
    throw new FeatureInstallError(
      "network",
      `Official feature download failed (HTTP ${response.status})`,
    )
  }
  const reader = response.body.getReader()
  async function* chunks() {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      yield next.value
    }
  }
  return {
    chunks: chunks(),
    close: async () => {
      await reader.cancel().catch(() => undefined)
      reader.releaseLock()
    },
  }
}

export async function downloadFeature(
  artifact: FeatureArtifact,
  url: URL,
  options: FeatureDownloadOptions,
) {
  options.signal.throwIfAborted()
  const source = await responseStream(url, options)
  const chunks: Uint8Array[] = []
  let received = 0
  try {
    for await (const chunk of source.chunks) {
      options.signal.throwIfAborted()
      received += chunk.byteLength
      if (received > artifact.size)
        throw new FeatureInstallError(
          "integrity",
          "Official feature download exceeded its declared size",
        )
      chunks.push(chunk)
      options.onProgress?.({ received, total: artifact.size })
    }
    options.signal.throwIfAborted()
    return decodeFeaturePayload(Buffer.concat(chunks, received), artifact)
  } finally {
    await source.close()
  }
}
