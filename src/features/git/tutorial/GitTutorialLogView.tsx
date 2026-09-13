import { COLORS } from "../../../core/settings/theme"
import { translateUi } from "../../../shared/i18n"
import { InlineButton } from "../../../shared/ui/InlineButton"
import type { GitCommit } from "../model/types"
import { buildCommitGraph, formatGraph } from "../rendering/commit-graph"
import { GitCommitLogRow } from "../ui/base/GitCommitLogRow"

const TUTORIAL_COMMITS: GitCommit[] = [
  {
    fullHash: "ac0d327000000000000000000000000000000000",
    hash: "ac0d327",
    date: "2026-09-12",
    relativeDate: "30 hours ago",
    author: "Deivid Xupon",
    authorEmail: "deivid.silva.info@gmail.com",
    decorations: "HEAD -> development, origin/development",
    parents: [
      "91c2f06000000000000000000000000000000000",
      "36d8ab1000000000000000000000000000000000",
    ],
    subject: "Merge remote-tracking branch 'origin/pr/12'",
    body: "# Conflicts:\n#       AGENTS.md\n#       README.md",
    filesChanged: 12,
    additions: 184,
    deletions: 37,
  },
  {
    fullHash: "91c2f06000000000000000000000000000000000",
    hash: "91c2f06",
    date: "2026-09-11",
    relativeDate: "2 days ago",
    author: "Beatriz Alves",
    authorEmail: "beatriz@example.test",
    decorations: "feature/tutorial",
    parents: ["36d8ab1000000000000000000000000000000000"],
    subject: "add guided Git tutorial",
    body: "",
    filesChanged: 6,
    additions: 129,
    deletions: 18,
  },
  {
    fullHash: "36d8ab1000000000000000000000000000000000",
    hash: "36d8ab1",
    date: "2026-09-10",
    relativeDate: "2 days ago",
    author: "Deivid Xupon",
    authorEmail: "deivid.silva.info@gmail.com",
    decorations: "main, tag: v0.8.0",
    parents: [],
    subject: "create local Git workspace",
    body: "",
    filesChanged: 24,
    additions: 642,
    deletions: 91,
  },
]

const TUTORIAL_GRAPH = buildCommitGraph(TUTORIAL_COMMITS)
const TUTORIAL_GRAPH_WIDTH = Math.min(
  8,
  Math.max(3, ...TUTORIAL_GRAPH.map((row) => formatGraph(row.graph).length)),
)

export function TutorialGitLogView({ width, onPress }: { width: number; onPress: () => void }) {
  return (
    <box
      id="tutorial-git-open-log"
      style={{
        flexGrow: 1,
        flexShrink: 1,
        overflow: "hidden",
        backgroundColor: COLORS.panel,
      }}
    >
      <box
        style={{
          height: 1,
          flexShrink: 0,
          flexDirection: "row",
          justifyContent: "space-between",
          backgroundColor: COLORS.panelRaised,
          paddingLeft: 1,
          paddingRight: 1,
        }}
      >
        <text
          content={translateUi("HISTÓRICO DE COMMITS · TODOS OS BRANCHES")}
          style={{ fg: COLORS.git }}
        />
        <text content="1/3  [J/K/↑/↓]" style={{ fg: COLORS.muted }} />
      </box>
      {TUTORIAL_COMMITS.map((commit, index) => (
        <GitCommitLogRow
          key={commit.fullHash}
          id={`tutorial-git-log-row-${index}`}
          commit={commit}
          graph={TUTORIAL_GRAPH[index]?.graph ?? "*"}
          graphWidth={TUTORIAL_GRAPH_WIDTH}
          width={width}
          selected={index === 0}
          onPress={onPress}
        />
      ))}
    </box>
  )
}

export function TutorialLogActions({ onPress }: { onPress: () => void }) {
  return (
    <box
      style={{
        height: 1,
        flexShrink: 0,
        flexDirection: "row",
        backgroundColor: COLORS.panelRaised,
      }}
    >
      <InlineButton label={translateUi("[K/↑] Anterior")} accent={COLORS.git} onPress={onPress} />
      <InlineButton label={translateUi("[J/↓] Próximo")} accent={COLORS.git} onPress={onPress} />
      <InlineButton label="[Enter] Abrir commit" accent={COLORS.git} onPress={onPress} />
      <InlineButton label={translateUi("[D] Diff")} accent={COLORS.git} onPress={onPress} />
      <InlineButton label={translateUi("[G] Árvore")} accent={COLORS.database} onPress={onPress} />
    </box>
  )
}
