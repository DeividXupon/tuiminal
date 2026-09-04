import type { GitCommit, GitSnapshot } from "../services/git"
import { fillLine } from "./diff"

export function commitTitle(commit: GitCommit, selected: boolean, width: number) {
  const marker = selected ? "◆" : commit.parents.length > 1 ? "◉" : "●"
  return fillLine(`${marker} ${commit.hash}  ${commit.subject}`, width)
}

export function gitSnapshotSignature(snapshot: GitSnapshot) {
  const files = snapshot.files
    .map((file) => `${file.path}\0${file.indexStatus}${file.worktreeStatus}`)
    .join("\x1e")
  const commits = snapshot.commits
    .map((commit) => `${commit.fullHash}\0${commit.decorations}`)
    .join("\x1e")
  return [
    snapshot.isRepository,
    snapshot.root,
    snapshot.branch,
    snapshot.upstream,
    snapshot.ahead,
    snapshot.behind,
    files,
    commits,
  ].join("\x1f")
}
