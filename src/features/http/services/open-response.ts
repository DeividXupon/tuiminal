const SAFE_RASTER_SIGNATURES: Readonly<Record<string, (body: Uint8Array) => boolean>> = {
  "image/bmp": (body) => body[0] === 0x42 && body[1] === 0x4d,
  "image/gif": (body) =>
    body.length >= 6 &&
    new TextDecoder("ascii").decode(body.subarray(0, 6)).match(/^GIF8[79]a$/) !== null,
  "image/jpeg": (body) => body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff,
  "image/png": (body) =>
    body.length >= 8 &&
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, index) => body[index] === byte),
  "image/webp": (body) =>
    body.length >= 12 &&
    new TextDecoder("ascii").decode(body.subarray(0, 4)) === "RIFF" &&
    new TextDecoder("ascii").decode(body.subarray(8, 12)) === "WEBP",
}

/**
 * Opening invokes a desktop handler outside Tuiminal's sandbox. Keep the allowlist
 * deliberately smaller than every `image/*`: SVG, PDF and MIME-only claims may
 * contain active content or select a surprising application.
 */
export function isSafeHttpResponseOpenType(contentType: string, body: Uint8Array) {
  const normalized = contentType.toLowerCase().split(";", 1)[0]?.trim() ?? ""
  return SAFE_RASTER_SIGNATURES[normalized]?.(body) ?? false
}

export function httpResponseOpenCommand(path: string, platform = process.platform) {
  if (platform === "darwin") return ["open", path]
  if (platform === "win32") return ["cmd", "/c", "start", "", path]
  return ["xdg-open", path]
}
