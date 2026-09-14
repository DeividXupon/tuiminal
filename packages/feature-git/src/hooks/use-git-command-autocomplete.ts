import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  applyGitCommandCompletion,
  type GitCommandCompletionData,
  gitCommandCompletions,
} from "../model/git-command-autocomplete"
import { loadGitCommandCompletionData } from "../services/git-command-autocomplete"

const EMPTY_COMPLETION_DATA: Omit<GitCommandCompletionData, "paths"> = {
  branches: [],
  tags: [],
  remotes: [],
}

export function useGitCommandAutocomplete({
  root,
  input,
  paths,
  onInput,
}: {
  root: string | null | undefined
  input: string
  paths: readonly string[]
  onInput: (value: string) => void
}) {
  const [repositoryData, setRepositoryData] =
    useState<Omit<GitCommandCompletionData, "paths">>(EMPTY_COMPLETION_DATA)
  const [cursorOffset, setCursorOffset] = useState(0)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [autocompleteOpen, setAutocompleteOpen] = useState(false)
  const loadGenerationRef = useRef(0)
  const rootRef = useRef(root)
  rootRef.current = root

  const reload = useCallback(async () => {
    const generation = ++loadGenerationRef.current
    if (!root) {
      setRepositoryData(EMPTY_COMPLETION_DATA)
      return
    }
    try {
      const next = await loadGitCommandCompletionData(root)
      if (loadGenerationRef.current === generation && rootRef.current === root) {
        setRepositoryData(next)
      }
    } catch {
      if (loadGenerationRef.current === generation && rootRef.current === root) {
        setRepositoryData(EMPTY_COMPLETION_DATA)
      }
    }
  }, [root])

  useEffect(() => {
    setCursorOffset(0)
    setSelectedIndex(0)
    setAutocompleteOpen(false)
    void reload()
    return () => {
      loadGenerationRef.current += 1
    }
  }, [reload])

  const data = useMemo<GitCommandCompletionData>(
    () => ({
      ...repositoryData,
      paths: [...new Set(paths)].sort((left, right) => left.localeCompare(right)),
    }),
    [paths, repositoryData],
  )
  const suggestions = useMemo(
    () => gitCommandCompletions({ input, cursorOffset, data }),
    [cursorOffset, data, input],
  )
  const open = autocompleteOpen && suggestions.length > 0

  useEffect(() => {
    setSelectedIndex((current) => Math.min(current, Math.max(0, suggestions.length - 1)))
  }, [suggestions.length])

  const updateInput = useCallback(
    (value: string, nextCursorOffset = value.length) => {
      onInput(value)
      setCursorOffset(nextCursorOffset)
      setSelectedIndex(0)
      setAutocompleteOpen(Boolean(value))
    },
    [onInput],
  )
  const syncCursor = useCallback((nextCursorOffset: number) => {
    setCursorOffset(nextCursorOffset)
    setSelectedIndex(0)
  }, [])
  const navigate = useCallback(
    (delta: -1 | 1) => {
      if (!open) return false
      setSelectedIndex((current) => (current + delta + suggestions.length) % suggestions.length)
      return true
    },
    [open, suggestions.length],
  )
  const apply = useCallback(
    (index = selectedIndex, currentCursorOffset = cursorOffset) => {
      const completion = suggestions[Math.min(index, Math.max(0, suggestions.length - 1))]
      if (!completion) return null
      const next = applyGitCommandCompletion({
        input,
        cursorOffset: currentCursorOffset,
        completion,
      })
      onInput(next.value)
      setCursorOffset(next.cursorOffset)
      setSelectedIndex(0)
      setAutocompleteOpen(
        completion.kind === "command" ||
          completion.kind === "subcommand" ||
          completion.kind === "remote" ||
          completion.value.endsWith("="),
      )
      return next.cursorOffset
    },
    [cursorOffset, input, onInput, selectedIndex, suggestions],
  )
  const dismiss = useCallback(() => {
    if (!open) return false
    setAutocompleteOpen(false)
    return true
  }, [open])
  const clear = useCallback(() => {
    onInput("")
    setCursorOffset(0)
    setSelectedIndex(0)
    setAutocompleteOpen(false)
  }, [onInput])

  return {
    suggestions,
    selectedIndex,
    open,
    updateInput,
    syncCursor,
    navigate,
    apply,
    dismiss,
    clear,
    reload,
  }
}
