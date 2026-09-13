import { type Dispatch, type SetStateAction, useCallback, useMemo, useRef, useState } from "react"
import { translateUi } from "../../../shared/i18n"
import {
  filesInsideGitFolder,
  optimisticGitDiscard,
  optimisticGitStage,
} from "../model/git-command-console"
import type { GitFile, GitSnapshot } from "../model/types"
import { displayPath, FILE_OPTION_PREFIX, FOLDER_OPTION_PREFIX } from "../rendering/file-tree"
import {
  discardGitFiles,
  type GitCommandObserver,
  stageGitFiles,
  toggleAllGitFiles,
  toggleGitFile,
  unstageGitFiles,
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
  refreshFiles: () => Promise<void>
  recordCommand: GitCommandObserver
  recordResult: (text: string, success?: boolean) => void
  focusFiles: () => void
}

type StageOperationOptions = {
  root: string
  scope: "file" | "selection"
  files: GitFile[]
  selectedFile: GitFile | null
  selectedFolder: string | null
  recordCommand: GitCommandObserver
}

type PreparedStageOperation = {
  optimisticFiles: GitFile[]
  execute: () => Promise<string>
}

function prepareStageOperation({
  root,
  scope,
  files,
  selectedFile,
  selectedFolder,
  recordCommand,
}: StageOperationOptions): PreparedStageOperation {
  if (scope === "selection" && selectedFolder) {
    const selectedFiles = filesInsideGitFolder(files, selectedFolder)
    return {
      optimisticFiles: optimisticGitStage(files, selectedFiles, "stage"),
      execute: () => stageGitFiles(root, selectedFiles, recordCommand),
    }
  }
  if (scope === "file" && selectedFolder) {
    const selectedFiles = filesInsideGitFolder(files, selectedFolder)
    const mode = selectedFiles.some((file) => file.unstaged) ? "stage" : "unstage"
    return {
      optimisticFiles: optimisticGitStage(files, selectedFiles, mode),
      execute: () =>
        mode === "stage"
          ? stageGitFiles(root, selectedFiles, recordCommand)
          : unstageGitFiles(root, selectedFiles, recordCommand),
    }
  }
  if (scope === "selection") {
    const mode = files.some((file) => file.unstaged) ? "stage" : "unstage"
    return {
      optimisticFiles: optimisticGitStage(files, files, mode),
      execute: () => toggleAllGitFiles(root, files, recordCommand),
    }
  }
  if (!selectedFile) throw new Error("Selecione um arquivo para alterar o stage.")
  const mode = selectedFile.unstaged ? "stage" : "unstage"
  return {
    optimisticFiles: optimisticGitStage(files, [selectedFile], mode),
    execute: () => toggleGitFile(root, selectedFile, recordCommand),
  }
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
  refreshFiles,
  recordCommand,
  recordResult,
  focusFiles,
}: GitFileActionOptions) {
  const [discardTarget, setDiscardTarget] = useState<GitDiscardTarget | null>(null)
  const [stagePending, setStagePending] = useState(false)
  const stageQueueRef = useRef<Promise<void>>(Promise.resolve())
  const pendingStageCountRef = useRef(0)
  const optimisticRootRef = useRef<string | null>(null)
  const optimisticFilesRef = useRef<GitFile[]>([])
  if (optimisticRootRef.current !== (snapshot?.root ?? null)) {
    optimisticRootRef.current = snapshot?.root ?? null
    optimisticFilesRef.current = snapshot?.files ?? []
  } else if (pendingStageCountRef.current === 0) {
    optimisticFilesRef.current = snapshot?.files ?? []
  }
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
    (scope: "file" | "selection", targetTreeValue = selectedTreeValue) => {
      if (!snapshot?.root || busy || consoleRunning) return Promise.resolve()
      const files = optimisticFilesRef.current
      const targetFolder = targetTreeValue?.startsWith(FOLDER_OPTION_PREFIX)
        ? targetTreeValue.slice(FOLDER_OPTION_PREFIX.length)
        : selectedFolder
      const targetFilePath = targetTreeValue?.startsWith(FILE_OPTION_PREFIX)
        ? targetTreeValue.slice(FILE_OPTION_PREFIX.length)
        : selectedFile?.path
      const currentSelectedFile = targetFilePath
        ? (files.find((file) => file.path === targetFilePath) ?? selectedFile)
        : null
      if (scope === "file" && !currentSelectedFile && !targetFolder) return Promise.resolve()
      const operation = prepareStageOperation({
        root: snapshot.root,
        scope,
        files,
        selectedFile: currentSelectedFile,
        selectedFolder: targetFolder,
        recordCommand,
      })
      optimisticFilesRef.current = operation.optimisticFiles
      pendingStageCountRef.current += 1
      setStagePending(true)
      updateFiles(() => operation.optimisticFiles)
      setError(null)
      setMessage(null)
      const queued = stageQueueRef.current.then(async () => {
        try {
          const nextMessage = await operation.execute()
          const translatedMessage = translateUi(nextMessage)
          if (pendingStageCountRef.current === 1) {
            optimisticFilesRef.current = operation.optimisticFiles
          }
          setError(null)
          setMessage(translatedMessage)
          recordResult(translatedMessage)
        } catch (error) {
          const message = translateUi(
            error instanceof Error ? error.message : "Não foi possível alterar o stage.",
          )
          setError(message)
          recordResult(message, false)
        } finally {
          pendingStageCountRef.current -= 1
          if (pendingStageCountRef.current === 0) {
            await refreshFiles()
            if (pendingStageCountRef.current === 0) setStagePending(false)
          }
        }
      })
      stageQueueRef.current = queued.catch(() => undefined)
      return queued
    },
    [
      busy,
      consoleRunning,
      recordCommand,
      recordResult,
      refreshFiles,
      selectedFile,
      selectedFolder,
      selectedTreeValue,
      setError,
      setMessage,
      snapshot?.root,
      updateFiles,
    ],
  )

  const openDiscardTarget = useCallback(() => {
    if (!selectedActionFiles.length || busy || consoleRunning || pendingStageCountRef.current > 0)
      return
    setDiscardTarget({
      label: selectedFolder
        ? `${displayPath(selectedFolder)}/`
        : displayPath(selectedActionFiles[0]?.path ?? ""),
      files: selectedActionFiles,
    })
  }, [busy, consoleRunning, selectedActionFiles, selectedFolder])

  const runDiscardAction = useCallback(async () => {
    const target = discardTarget
    if (!target || !snapshot?.root || busy || consoleRunning || pendingStageCountRef.current > 0)
      return
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
      await refreshFiles()
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
    refreshFiles,
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
    stagePending,
    runStageAction,
    openDiscardTarget,
    runDiscardAction,
  }
}
