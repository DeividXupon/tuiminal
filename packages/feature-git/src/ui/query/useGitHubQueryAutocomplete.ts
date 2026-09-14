import { useKeyboard, useRenderer } from "@opentui/react"
import { useMemo, useState } from "react"
import {
  applyGitHubQuerySuggestion,
  githubQuerySuggestions,
  type GitHubQueryKind,
} from "../../model/query-autocomplete"

export function useGitHubQueryAutocomplete({
  active,
  inputId,
  query,
  kind,
  repositories,
  onChange,
}: {
  active: boolean
  inputId: string
  query: string
  kind: GitHubQueryKind
  repositories: readonly string[]
  onChange: (query: string) => void
}) {
  const renderer = useRenderer()
  const [selectedIndex, setSelectedIndex] = useState(0)
  const suggestions = useMemo(
    () => githubQuerySuggestions({ query, kind, repositories, limit: 3 }),
    [kind, query, repositories],
  )
  const apply = (index: number) => {
    const suggestion = suggestions[Math.min(index, Math.max(0, suggestions.length - 1))]
    if (!suggestion) return
    onChange(applyGitHubQuerySuggestion(query, suggestion.value))
    setSelectedIndex(0)
  }

  useKeyboard((key) => {
    if (!active || renderer.currentFocusedRenderable?.id !== inputId) return
    if (key.ctrl && (key.name === "n" || key.name === "p")) {
      key.preventDefault()
      key.stopPropagation()
      setSelectedIndex((current) =>
        suggestions.length
          ? (current + (key.name === "n" ? 1 : -1) + suggestions.length) % suggestions.length
          : 0,
      )
    } else if (key.ctrl && key.name === "y" && suggestions.length) {
      key.preventDefault()
      key.stopPropagation()
      apply(selectedIndex)
    }
  })

  return { suggestions, selectedIndex, apply }
}
