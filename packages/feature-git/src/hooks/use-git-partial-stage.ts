import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import {
  buildGitPartialStagePatch,
  gitPartialStageChangeLineIds,
  type GitPartialStageDocument,
  type GitPartialStageGranularity,
  type GitPartialStageItem,
  type GitPartialStageSource,
  gitPartialStageTargetLineIds,
  gitPartialStageTargets,
} from "../model/git-partial-stage"
import type { GitFile } from "../model/types"
import type { DiffLayout } from "../model/view"
import type { GitCommandObserver } from "../services/git-file-actions"
import {
  applyGitPartialStageChanges,
  type GitPartialStageState,
  loadGitPartialStageState,
} from "../services/git-partial-stage"

type PartialStageSession = {
  root: string
  file: GitFile
  state: GitPartialStageState | null
}

type DesiredStageLines = Record<GitPartialStageSource, Set<string>>

export type GitPartialStagePane = "available" | "selected"

type GitPartialStageOptions = {
  root: string | null | undefined
  selectedFile: GitFile | null
  blocked: boolean
  setDiffLayout: Dispatch<SetStateAction<DiffLayout>>
  setTerminalExpanded: Dispatch<SetStateAction<boolean>>
  setError: Dispatch<SetStateAction<string | null>>
  setMessage: Dispatch<SetStateAction<string | null>>
  refreshFiles: () => Promise<void>
  recordCommand: GitCommandObserver
  recordResult: (text: string, success?: boolean) => void
  focusPreview: () => void
}

const EMPTY_DESIRED_STAGE: DesiredStageLines = {
  unstaged: new Set(),
  staged: new Set(),
}

function isEligible(file: GitFile | null) {
  return Boolean(
    file &&
      (file.staged || file.unstaged) &&
      !file.untracked &&
      file.indexStatus !== "?" &&
      file.worktreeStatus !== "D",
  )
}

function itemId(source: GitPartialStageSource, targetId: string) {
  return `${source}:${targetId}`
}

function itemsForPane({
  documents,
  desiredStage,
  granularity,
  pane,
}: {
  documents: GitPartialStageState["documents"] | null
  desiredStage: DesiredStageLines
  granularity: GitPartialStageGranularity
  pane: GitPartialStagePane
}) {
  if (!documents) return []
  const items: GitPartialStageItem[] = []
  for (const source of ["staged", "unstaged"] as const) {
    const document = documents[source]
    if (!document) continue
    for (const target of gitPartialStageTargets(document, granularity)) {
      const lineIds = gitPartialStageTargetLineIds(document, target)
      const selectedCount = lineIds.filter((id) => desiredStage[source].has(id)).length
      const visible = pane === "selected" ? selectedCount > 0 : selectedCount < lineIds.length
      if (visible) items.push({ id: itemId(source, target.id), source, target })
    }
  }
  return items
}

function partialStagePatch(
  document: GitPartialStageDocument | null,
  selected: ReadonlySet<string>,
) {
  return document ? buildGitPartialStagePatch({ document, granularity: "line", selected }) : ""
}

export function useGitPartialStage(options: GitPartialStageOptions) {
  const [session, setSession] = useState<PartialStageSession | null>(null)
  const [granularity, setGranularity] = useState<GitPartialStageGranularity>("hunk")
  const [pane, setPane] = useState<GitPartialStagePane>("available")
  const [cursors, setCursors] = useState<Record<GitPartialStagePane, number>>({
    available: 0,
    selected: 0,
  })
  const [desiredStage, setDesiredStage] = useState<DesiredStageLines>(EMPTY_DESIRED_STAGE)
  const [running, setRunning] = useState(false)
  const generationRef = useRef(0)
  const state = session?.state ?? null
  const documents = state?.documents ?? null
  const stagedLineIds = useMemo(
    () => (documents?.staged ? gitPartialStageChangeLineIds(documents.staged) : []),
    [documents?.staged],
  )
  const availableTargets = useMemo(
    () => itemsForPane({ documents, desiredStage, granularity, pane: "available" }),
    [desiredStage, documents, granularity],
  )
  const selectedTargets = useMemo(
    () => itemsForPane({ documents, desiredStage, granularity, pane: "selected" }),
    [desiredStage, documents, granularity],
  )
  const paneTargets = pane === "available" ? availableTargets : selectedTargets
  const cursor = cursors[pane]
  const addPatch = useMemo(
    () => partialStagePatch(documents?.unstaged ?? null, desiredStage.unstaged),
    [desiredStage.unstaged, documents?.unstaged],
  )
  const removedStagedLines = useMemo(
    () => new Set(stagedLineIds.filter((id) => !desiredStage.staged.has(id))),
    [desiredStage.staged, stagedLineIds],
  )
  const removePatch = useMemo(
    () => partialStagePatch(documents?.staged ?? null, removedStagedLines),
    [documents?.staged, removedStagedLines],
  )
  const hasChanges = Boolean(addPatch || removePatch)

  const reset = useCallback(() => {
    generationRef.current += 1
    setSession(null)
    setGranularity("hunk")
    setPane("available")
    setCursors({ available: 0, selected: 0 })
    setDesiredStage({ unstaged: new Set(), staged: new Set() })
    setRunning(false)
  }, [])

  const start = useCallback(async () => {
    const file = options.selectedFile
    const root = options.root
    if (!root || !file || options.blocked || !isEligible(file)) return
    const generation = generationRef.current + 1
    generationRef.current = generation
    options.setDiffLayout("unified")
    options.setTerminalExpanded(false)
    options.setError(null)
    options.setMessage(null)
    setGranularity("hunk")
    setPane("available")
    setCursors({ available: 0, selected: 0 })
    setDesiredStage({ unstaged: new Set(), staged: new Set() })
    setSession({ root, file, state: null })
    options.focusPreview()
    try {
      const nextState = await loadGitPartialStageState(root, file)
      if (generationRef.current !== generation) return
      setDesiredStage({
        unstaged: new Set(),
        staged: new Set(
          nextState.documents.staged
            ? gitPartialStageChangeLineIds(nextState.documents.staged)
            : [],
        ),
      })
      setSession({ root, file, state: nextState })
      options.focusPreview()
    } catch (error) {
      if (generationRef.current !== generation) return
      const message = translateUi(
        error instanceof Error ? error.message : "Não foi possível carregar o patch.",
      )
      setSession(null)
      options.setError(message)
      options.recordResult(message, false)
    }
  }, [options])

  const selectGranularity = useCallback(
    (next: GitPartialStageGranularity) => {
      if (running || !documents) return
      setGranularity(next)
      setCursors({ available: 0, selected: 0 })
    },
    [documents, running],
  )

  const toggleGranularity = useCallback(() => {
    selectGranularity(granularity === "hunk" ? "line" : "hunk")
  }, [granularity, selectGranularity])

  const selectPane = useCallback(
    (next: GitPartialStagePane) => {
      if (!running) setPane(next)
    },
    [running],
  )

  const move = useCallback(
    (delta: -1 | 1) => {
      if (running) return
      setCursors((current) => ({
        ...current,
        [pane]: Math.max(0, Math.min(Math.max(0, paneTargets.length - 1), current[pane] + delta)),
      }))
    },
    [pane, paneTargets.length, running],
  )

  const cancel = useCallback(() => {
    if (!running) reset()
  }, [reset, running])

  const transferTarget = useCallback(
    (targetId?: string, sourcePane: GitPartialStagePane = pane) => {
      const sourceTargets = sourcePane === "available" ? availableTargets : selectedTargets
      const item = targetId
        ? sourceTargets.find((candidate) => candidate.id === targetId)
        : sourceTargets[cursors[sourcePane]]
      const document = item ? documents?.[item.source] : null
      if (!item || !document || running) return
      const lineIds = gitPartialStageTargetLineIds(document, item.target)
      setDesiredStage((current) => {
        const sourceLines = new Set(current[item.source])
        for (const id of lineIds) {
          if (sourcePane === "selected") sourceLines.delete(id)
          else sourceLines.add(id)
        }
        return { ...current, [item.source]: sourceLines }
      })
    },
    [availableTargets, cursors, documents, pane, running, selectedTargets],
  )

  useEffect(() => {
    setCursors((current) => ({
      available: Math.min(current.available, Math.max(0, availableTargets.length - 1)),
      selected: Math.min(current.selected, Math.max(0, selectedTargets.length - 1)),
    }))
  }, [availableTargets.length, selectedTargets.length])

  const apply = useCallback(async () => {
    if (!session || running) return
    if (!session.state) {
      reset()
      options.focusPreview()
      return
    }
    if (!hasChanges) {
      reset()
      options.focusPreview()
      return
    }
    setRunning(true)
    options.setError(null)
    options.setMessage(null)
    try {
      const result = await applyGitPartialStageChanges({
        root: session.root,
        file: session.file,
        expectedSources: session.state.sources,
        addPatch,
        removePatch,
        observer: options.recordCommand,
      })
      const message = translateUi(result)
      reset()
      await options.refreshFiles()
      options.focusPreview()
      options.setMessage(message)
      options.recordResult(message)
    } catch (error) {
      const message = translateUi(
        error instanceof Error ? error.message : "Não foi possível aplicar o stage parcial.",
      )
      options.setError(message)
      options.recordResult(message, false)
      setRunning(false)
    }
  }, [addPatch, hasChanges, options, removePatch, reset, running, session])

  useEffect(() => {
    if (!session) return
    if (options.root !== session.root || options.selectedFile?.path !== session.file.path) reset()
  }, [options.root, options.selectedFile?.path, reset, session])

  return {
    active: Boolean(session),
    startDisabled: !isEligible(options.selectedFile) || options.blocked,
    loading: Boolean(session && !state),
    interactionBlocked: Boolean(session && !state) || running,
    running,
    documents,
    granularity,
    pane,
    cursor,
    availableTargets,
    selectedTargets,
    currentTarget: paneTargets[cursor] ?? null,
    selectedCount: selectedTargets.length,
    hasChanges,
    addPatch,
    removePatch,
    start,
    cancel,
    move,
    selectPane,
    selectGranularity,
    toggleGranularity,
    transferTarget,
    apply,
  }
}
