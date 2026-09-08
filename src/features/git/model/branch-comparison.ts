export type GitComparisonRefKind = "local" | "remote"

export type GitComparisonRef = {
  ref: string
  name: string
  kind: GitComparisonRefKind
  current: boolean
  upstream: boolean
}

export type GitComparisonContext = {
  isRepository: boolean
  root: string
  repositoryName: string
  currentBranch: string
  refs: GitComparisonRef[]
}

export type GitBranchComparison = {
  patch: string
  fileCount: number
  additions: number
  deletions: number
}

export function comparisonRefDescription(reference: GitComparisonRef) {
  if (reference.current) return "BRANCH ATUAL"
  if (reference.upstream) return "UPSTREAM ATUAL"
  return reference.kind === "local" ? "BRANCH LOCAL" : "BRANCH REMOTA"
}

export function comparisonRefByName(references: readonly GitComparisonRef[], ref: string | null) {
  return references.find((reference) => reference.ref === ref) ?? null
}

export function preserveComparisonRef(references: readonly GitComparisonRef[], ref: string | null) {
  return comparisonRefByName(references, ref)?.ref ?? null
}

export type GitComparisonKeyboardAction =
  | "exit"
  | "pick-base"
  | "pick-compared"
  | "change-layout"
  | "refresh"

export function gitComparisonKeyboardAction(
  keyName: string,
  comparisonReady: boolean,
): GitComparisonKeyboardAction | null {
  if (keyName === "c" || keyName === "escape") return "exit"
  if (keyName === "b") return "pick-base"
  if (keyName === "t") return "pick-compared"
  if (keyName === "v" && comparisonReady) return "change-layout"
  if (keyName === "r") return "refresh"
  return null
}

export type GitComparePickerKeyboardAction =
  | "close"
  | "blur-search"
  | "focus-search"
  | "up"
  | "down"
  | "select"

export function gitComparePickerKeyboardAction(
  keyName: string,
  searchFocused: boolean,
): GitComparePickerKeyboardAction | null {
  if (keyName === "escape") return searchFocused ? "blur-search" : "close"
  if (keyName === "/" && !searchFocused) return "focus-search"
  if (searchFocused) return null
  if (keyName === "up" || keyName === "k") return "up"
  if (keyName === "down" || keyName === "j") return "down"
  if (["enter", "return", "linefeed"].includes(keyName)) return "select"
  return null
}
