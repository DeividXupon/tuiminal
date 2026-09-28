import type { TerminalRemoteCodexProfile } from "@xupon/tuiminal-core/settings/theme"
import { useCallback, useEffect, useRef, useState } from "react"
import type { FreeTerminalCommand, TerminalSession } from "../model/sessions"
import type { AgentProjectTarget } from "../services/agent-project-directories"
import { projectSource } from "../services/agent-project-recents"
import { listSshConfigProfiles } from "../services/ssh-config"
import { AgentProjectEnvironmentDialog } from "./AgentProjectEnvironmentDialog"
import { AgentProjectPicker } from "./AgentProjectPicker"

export type AgentLaunchStep = { kind: "projects" }

export function AgentLaunchDialog({
  onLaunch,
  onClose,
  onCancelLaunch,
  sessions,
}: {
  onLaunch: (command: FreeTerminalCommand) => string | undefined
  onClose: () => void
  onCancelLaunch: (id: string) => void
  sessions: readonly TerminalSession[]
}) {
  const [target, setTarget] = useState<AgentProjectTarget>({ kind: "local" })
  const [environments, setEnvironments] = useState(false)
  const [profiles, setProfiles] = useState<TerminalRemoteCodexProfile[]>([])
  const [profilesLoading, setProfilesLoading] = useState(true)
  const [error, setError] = useState("")
  const discovery = useRef<AbortController | null>(null)
  const loadProfiles = useCallback(() => {
    discovery.current?.abort()
    const controller = new AbortController()
    discovery.current = controller
    setError("")
    setProfilesLoading(true)
    void listSshConfigProfiles({ signal: controller.signal }).then(
      (values) => {
        if (!controller.signal.aborted) {
          setProfiles(values)
          setProfilesLoading(false)
        }
      },
      (cause) => {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : "Nenhum alias SSH encontrado.")
          setProfilesLoading(false)
        }
      },
    )
  }, [])
  useEffect(() => {
    loadProfiles()
    return () => discovery.current?.abort()
  }, [loadProfiles])
  return (
    <>
      <AgentProjectPicker
        key={projectSource(target)}
        target={target}
        sessions={sessions}
        inactive={environments}
        onEnvironment={() => setEnvironments(true)}
        onLaunch={onLaunch}
        onCancelLaunch={onCancelLaunch}
        onClose={onClose}
      />
      {environments && (
        <AgentProjectEnvironmentDialog
          profiles={profiles}
          loading={profilesLoading}
          error={error}
          onClose={() => setEnvironments(false)}
          onSelect={(next) => {
            if (projectSource(next) !== projectSource(target)) setTarget(next)
            setEnvironments(false)
          }}
        />
      )}
    </>
  )
}
