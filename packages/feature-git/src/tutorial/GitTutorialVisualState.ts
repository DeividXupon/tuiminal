export type GitTutorialVisualState =
  | "default"
  | "configuration"
  | "graph"
  | "log"
  | "split"
  | "partial-stage"
  | "compare-setup"
  | "compare-project"
  | "compare-base"
  | "compare-compared"
  | "compare-result"
  | "compare-split"

const COMPARE_TARGET_STATES: Record<string, GitTutorialVisualState> = {
  "tutorial-git-compare-tab": "compare-setup",
  "tutorial-git-compare-selectors": "compare-setup",
  "tutorial-git-compare-project": "compare-project",
  "tutorial-git-compare-base": "compare-base",
  "tutorial-git-compare-compared": "compare-compared",
  "tutorial-git-compare-range": "compare-result",
  "tutorial-git-compare-summary": "compare-result",
  "tutorial-git-compare-files": "compare-result",
  "tutorial-git-compare-diff": "compare-result",
  "tutorial-git-compare-layout": "compare-split",
  "tutorial-git-compare-navigation": "compare-result",
  "tutorial-git-compare-return": "compare-result",
}

export function gitTutorialVisualState(
  activeTargetId: string | null | undefined,
): GitTutorialVisualState {
  if (activeTargetId && COMPARE_TARGET_STATES[activeTargetId]) {
    return COMPARE_TARGET_STATES[activeTargetId]
  }
  if (activeTargetId === "tutorial-git-local-configuration") return "configuration"
  if (activeTargetId === "tutorial-git-open-graph") return "graph"
  if (activeTargetId === "tutorial-git-open-log") return "log"
  if (activeTargetId === "tutorial-git-diff-layout") return "split"
  if (activeTargetId === "tutorial-git-partial-stage") return "partial-stage"
  return "default"
}

export function isCompareTutorialState(state: GitTutorialVisualState) {
  return state.startsWith("compare-")
}
