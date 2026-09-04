const MAX_DESCRIPTION_BYTES = 256 * 1024

export type PullRequestMarkdownLine = {
  kind: "blank" | "bullet" | "code" | "heading" | "quote" | "text"
  content: string
}

export function sanitizeGitHubText(value: string) {
  let output = ""
  for (const character of value.normalize("NFC")) {
    const code = character.codePointAt(0) ?? 0
    if (character === "\n" || character === "\t") output += character
    else if (code >= 0x20 && code !== 0x7f && !(code >= 0x80 && code <= 0x9f)) output += character
  }
  return output
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

function safeMarkdownDestination(value: string) {
  try {
    const url = new URL(value.trim())
    return url.protocol === "https:" ? url.toString() : ""
  } catch {
    return ""
  }
}

function readableMarkdownInline(value: string) {
  return value
    .replace(
      /!\[([^\]\n]*)\]\(([^)\n]+)\)/g,
      (_match, alt: string) => `imagem: ${alt || "sem descrição"}`,
    )
    .replace(/\[([^\]\n]+)\]\(([^)\n]+)\)/g, (_match, label: string, target: string) => {
      const safeTarget = safeMarkdownDestination(target)
      return safeTarget ? `${label} · ${safeTarget}` : label
    })
    .replace(/<\/?[A-Za-z][^>\n]*>/g, "")
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/__([^_\n]+)__/g, "$1")
    .replace(/~~([^~\n]+)~~/g, "$1")
    .replace(/\\([\\`*_[\]{}()#+.!~-])/g, "$1")
}

export function pullRequestMarkdownLines(value: string): PullRequestMarkdownLine[] {
  const lines: PullRequestMarkdownLine[] = []
  let fenced = false
  for (const sourceLine of sanitizeGitHubText(value.replace(/\r\n?/g, "\n")).split("\n")) {
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
      lines.push({ kind: "heading", content: `◆ ${readableMarkdownInline(heading[1] ?? "")}` })
      continue
    }
    const quote = trimmed.match(/^>\s?(.*)$/)
    if (quote) {
      lines.push({ kind: "quote", content: `│ ${readableMarkdownInline(quote[1] ?? "")}` })
      continue
    }
    const bullet = trimmed.match(/^(?:[-+*]|\d+[.)])\s+(.+)$/)
    if (bullet) {
      lines.push({ kind: "bullet", content: `• ${readableMarkdownInline(bullet[1] ?? "")}` })
      continue
    }
    lines.push({ kind: "text", content: readableMarkdownInline(sourceLine) })
  }
  return lines
}
