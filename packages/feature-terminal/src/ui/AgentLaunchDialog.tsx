import type { TerminalRemoteCodexProfile } from "@xupon/tuiminal-core/settings/theme"
import { useCallback, useEffect, useRef, useState } from "react"
import { agentProviderHasCapability, type AgentProviderId } from "../model/agent-provider"
import type { RemoteCodexCompatibilityReport } from "../model/remote-codex"
import type { FreeTerminalCommand, TerminalSession } from "../model/sessions"
import type { AgentProjectTarget } from "../services/agent-project-directories"
import { projectSource } from "../services/agent-project-recents"
import { listSshConfigProfiles } from "../services/ssh-config"
import { AgentProjectEnvironmentDialog } from "./AgentProjectEnvironmentDialog"
import { AgentProjectPicker } from "./AgentProjectPicker"
import { AgentProviderPicker } from "./AgentProviderPicker"

export type AgentLaunchStep =
  | { kind: "providers" }
  | { kind: "projects"; providerId: AgentProviderId }

export function AgentLaunchDialog({
  step,
  onStep,
  onLaunch,
  onClose,
  onCancelLaunch,
  onCompatibility,
  sessions,
  inactive = false,
}: {
  step: AgentLaunchStep
  onStep: (step: AgentLaunchStep) => void
  onLaunch: (command: FreeTerminalCommand) => string | undefined
  onClose: () => void
  onCancelLaunch: (id: string) => void
  onCompatibility: (
    command: FreeTerminalCommand,
    report: RemoteCodexCompatibilityReport,
    sessionId: string,
  ) => void
  sessions: readonly TerminalSession[]
  inactive?: boolean
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
      {step.kind === "providers" && (
        <AgentProviderPicker
          inactive={inactive}
          onSelect={(providerId) => onStep({ kind: "projects", providerId })}
          onClose={onClose}
        />
      )}
      {step.kind === "projects" && (
        <AgentProjectPicker
          key={`${step.providerId}:${projectSource(target)}`}
          providerId={step.providerId}
          target={target}
          sessions={sessions}
          inactive={environments || inactive}
          environmentEnabled={agentProviderHasCapability(step.providerId, "remote-launch")}
          onEnvironment={() => setEnvironments(true)}
          onLaunch={onLaunch}
          onCancelLaunch={onCancelLaunch}
          onCompatibility={onCompatibility}
          onClose={() => onStep({ kind: "providers" })}
          onLaunched={onClose}
        />
      )}
      {step.kind === "projects" && environments && (
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
