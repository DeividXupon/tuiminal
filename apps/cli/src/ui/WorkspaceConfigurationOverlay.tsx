import { MountWhen } from "@xupon/tuiminal-core/ui/MountWhen"
import { checkRemoteServerReadiness, testRemoteCodexConnection } from "../features/components"
import type { TerminalRemoteCodexProfile } from "@xupon/tuiminal-core/settings/theme"
import type { useConfigurationLayer } from "../hooks/use-configuration-layer"
import type { ConfigurationContext } from "../model/configuration-context"
import { TOOL_LABELS, type ToolId } from "../tool-catalog"
import { ConfigurationModal } from "./ConfigurationModal"

export function WorkspaceConfigurationOverlay({
  configuration,
  context,
  tutorialScreen,
  queryHistoryCount,
  onOpenSensitiveTerms,
  onOpenQueryHistory,
  onStartTutorial,
  onOpenFeatures,
  onGitConfigurationChanged,
  onConfigureRemoteServer,
}: {
  configuration: ReturnType<typeof useConfigurationLayer>
  context: ConfigurationContext
  tutorialScreen: ToolId
  queryHistoryCount: number
  onOpenSensitiveTerms: () => void
  onOpenQueryHistory: () => void
  onStartTutorial: () => void
  onOpenFeatures: () => void
  onGitConfigurationChanged: (change: "local" | "remote") => void
  onConfigureRemoteServer: (profile: TerminalRemoteCodexProfile) => void
}) {
  const {
    settings,
    open,
    section,
    focusedSection,
    navigationActive,
    notice,
    applySettings,
    close,
    focusNavigation,
    selectSection,
    focusSection,
    reset,
  } = configuration
  return (
    <MountWhen when={open}>
      <ConfigurationModal
        open
        settings={settings}
        section={section}
        focusedSection={focusedSection}
        navigationActive={navigationActive}
        notice={notice}
        onClose={close}
        onSectionChange={selectSection}
        onSectionFocus={focusSection}
        onNavigationFocus={focusNavigation}
        onTerminalAgentCommandsChange={(terminalAgentCommands) =>
          applySettings({ terminalAgentCommands })
        }
        onTerminalRemoteProfilesChange={(terminalRemoteCodexProfiles) =>
          applySettings({ terminalRemoteCodexProfiles })
        }
        onTerminalRemoteActiveProfileChange={(terminalRemoteCodexActiveProfileId) =>
          applySettings({ terminalRemoteCodexActiveProfileId })
        }
        onTerminalRemoteProfileTest={testRemoteCodexConnection}
        onTerminalRemoteReadinessCheck={checkRemoteServerReadiness}
        onConfigureRemoteServer={onConfigureRemoteServer}
        onTerminalMasterKeyChange={(terminalMasterKey) => applySettings({ terminalMasterKey })}
        onPaletteChange={(palette) => applySettings({ palette })}
        onColorModeChange={(colorMode) => applySettings({ colorMode })}
        onLayoutChange={(layout) => applySettings({ layout })}
        onLanguageChange={(language) => applySettings({ language })}
        onOpenSensitiveTerms={onOpenSensitiveTerms}
        onReset={reset}
        onOpenQueryHistory={onOpenQueryHistory}
        onStartTutorial={onStartTutorial}
        onOpenFeatures={onOpenFeatures}
        queryHistoryCount={queryHistoryCount}
        tutorialLabel={TOOL_LABELS[tutorialScreen]}
        context={context}
        onGitConfigurationChanged={onGitConfigurationChanged}
      />
    </MountWhen>
  )
}
