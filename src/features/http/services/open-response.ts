export function isSafeHttpResponseOpenType(contentType: string) {
  const normalized = contentType.toLowerCase().split(";", 1)[0]?.trim() ?? ""
  return normalized.startsWith("image/") || normalized === "application/pdf"
}

export function httpResponseOpenCommand(path: string, platform = process.platform) {
  if (platform === "darwin") return ["open", path]
  if (platform === "win32") return ["cmd", "/c", "start", "", path]
  return ["xdg-open", path]
}
