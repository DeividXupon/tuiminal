import { basename, resolve } from "node:path"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import type {
  GitBranchComparison,
  GitComparisonContext,
  GitComparisonRef,
} from "../model/branch-comparison"
import { resolveGitProjectContext, runGitCommand } from "./git"

function comparisonError(stderr: string, fallback: string) {
  return new Error(stderr.trim() || fallback)
}

function parseComparisonRefs(
  output: string,
  currentRef: string,
  upstreamRef: string,
): GitComparisonRef[] {
  return output
    .split("\n")
    .map((line) => {
      const [ref = "", name = ""] = line.split("\0")
      if (!ref || !name || ref.endsWith("/HEAD")) return null
      return {
        ref,
        name,
        kind: ref.startsWith("refs/remotes/") ? ("remote" as const) : ("local" as const),
        current: ref === currentRef,
        upstream: ref === upstreamRef,
      }
    })
    .filter((reference): reference is GitComparisonRef => reference !== null)
    .sort((left, right) => {
      if (left.current !== right.current) return left.current ? -1 : 1
      if (left.upstream !== right.upstream) return left.upstream ? -1 : 1
      if (left.kind !== right.kind) return left.kind === "local" ? -1 : 1
      return left.name.localeCompare(right.name)
    })
}

export async function loadGitComparisonContext(directory: string): Promise<GitComparisonContext> {
  const context = await resolveGitProjectContext(directory)
  if (!context.isRepository) {
    return {
      isRepository: false,
      root: resolve(directory),
      repositoryName: basename(resolve(directory)),
      currentBranch: "—",
      refs: [],
    }
  }

  const [currentResult, upstreamResult, refsResult] = await Promise.all([
    runGitCommand(context.root, ["symbolic-ref", "-q", "HEAD"]),
    runGitCommand(context.root, ["rev-parse", "--symbolic-full-name", "@{upstream}"]),
    runGitCommand(context.root, [
      "for-each-ref",
      "--format=%(refname)%00%(refname:short)",
      "refs/heads",
      "refs/remotes",
    ]),
  ])
  if (refsResult.exitCode !== 0) {
    throw comparisonError(
      refsResult.stderr,
      translateUi("Não foi possível listar as branches do projeto."),
    )
  }
  const currentRef = currentResult.exitCode === 0 ? currentResult.stdout.trim() : ""
  const upstreamRef = upstreamResult.exitCode === 0 ? upstreamResult.stdout.trim() : ""
  const currentBranch = currentRef.replace(/^refs\/heads\//, "") || "HEAD destacado"

  return {
    isRepository: true,
    root: context.root,
    repositoryName: basename(context.root),
    currentBranch,
    refs: parseComparisonRefs(refsResult.stdout, currentRef, upstreamRef),
  }
}

function parseNumstat(output: string) {
  let fileCount = 0
  let additions = 0
  let deletions = 0
  for (const line of output.split("\n")) {
    if (!line) continue
    const [added = "", deleted = ""] = line.split("\t")
    fileCount += 1
    if (/^\d+$/.test(added)) additions += Number(added)
    if (/^\d+$/.test(deleted)) deletions += Number(deleted)
  }
  return { fileCount, additions, deletions }
}

export async function loadGitBranchComparison({
  root,
  baseRef,
  comparedRef,
}: {
  root: string
  baseRef: string
  comparedRef: string
}): Promise<GitBranchComparison> {
  if (baseRef === comparedRef) {
    throw new Error(translateUi("Escolha duas branches diferentes para comparar."))
  }
  const range = `${baseRef}...${comparedRef}`
  const [patchResult, statResult] = await Promise.all([
    runGitCommand(root, ["diff", "--no-ext-diff", "--no-color", "--unified=3", range, "--"]),
    runGitCommand(root, ["diff", "--numstat", "--no-renames", range, "--"]),
  ])
  if (patchResult.exitCode !== 0) {
    throw comparisonError(
      patchResult.stderr,
      translateUi("Não foi possível comparar as branches selecionadas."),
    )
  }
  if (statResult.exitCode !== 0) {
    throw comparisonError(
      statResult.stderr,
      translateUi("Não foi possível calcular o resumo da comparação."),
    )
  }
  return { patch: patchResult.stdout, ...parseNumstat(statResult.stdout) }
}
