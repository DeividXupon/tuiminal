import type { GitFile } from "../model/types"
import { type GitCommandResult, runGitCommand } from "./git-command"

export type GitCommandObserver = (args: readonly string[]) => void

function commandError(result: GitCommandResult, fallback: string) {
  const message = result.stderr.trim() || result.stdout.trim() || fallback
  return new Error(result.truncated ? `${message}\n[saída truncada pelo limite]` : message)
}

async function runObservedGitCommand(root: string, args: string[], observer?: GitCommandObserver) {
  observer?.(args)
  return runGitCommand(root, args, { mutating: true })
}

function fileChunks(files: readonly GitFile[]) {
  const chunks: GitFile[][] = []
  for (let index = 0; index < files.length; index += 128) {
    chunks.push(files.slice(index, index + 128))
  }
  return chunks
}

export async function stageGitFiles(
  root: string,
  files: readonly GitFile[],
  observer?: GitCommandObserver,
) {
  const pending = files.filter((file) => file.unstaged)
  if (!pending.length) return "Os arquivos selecionados já estão no stage."
  for (const chunk of fileChunks(pending)) {
    const args = ["--literal-pathspecs", "add", "--", ...chunk.map((file) => file.path)]
    const result = await runObservedGitCommand(root, args, observer)
    if (result.exitCode !== 0) {
      throw commandError(result, "Não foi possível adicionar os arquivos selecionados.")
    }
  }
  return "Alterações selecionadas adicionadas ao stage."
}

export async function discardGitFiles(
  root: string,
  files: readonly GitFile[],
  observer?: GitCommandObserver,
) {
  const tracked = files.filter((file) => !file.untracked && file.indexStatus !== "A")
  const added = files.filter((file) => file.indexStatus === "A")
  const newFiles = files.filter((file) => file.untracked || file.indexStatus === "A")
  for (const chunk of fileChunks(tracked)) {
    const args = [
      "--literal-pathspecs",
      "restore",
      "--source=HEAD",
      "--staged",
      "--worktree",
      "--",
      ...chunk.map((file) => file.path),
    ]
    const result = await runObservedGitCommand(root, args, observer)
    if (result.exitCode !== 0) {
      throw commandError(result, "Não foi possível restaurar os arquivos rastreados.")
    }
  }
  for (const chunk of fileChunks(added)) {
    const args = [
      "--literal-pathspecs",
      "rm",
      "--cached",
      "-f",
      "--",
      ...chunk.map((file) => file.path),
    ]
    const result = await runObservedGitCommand(root, args, observer)
    if (result.exitCode !== 0) {
      throw commandError(result, "Não foi possível retirar os arquivos novos do stage.")
    }
  }
  for (const chunk of fileChunks(newFiles)) {
    const args = ["--literal-pathspecs", "clean", "-f", "--", ...chunk.map((file) => file.path)]
    const result = await runObservedGitCommand(root, args, observer)
    if (result.exitCode !== 0) {
      throw commandError(result, "Não foi possível remover os arquivos novos.")
    }
  }
  return "Alterações selecionadas descartadas."
}
