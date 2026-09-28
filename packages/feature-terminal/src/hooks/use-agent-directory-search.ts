import { useEffect, useRef, useState } from "react"
import type { AgentProjectTarget, ProjectDirectory } from "../model/agent-project"
import { directorySearchParts, directorySuggestions } from "../services/agent-directory-search"
import { readProjectDirectory } from "../services/agent-project-directories"

export function useAgentDirectorySearch(target: AgentProjectTarget) {
  const [query, setQuery] = useState("~/")
  const [state, setState] = useState<{
    parent: string
    result: ProjectDirectory | null
    loading: boolean
    error: string
  }>({ parent: "", result: null, loading: true, error: "" })
  const cache = useRef(new Map<string, ProjectDirectory>())
  const windows = target.kind === "local" && process.platform === "win32"
  const { parent } = directorySearchParts(query, windows)
  useEffect(() => {
    const controller = new AbortController()
    const cached = cache.current.get(parent)
    setState({ parent, result: cached ?? null, loading: !cached, error: "" })
    if (cached) return () => controller.abort()
    const timer = setTimeout(() => {
      void readProjectDirectory(target, parent, "~", controller.signal).then(
        (result) => {
          if (controller.signal.aborted) return
          if (cache.current.size >= 20)
            cache.current.delete(cache.current.keys().next().value ?? "")
          cache.current.set(parent, result)
          setState({ parent, result, loading: false, error: "" })
        },
        (cause) => {
          if (!controller.signal.aborted)
            setState({
              parent,
              result: null,
              loading: false,
              error:
                cause instanceof Error
                  ? cause.message
                  : "Não foi possível acessar a pasta selecionada.",
            })
        },
      )
    }, 150)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [parent, target])
  const result = state.parent === parent ? state.result : null
  const rows = directorySuggestions(result?.directories ?? [], query, windows)
  return {
    query,
    setQuery,
    rows,
    result,
    loading: state.parent !== parent || state.loading,
    error: state.parent === parent ? state.error : "",
  }
}
