import { COLORS } from "../../../core/settings/theme"
import type { PullRequestMarkdownLine } from "../model/pr/content"

function keyedMarkdownLines(lines: PullRequestMarkdownLine[]) {
  const occurrences = new Map<string, number>()
  return lines.map((line) => {
    const identity = `${line.kind}\0${line.content}`
    const occurrence = (occurrences.get(identity) ?? 0) + 1
    occurrences.set(identity, occurrence)
    return { key: `${identity}\0${occurrence}`, line }
  })
}

export function PullRequestMarkdown({ lines }: { lines: PullRequestMarkdownLine[] }) {
  return (
    <box style={{ width: "100%" }}>
      {keyedMarkdownLines(lines).map(({ key, line }) => (
        <text
          key={key}
          content={line.content}
          style={{
            fg:
              line.kind === "heading"
                ? COLORS.git
                : line.kind === "code"
                  ? COLORS.warning
                  : line.kind === "quote"
                    ? COLORS.muted
                    : COLORS.text,
            ...(line.kind === "code" ? { bg: COLORS.panelRaised } : {}),
          }}
        />
      ))}
    </box>
  )
}
