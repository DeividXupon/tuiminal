import type { GitCommit } from "../model/types"
import { runGitCommand } from "./git-command"

function sanitizeCommitText(value: string) {
  let safe = ""
  for (const character of value.normalize("NFC")) {
    const code = character.codePointAt(0) ?? 0
    if (character === "\n" || character === "\t") safe += character
    else if (code >= 0x20 && code !== 0x7f && !(code >= 0x80 && code <= 0x9f)) safe += character
  }
  return safe
}

function parseCommits(output: string): GitCommit[] {
  return output
    .split("\x1e")
    .filter((entry) => entry.includes("\0"))
    .map((entry) => {
      const separator = entry.indexOf("\0")
      const metadata = entry.slice(0, separator).replace(/^\n+/, "")
      const statLines = entry.slice(separator + 1).split("\n")
      const [
        fullHash = "",
        hash = "",
        date = "",
        relativeDate = "",
        author = "",
        authorEmail = "",
        decorations = "",
        parentList = "",
        subject = "",
        body = "",
      ] = metadata.split("\x1f")
      let filesChanged = 0
      let additions = 0
      let deletions = 0

      for (const line of statLines) {
        const [added, deleted] = line.split("\t")
        if (/^(?:\d+|-)$/.test(added ?? "") && /^(?:\d+|-)$/.test(deleted ?? "")) {
          filesChanged += 1
        }
        if (/^\d+$/.test(added ?? "")) additions += Number(added)
        if (/^\d+$/.test(deleted ?? "")) deletions += Number(deleted)
      }

      return {
        fullHash,
        hash,
        date,
        relativeDate,
        author: sanitizeCommitText(author),
        authorEmail: sanitizeCommitText(authorEmail),
        decorations,
        parents: parentList ? parentList.split(" ") : [],
        subject: sanitizeCommitText(subject),
        body: sanitizeCommitText(body).slice(0, 8_192),
        filesChanged,
        additions,
        deletions,
      }
    })
}

export async function loadGitCommitHistory(root: string): Promise<GitCommit[]> {
  const result = await runGitCommand(root, [
    "log",
    "--all",
    "--topo-order",
    "-32",
    "--date=short",
    "--decorate=short",
    "--numstat",
    "--pretty=format:%x1e%H%x1f%h%x1f%ad%x1f%ar%x1f%an%x1f%ae%x1f%D%x1f%P%x1f%s%x1f%b%x00",
  ])
  return result.exitCode === 0 ? parseCommits(result.stdout) : []
}
