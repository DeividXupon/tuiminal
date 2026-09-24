const MAX_DESCRIPTION_BYTES = 256 * 1024

export type PullRequestMarkdownLine = {
  kind: "blank" | "bullet" | "code" | "heading" | "quote" | "text"
  content: string
}

export function sanitizeGitHubText(value: string) {
  return value
    .normalize("NFC")
    .replace(/\p{Cc}/gu, (character) => (character === "\n" || character === "\t" ? character : ""))
}

export function boundedPullRequestDescription(value: string) {
  const sanitized = sanitizeGitHubText(value)
  const bytes = new TextEncoder().encode(sanitized)
  if (bytes.length <= MAX_DESCRIPTION_BYTES) {
    return { body: sanitized, truncated: false, byteLength: bytes.length }
  }
  const limited = new TextDecoder().decode(bytes.slice(0, MAX_DESCRIPTION_BYTES))
  return {
    body: sanitizeGitHubText(limited),
    truncated: true,
    byteLength: bytes.length,
  }
}

function safeMarkdownDestination(value: string, cache: Map<string, string>) {
  const target = value.trim()
  const cached = cache.get(target)
  if (cached !== undefined) return cached
  try {
    const url = new URL(target)
    const result = url.protocol === "https:" ? url.toString() : ""
    cache.set(target, result)
    return result
  } catch {
    cache.set(target, "")
    return ""
  }
}

function readableMarkdownInline(value: string, destinationCache: Map<string, string>) {
  let output = value
  if (output.includes("![")) {
    output = output.replace(
      /!\[([^\]\n]*)\]\(([^)\n]+)\)/g,
      (_match, alt: string) => `imagem: ${alt || "sem descrição"}`,
    )
  }
  if (output.includes("[")) {
    output = output.replace(
      /\[([^\]\n]+)\]\(([^)\n]+)\)/g,
      (_match, label: string, target: string) => {
        const safeTarget = safeMarkdownDestination(target, destinationCache)
        return safeTarget ? `${label} · ${safeTarget}` : label
      },
    )
  }
  if (output.includes("<")) output = output.replace(/<\/?[A-Za-z][^>\n]*>/g, "")
  if (output.includes("`")) output = output.replace(/`([^`\n]+)`/g, "$1")
  if (output.includes("**")) output = output.replace(/\*\*([^*\n]+)\*\*/g, "$1")
  if (output.includes("__")) output = output.replace(/__([^_\n]+)__/g, "$1")
  if (output.includes("~~")) output = output.replace(/~~([^~\n]+)~~/g, "$1")
  if (output.includes("\\")) output = output.replace(/\\([\\`*_[\]{}()#+.!~-])/g, "$1")
  return output
}

export function pullRequestMarkdownLines(value: string): PullRequestMarkdownLine[] {
  const lines: PullRequestMarkdownLine[] = []
  const destinationCache = new Map<string, string>()
  let fenced = false
  const normalizedLines = value.includes("\r") ? value.replace(/\r\n?/g, "\n") : value
  for (const sourceLine of sanitizeGitHubText(normalizedLines).split("\n")) {
    const trimmed = sourceLine.trim()
    if (/^```/.test(trimmed)) {
      fenced = !fenced
      continue
    }
    if (fenced) {
      lines.push({ kind: "code", content: `│ ${sourceLine}` })
      continue
    }
    if (!trimmed) {
      lines.push({ kind: "blank", content: " " })
      continue
    }
    const heading = trimmed.match(/^#{1,6}\s+(.+)$/)
    if (heading) {
      lines.push({
        kind: "heading",
        content: `◆ ${readableMarkdownInline(heading[1] ?? "", destinationCache)}`,
      })
      continue
    }
    const quote = trimmed.match(/^>\s?(.*)$/)
    if (quote) {
      lines.push({
        kind: "quote",
        content: `│ ${readableMarkdownInline(quote[1] ?? "", destinationCache)}`,
      })
      continue
    }
    const bullet = trimmed.match(/^(?:[-+*]|\d+[.)])\s+(.+)$/)
    if (bullet) {
      lines.push({
        kind: "bullet",
        content: `• ${readableMarkdownInline(bullet[1] ?? "", destinationCache)}`,
      })
      continue
    }
    lines.push({ kind: "text", content: readableMarkdownInline(sourceLine, destinationCache) })
  }
  return lines
}
