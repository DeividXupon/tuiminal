import type { GitPartialStageDocument, GitPartialStageSource } from "../model/git-partial-stage"
import { parseGitPartialStagePatch } from "../model/git-partial-stage"
import type { GitFile } from "../model/types"
import type { GitCommandObserver } from "./git-file-actions"
import { runGitCommand } from "./git-command"

const PARTIAL_STAGE_DIFF_ARGS = [
  "--literal-pathspecs",
  "diff",
  "--no-ext-diff",
  "--no-color",
  "--unified=0",
  "--no-renames",
]

export type GitPartialStageState = {
  documents: Record<GitPartialStageSource, GitPartialStageDocument | null>
  sources: Record<GitPartialStageSource, string>
}

function partialStageError(stdout: string, stderr: string, fallback: string) {
  return new Error(stderr.trim() || stdout.trim() || fallback)
}

function assertPartialStageFile(file: GitFile, requireUnstaged = false) {
  if (requireUnstaged && !file.unstaged) {
    throw new Error("O arquivo não possui alterações fora do stage.")
  }
  if (!file.staged && !file.unstaged) throw new Error("O arquivo não possui alterações no stage.")
  if (file.untracked || file.indexStatus === "?" || file.worktreeStatus === "D") {
    throw new Error("O stage parcial está disponível para arquivos rastreados e modificados.")
  }
}

async function loadSource(root: string, file: GitFile, source: GitPartialStageSource) {
  const args = [
    ...PARTIAL_STAGE_DIFF_ARGS,
    ...(source === "staged" ? ["--cached"] : []),
    "--",
    file.path,
  ]
  const result = await runGitCommand(root, args)
  if (result.exitCode !== 0) {
    throw partialStageError(result.stdout, result.stderr, "Não foi possível carregar o patch.")
  }
  return result.stdout.replace(/\r\n?/g, "\n")
}

export async function loadGitPartialStageSource(
  root: string,
  file: GitFile,
): Promise<GitPartialStageDocument> {
  assertPartialStageFile(file, true)
  const source = await loadSource(root, file, "unstaged")
  const document = parseGitPartialStagePatch(source)
  if (!document) {
    throw new Error("Esta alteração não possui linhas textuais que possam ser selecionadas.")
  }
  return document
}

export async function loadGitPartialStageState(
  root: string,
  file: GitFile,
): Promise<GitPartialStageState> {
  assertPartialStageFile(file)
  const [unstaged, staged] = await Promise.all([
    loadSource(root, file, "unstaged"),
    loadSource(root, file, "staged"),
  ])
  const documents = {
    unstaged: parseGitPartialStagePatch(unstaged),
    staged: parseGitPartialStagePatch(staged),
  }
  if (!documents.unstaged && !documents.staged) {
    throw new Error("Esta alteração não possui linhas textuais que possam ser selecionadas.")
  }
  return { documents, sources: { unstaged, staged } }
}

async function runPartialStagePatch({
  root,
  patch,
  reverse,
  observer,
}: {
  root: string
  patch: string
  reverse: boolean
  observer?: GitCommandObserver | undefined
}) {
  const args = [
    "apply",
    "--cached",
    ...(reverse ? ["--reverse"] : []),
    "--unidiff-zero",
    "--whitespace=nowarn",
    "-",
  ]
  observer?.(args)
  const result = await runGitCommand(root, args, {
    mutating: true,
    maxOutputBytes: 512 * 1024,
    stdin: patch,
  })
  if (result.exitCode !== 0) {
    throw partialStageError(
      result.stdout,
      result.stderr,
      reverse
        ? "Não foi possível retirar a seleção do stage."
        : "Não foi possível adicionar a seleção ao stage.",
    )
  }
}

export async function applyGitPartialStageChanges({
  root,
  file,
  expectedSources,
  addPatch,
  removePatch,
  observer,
}: {
  root: string
  file: GitFile
  expectedSources: Record<GitPartialStageSource, string>
  addPatch: string
  removePatch: string
  observer?: GitCommandObserver
}) {
  assertPartialStageFile(file)
  const [unstaged, staged] = await Promise.all([
    loadSource(root, file, "unstaged"),
    loadSource(root, file, "staged"),
  ])
  if (
    unstaged !== expectedSources.unstaged.replace(/\r\n?/g, "\n") ||
    staged !== expectedSources.staged.replace(/\r\n?/g, "\n")
  ) {
    throw new Error("O arquivo mudou após a seleção. Abra o stage parcial novamente.")
  }
  if (removePatch) {
    await runPartialStagePatch({ root, patch: removePatch, reverse: true, observer })
  }
  if (addPatch) {
    try {
      await runPartialStagePatch({ root, patch: addPatch, reverse: false, observer })
    } catch (error) {
      if (removePatch) {
        try {
          await runPartialStagePatch({ root, patch: removePatch, reverse: false, observer })
        } catch {
          throw new Error("O stage parcial falhou e o estado do index pode ser incerto.")
        }
      }
      throw error
    }
  }
  return "Stage parcial aplicado."
}

export async function applyGitPartialStage({
  root,
  file,
  expectedSource,
  patch,
  observer,
}: {
  root: string
  file: GitFile
  expectedSource: string
  patch: string
  observer?: GitCommandObserver
}) {
  assertPartialStageFile(file)
  if (!patch) throw new Error("Selecione pelo menos uma alteração para adicionar ao stage.")
  const currentSource = await loadSource(root, file, "unstaged")
  if (currentSource !== expectedSource.replace(/\r\n?/g, "\n")) {
    throw new Error("O arquivo mudou após a seleção. Abra o stage parcial novamente.")
  }
  await runPartialStagePatch({ root, patch, reverse: false, observer })
  return "Seleção adicionada ao stage."
}
