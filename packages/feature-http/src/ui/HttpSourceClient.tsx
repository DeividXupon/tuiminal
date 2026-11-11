import { useWorkspaceRepaint } from "@xupon/tuiminal-core/ui/workspace-repaint"
import { useEffect, useRef, useState, type ReactNode } from "react"
import { useNotifications } from "@xupon/tuiminal-core/notifications/index"
import type { HttpSourceMode } from "../model/source-mode"
import type { HttpClientProps } from "../model/types"
import { readHttpLastWorkspace, saveHttpLastWorkspace } from "../storage/last-workspace"
import {
  openInitialPostmanWorkspace,
  type HttpRestoredPostmanWorkspace,
} from "../services/startup-workspace"
import { HttpSourcePicker } from "./HttpSourcePicker"

export type HttpSourceWorkspaceProps = HttpClientProps & {
  sourceMode: HttpSourceMode
  onChooseSource: () => void
  startup?: HttpRestoredPostmanWorkspace | undefined
}

export function HttpSourceClient({
  active,
  children,
}: {
  active: boolean
  children: (
    source: HttpSourceMode,
    onChooseSource: () => void,
    restored: HttpRestoredPostmanWorkspace | undefined,
  ) => ReactNode
}) {
  const [source, setSource] = useState<HttpSourceMode | null>(null)
  const [restored, setRestored] = useState<HttpRestoredPostmanWorkspace>()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const generation = useRef(0)
  const pending = useRef(false)
  const { notify } = useNotifications()
  useWorkspaceRepaint(source ?? "source-picker")
  useEffect(
    () => () => {
      generation.current++
    },
    [],
  )

  const openWorkspace = (result: HttpRestoredPostmanWorkspace) => {
    saveHttpLastWorkspace({
      source: "postman",
      workspaceId: result.workspace.id,
      ...(result.session.environmentId ? { environmentId: result.session.environmentId } : {}),
    })
    setRestored(result)
    setSource("postman")
    for (const message of result.session.errors) notify({ source: "HTTP", message })
  }
  const select = async (selected: HttpSourceMode) => {
    if (selected === "postman" && pending.current) return
    const token = ++generation.current
    setError("")
    setRestored(undefined)
    pending.current = selected === "postman"
    setLoading(pending.current)
    if (selected === "local") return setSource("local")
    try {
      const result = await openInitialPostmanWorkspace(readHttpLastWorkspace())
      if (token !== generation.current) return result.session.dispose()
      openWorkspace(result)
    } catch (cause) {
      if (token === generation.current)
        setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      if (token === generation.current) {
        pending.current = false
        setLoading(false)
      }
    }
  }
  if (!source)
    return (
      <HttpSourcePicker
        active={active}
        loading={loading}
        error={error}
        onSelect={(selected) => void select(selected)}
      />
    )
  return children(
    source,
    () => {
      generation.current++
      setRestored(undefined)
      setSource(null)
    },
    restored,
  )
}
