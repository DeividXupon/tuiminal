import { type Dispatch, type SetStateAction, useCallback, useMemo, useState } from "react"
import { translateUi } from "../../../shared/i18n"
import {
  filesInsideGitFolder,
  optimisticGitDiscard,
  optimisticGitStage,
} from "../model/git-command-console"
import type { GitFile, GitSnapshot } from "../model/types"
import { displayPath, FOLDER_OPTION_PREFIX } from "../rendering/file-tree"
import {
  discardGitFiles,
  type GitCommandObserver,
  stageGitFiles,
  toggleAllGitFiles,
  toggleGitFile,
} from "../services/git"

export type GitDiscardTarget = {
  label: string
  files: GitFile[]
}

type GitFileActionOptions = {
  snapshot: GitSnapshot | null
  selectedFile: GitFile | null
  selectedTreeValue: string | null
  busy: boolean
  consoleRunning: boolean
  setBusy: Dispatch<SetStateAction<boolean>>
  setError: Dispatch<SetStateAction<string | null>>
  setMessage: Dispatch<SetStateAction<string | null>>
  updateFiles: (update: (files: GitFile[]) => GitFile[]) => void
  refresh: (showLoading?: boolean) => Promise<void>
  recordCommand: GitCommandObserver
  recordResult: (text: string, success?: boolean) => void
  focusFiles: () => void
}

type StageOperationOptions = {
  root: string
  scope: "file" | "selection"
  files: GitFile[]
  selectedFiles: GitFile[]
  selectedFile: GitFile | null
  selectedFolder: string | null
  updateFiles: GitFileActionOptions["updateFiles"]
  recordCommand: GitCommandObserver
}

async function executeStageOperation({
  root,
  scope,
  files,
  selectedFiles,
  selectedFile,
  selectedFolder,
  updateFiles,
  recordCommand,
}: StageOperationOptions) {
  if (scope === "selection" && selectedFolder) {
    updateFiles((current) => optimisticGitStage(current, selectedFiles, "stage"))
    return stageGitFiles(root, selectedFiles, recordCommand)
  }
  if (scope === "selection") {
    const mode = files.some((file) => file.unstaged) ? "stage" : "unstage"
    updateFiles((current) => optimisticGitStage(current, files, mode))
    return toggleAllGitFiles(root, files, recordCommand)
  }
  if (!selectedFile) throw new Error("Selecione um arquivo para alterar o stage.")
  const mode = selectedFile.unstaged ? "stage" : "unstage"
  updateFiles((current) => optimisticGitStage(current, [selectedFile], mode))
  return toggleGitFile(root, selectedFile, recordCommand)
}

export function useGitFileActions({
  snapshot,
  selectedFile,
  selectedTreeValue,
  busy,
  consoleRunning,
  setBusy,
  setError,
  setMessage,
  updateFiles,
  refresh,
  recordCommand,
  recordResult,
  focusFiles,
}: GitFileActionOptions) {
  const [discardTarget, setDiscardTarget] = useState<GitDiscardTarget | null>(null)
  const selectedFolder = selectedTreeValue?.startsWith(FOLDER_OPTION_PREFIX)
    ? selectedTreeValue.slice(FOLDER_OPTION_PREFIX.length)
    : null
  const selectedActionFiles = useMemo(
    () =>
      selectedFolder
        ? filesInsideGitFolder(snapshot?.files ?? [], selectedFolder)
        : selectedFile
          ? [selectedFile]
          : [],
    [selectedFile, selectedFolder, snapshot?.files],
  )

  const runStageAction = useCallback(
    async (scope: "file" | "selection") => {
      if (!snapshot?.root || busy || consoleRunning) return
      if (scope === "file" && selectedFolder) {
        setMessage(translateUi("Selecione um arquivo para alterar o stage."))
        return
      }
      if (scope === "file" && !selectedFile) return
      setBusy(true)
      setError(null)
      setMessage(null)
      try {
        const nextMessage = await executeStageOperation({
          root: snapshot.root,
          scope,
          files: snapshot.files,
          selectedFiles: selectedActionFiles,
          selectedFile,
          selectedFolder,
          updateFiles,
          recordCommand,
        })
        const translatedMessage = translateUi(nextMessage)
        setMessage(translatedMessage)
        recordResult(translatedMessage)
        await refresh(false)
      } catch (error) {
        const message = translateUi(
          error instanceof Error ? error.message : "Não foi possível alterar o stage.",
        )
        setError(message)
        recordResult(message, false)
        await refresh(false)
      } finally {
        setBusy(false)
      }
    },
    [
      busy,
      consoleRunning,
      recordCommand,
      recordResult,
      refresh,
      selectedActionFiles,
      selectedFile,
      selectedFolder,
      setBusy,
      setError,
      setMessage,
      snapshot,
      updateFiles,
    ],
  )

  const openDiscardTarget = useCallback(() => {
    if (!selectedActionFiles.length || busy || consoleRunning) return
    setDiscardTarget({
      label: selectedFolder
        ? `${displayPath(selectedFolder)}/`
        : displayPath(selectedActionFiles[0]?.path ?? ""),
      files: selectedActionFiles,
    })
  }, [busy, consoleRunning, selectedActionFiles, selectedFolder])

  const runDiscardAction = useCallback(async () => {
    const target = discardTarget
    if (!target || !snapshot?.root || busy || consoleRunning) return
    setDiscardTarget(null)
    setBusy(true)
    setError(null)
    setMessage(null)
    updateFiles((files) => optimisticGitDiscard(files, target.files))
    try {
      const nextMessage = await discardGitFiles(snapshot.root, target.files, recordCommand)
      const translatedMessage = translateUi(nextMessage)
      setMessage(translatedMessage)
      recordResult(translatedMessage)
    } catch (error) {
      const message = translateUi(
        error instanceof Error ? error.message : "Não foi possível descartar as alterações.",
      )
      setError(message)
      recordResult(message, false)
    } finally {
      await refresh(false)
      setBusy(false)
      focusFiles()
    }
  }, [
    busy,
    consoleRunning,
    discardTarget,
    focusFiles,
    recordCommand,
    recordResult,
    refresh,
    setBusy,
    setError,
    setMessage,
    snapshot?.root,
    updateFiles,
  ])

  return {
    discardTarget,
    setDiscardTarget,
    selectedActionFiles,
    selectedFolder,
    runStageAction,
    openDiscardTarget,
    runDiscardAction,
  }
}
