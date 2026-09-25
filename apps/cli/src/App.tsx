import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import { Tabs } from "@tuiparts/react/tabs"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import {
  focusedRenderableId,
  ownsInterrupt,
  ownsKeyboardFocus,
} from "@xupon/tuiminal-core/keyboard/scope"
import { withNotifications } from "@xupon/tuiminal-core/notifications/index"
import { COLORS, LAYOUT, separatorBorder } from "@xupon/tuiminal-core/settings/theme"
import { BRAND_COLOR } from "@xupon/tuiminal-core/ui/brand"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { MountWhen } from "@xupon/tuiminal-core/ui/MountWhen"
import { withSelectionClipboard } from "@xupon/tuiminal-core/ui/SelectionClipboard"
import type {
  DatabaseQueryHistoryEntry,
  DatabaseQueryRerunRequest,
} from "@xupon/tuiminal-feature-database"
import type { HttpClientUrlRequest } from "@xupon/tuiminal-feature-http"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { TOOL_KEYBOARD_SCOPES } from "./feature-registry"
import {
  DatabaseQueryHistoryModal,
  DatabaseViewer,
  databaseQueryHistoryCanRerun,
  FreeTerminal,
  GitViewer,
  HttpClient,
  listDatabaseQueryHistory,
  PinnedTerminalSidebar,
  Runner,
} from "./features/components"
import { loadedFeature } from "./features/registry"
import { useFeatureRetirement } from "./features/use-feature-retirement"
import { useFeatureWorkspace, WorkspaceInstaller, withFeatures } from "./features/workspace"
import { globalApplicationShortcut } from "./global-shortcuts"
import { useApplicationExit } from "./hooks/use-application-exit"
import { useConfigurationLayer } from "./hooks/use-configuration-layer"
import { useGitConfigurationLayer } from "./hooks/use-git-configuration-layer"
import { useRemoteServerSetup } from "./hooks/use-remote-server-setup"
import {
  activateConfigurationSection,
  configurationContextForTool,
} from "./model/configuration-context"
import { type ToolId as AppTab, resolveToolLaunch, TOOL_LABELS as TAB_LABELS } from "./tool-catalog"
import { getTutorialSteps, TutorialOverlay } from "./tutorial/TutorialOverlay"
import { applicationExitLayer } from "./ui/application-exit-layer"
import type { ConfigurationSection } from "./ui/ConfigurationModal"
import { SensitiveTermsModal } from "./ui/SensitiveTermsModal"
import { withStartupAnimation } from "./ui/StartupAnimation"
import { WorkspaceConfigurationOverlay } from "./ui/WorkspaceConfigurationOverlay"
import { WorkspaceHeader } from "./ui/WorkspaceHeader"
import { contextualRemoteSettingsOwnKey } from "./ui/terminal-remote-settings"

function syncVisitedTools(
  visited: Set<AppTab>,
  installed: readonly AppTab[],
  closed: ReadonlySet<AppTab>,
  active: AppTab,
) {
  for (const id of visited) {
    if (!installed.includes(id) || closed.has(id)) visited.delete(id)
  }
  if (installed.includes(active) && !closed.has(active) && loadedFeature(active))
    visited.add(active)
}

function contextualSettingsOwnKey(focusedId: string | null | undefined, keyName: string) {
  if (focusedId === "configuration-terminal-agent-input") return true
  return contextualRemoteSettingsOwnKey(focusedId, keyName)
}

export function AppContent() {
  const features = useFeatureWorkspace()
  const renderer = useRenderer()
  const terminal = useTerminalDimensions()
  const [{ onlyTab: ONLY_TAB, initialTab: INITIAL_TAB }] = useState(() =>
    resolveToolLaunch(process.env.TUIMINAL_INITIAL_TAB, process.env.TUIMINAL_ONLY_TAB),
  )
  const [activeTab, setActiveTab] = useState<AppTab>(features.initial ?? INITIAL_TAB)
  const visitedTabsRef = useRef(new Set<AppTab>())
  const { closed, retire, resume } = useFeatureRetirement()
  syncVisitedTools(visitedTabsRef.current, features.state.installed, closed, activeTab)
  const [sensitiveTermsOpen, setSensitiveTermsOpen] = useState(false)
  const [queryHistoryOpen, setQueryHistoryOpen] = useState(false)
  const [queryHistoryEntries, setQueryHistoryEntries] = useState<DatabaseQueryHistoryEntry[]>([])
  const [databaseQueryRerunRequest, setDatabaseQueryRerunRequest] =
    useState<DatabaseQueryRerunRequest | null>(null)
  const [runnerHttpRequest, setRunnerHttpRequest] = useState<HttpClientUrlRequest | null>(null)
  const [tutorialOpen, setTutorialOpen] = useState(false)
  const [tutorialTargetId, setTutorialTargetId] = useState<string | null>(null)
  const [terminalMasterKeyActive, setTerminalMasterKeyActive] = useState(false)
  const [terminalSidebarFocused, setTerminalSidebarFocused] = useState(false)
  useEffect(() => {
    const update = () =>
      setTerminalSidebarFocused(
        focusedRenderableId(renderer.currentFocusedRenderable)?.startsWith("terminal-sidebar") ??
          false,
      )
    update()
    renderer.on("focused_renderable", update)
    return () => {
      renderer.off("focused_renderable", update)
    }
  }, [renderer])
  const selectTab = useCallback(
    async (id: AppTab) => {
      if (ONLY_TAB && id !== ONLY_TAB) return
      if (!features.state.installed.includes(id)) {
        features.setInstaller(id)
        return
      }
      if (await features.controller.open(id)) {
        resume(id)
        setActiveTab(id)
        features.setInstaller(false)
      } else if (features.controller.snapshot().error) features.setInstaller(id)
    },
    [features.controller, features.state.installed, features.setInstaller, ONLY_TAB, resume],
  )
  const openRunnerPortInHttp = useCallback(
    (url: string) => {
      setRunnerHttpRequest({ id: Date.now(), url })
      void selectTab("http")
    },
    [selectTab],
  )
  const queryRerunCounterRef = useRef(0)
  const exit = useApplicationExit(renderer, visitedTabsRef)
  const gitConfiguration = useGitConfigurationLayer()
  const [compactNavigation, minimalNavigation] = [terminal.width < 150, terminal.width < 82]
  const tutorialScreen = ONLY_TAB ?? activeTab
  const configurationContext = features.showInstaller
    ? "installer"
    : configurationContextForTool(tutorialScreen)
  const configuration = useConfigurationLayer(configurationContext)
  const {
    settings,
    open: settingsOpen,
    applySettings,
    close: closeSettings,
    openSettings: openConfiguration,
    openGit: openGitConfiguration,
    handleKey: handleConfigurationKey,
  } = configuration
  const openTerminalForSetup = useCallback(() => void selectTab("terminal"), [selectTab])
  const remoteSetup = useRemoteServerSetup(closeSettings, openTerminalForSetup)
  const tutorialSteps = useMemo(() => getTutorialSteps(tutorialScreen), [tutorialScreen])
  const modalBlocked = settingsOpen || tutorialOpen || exit.open
  const interactionBlocked = modalBlocked || features.showInstaller || Boolean(features.state.busy)
  const backgroundToolActive = !interactionBlocked && !terminalSidebarFocused
  const openSettings = useCallback(() => {
    openConfiguration()
    setQueryHistoryEntries(configurationContext === "database" ? listDatabaseQueryHistory() : [])
    setSensitiveTermsOpen(false)
  }, [configurationContext, openConfiguration])
  const openQueryHistory = useCallback(() => {
    if (configurationContext !== "database") return
    setQueryHistoryEntries(listDatabaseQueryHistory())
    setQueryHistoryOpen(true)
  }, [configurationContext])

  const queryHistoryCanRerun = useCallback(
    (entry: DatabaseQueryHistoryEntry) => {
      return (ONLY_TAB === null || ONLY_TAB === "database") && databaseQueryHistoryCanRerun(entry)
    },
    [ONLY_TAB],
  )
  const rerunHistoryQuery = useCallback(
    (entry: DatabaseQueryHistoryEntry) => {
      if (!queryHistoryCanRerun(entry)) return
      queryRerunCounterRef.current += 1
      setDatabaseQueryRerunRequest({
        id: `${entry.id}-${queryRerunCounterRef.current}`,
        connectionId: entry.connectionId,
        sql: entry.sql,
      })
      setQueryHistoryOpen(false)
      closeSettings()
      if (!ONLY_TAB) setActiveTab("database")
    },
    [ONLY_TAB, closeSettings, queryHistoryCanRerun],
  )
  const startTutorial = useCallback(() => {
    closeSettings()
    setTutorialTargetId(null)
    setTutorialOpen(true)
  }, [closeSettings])
  const closeTutorial = useCallback(() => {
    setTutorialOpen(false)
    setTutorialTargetId(null)
  }, [])
  const openFeatures = useCallback(() => {
    closeSettings()
    features.setInstaller(true)
  }, [closeSettings, features.setInstaller])
  const activateConfiguration = useCallback(
    (section: ConfigurationSection) => {
      activateConfigurationSection(section, {
        startTutorial,
        openFeatures,
        openHistory: openQueryHistory,
        openSensitive: () => setSensitiveTermsOpen(true),
        focusRemoteConnection: () =>
          renderer.root.findDescendantById("configuration-terminal-remote-view")?.focus(),
      })
    },
    [openFeatures, openQueryHistory, renderer, startTutorial],
  )

  useKeyboard((key) => {
    exit.guardKey(key)
    const focusedId = focusedRenderableId(renderer.currentFocusedRenderable)
    const sidebarOwnsFocus = focusedId?.startsWith("terminal-sidebar") ?? false
    if (features.installerModal.current || focusedId?.startsWith("feature-uninstall-")) return
    const keyboardScope = features.showInstaller ? {} : TOOL_KEYBOARD_SCOPES[ONLY_TAB ?? activeTab]
    const globalLayerAvailable =
      !modalBlocked &&
      !sidebarOwnsFocus &&
      (features.showInstaller || !ownsKeyboardFocus(keyboardScope, focusedId))
    const globalShortcut = globalApplicationShortcut(key, globalLayerAvailable, Boolean(ONLY_TAB))
    if (globalShortcut) {
      key.preventDefault()
      if (globalShortcut === "settings") openSettings()
      else void selectTab(globalShortcut)
      return
    }

    if (key.defaultPrevented) return

    if (queryHistoryOpen || sensitiveTermsOpen) return

    if (tutorialOpen) {
      key.preventDefault()
      return
    }

    if (settingsOpen && contextualSettingsOwnKey(focusedId, key.name)) return
    if (handleConfigurationKey(key, activateConfiguration)) return

    if (features.showInstaller && !(key.ctrl && key.name === "c") && key.name !== "q") return

    if (
      key.ctrl &&
      key.name === "c" &&
      !sidebarOwnsFocus &&
      !ownsInterrupt(keyboardScope, focusedId)
    ) {
      features.controller.cancel()
      void exit.quit()
      return
    }

    if (sidebarOwnsFocus || ownsKeyboardFocus(keyboardScope, focusedId)) return

    if (key.name === "escape" && keyboardScope.deferEscape) {
      setTimeout(() => {
        if (!key.defaultPrevented) void exit.quit()
      }, 0)
      return
    }

    if (key.name === "q" || key.name === "escape") {
      features.controller.cancel()
      void exit.quit()
    }
  })

  const exitModal = applicationExitLayer(exit, terminal)
  const overlays = (
    <>
      <MountWhen when={features.showInstaller}>
        <WorkspaceInstaller
          onlyTool={ONLY_TAB}
          blocked={modalBlocked}
          onOpen={(id) => void selectTab(id)}
          onUninstall={(id) =>
            void features.controller.uninstall(id, async () => {
              await retire(id)
              if (id === "http") {
                exit.track(false)
                setRunnerHttpRequest(null)
              }
              if (id === "database") setDatabaseQueryRerunRequest(null)
            })
          }
          onSettings={openSettings}
          onClose={() => {
            features.controller.cancel()
            if (features.initial && (!ONLY_TAB || features.state.installed.includes(ONLY_TAB))) {
              void selectTab(
                features.state.installed.includes(activeTab) && loadedFeature(activeTab)
                  ? activeTab
                  : features.initial,
              )
            } else void exit.quit()
          }}
        />
      </MountWhen>
      <WorkspaceConfigurationOverlay
        configuration={configuration}
        context={configurationContext}
        tutorialScreen={tutorialScreen}
        queryHistoryCount={queryHistoryEntries.length}
        onOpenSensitiveTerms={() => setSensitiveTermsOpen(true)}
        onOpenQueryHistory={openQueryHistory}
        onStartTutorial={startTutorial}
        onOpenFeatures={openFeatures}
        onGitConfigurationChanged={gitConfiguration.onChanged}
        onConfigureRemoteServer={remoteSetup.configure}
      />
      <MountWhen when={sensitiveTermsOpen}>
        <SensitiveTermsModal
          open
          terms={settings.sensitiveTerms}
          onClose={() => setSensitiveTermsOpen(false)}
          onSave={(terms) => {
            applySettings({ sensitiveTerms: terms })
            setSensitiveTermsOpen(false)
          }}
        />
      </MountWhen>
      <MountWhen when={queryHistoryOpen}>
        <DatabaseQueryHistoryModal
          open
          entries={queryHistoryEntries}
          onEntriesChanged={setQueryHistoryEntries}
          canRerun={queryHistoryCanRerun}
          onClose={() => setQueryHistoryOpen(false)}
          onRerun={rerunHistoryQuery}
        />
      </MountWhen>
      <MountWhen when={tutorialOpen}>
        <TutorialOverlay
          open
          steps={tutorialSteps}
          onClose={closeTutorial}
          onStepChange={setTutorialTargetId}
        />
      </MountWhen>
      {exitModal}
    </>
  )
  if (ONLY_TAB) {
    return (
      <box style={{ flexGrow: 1, backgroundColor: LAYOUT.workspaceBackground }}>
        <box
          id="tutorial-app-header"
          style={{
            height: ONLY_TAB === "terminal" || LAYOUT.compact ? 1 : 2,
            flexShrink: 0,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            ...(ONLY_TAB === "terminal" ? { border: false } : separatorBorder()),
            backgroundColor: COLORS.panel,
            paddingLeft: 1,
            paddingRight: 1,
          }}
        >
          <text content="◆ TUIMINAL" style={{ fg: BRAND_COLOR }} />
          <text
            content={`◆ ${translateUi(TAB_LABELS[ONLY_TAB])} · ${translateUi("MODO ISOLADO")}`}
            style={{ fg: COLORS.muted }}
          />
          <box style={{ flexDirection: "row", alignItems: "center" }}>
            <InlineButton
              compact={ONLY_TAB === "terminal" || LAYOUT.compact}
              id="tutorial-settings-button"
              label={compactNavigation ? "[,]" : "[,] Config"}
              accent={COLORS.focus}
              shortcutColor={
                ONLY_TAB === "terminal" && !terminalMasterKeyActive ? COLORS.muted : undefined
              }
              onPress={openSettings}
            />
            <InlineButton
              compact={ONLY_TAB === "terminal" || LAYOUT.compact}
              id="app-exit-button"
              label={compactNavigation ? "[Q]" : "[Q] Sair"}
              accent={COLORS.focus}
              shortcutColor={
                ONLY_TAB === "terminal" && !terminalMasterKeyActive ? COLORS.muted : undefined
              }
              onPress={() => void exit.quit()}
            />
          </box>
        </box>

        <box style={{ flexGrow: 1, flexDirection: "row", minHeight: 1 }}>
          <PinnedTerminalSidebar
            active={!interactionBlocked}
            height={Math.max(
              1,
              terminal.height - (ONLY_TAB === "terminal" || LAYOUT.compact ? 1 : 2),
            )}
            onOpenTerminal={() => {
              if (ONLY_TAB === "terminal") return
              void selectTab("terminal")
            }}
          />
          <box id="tutorial-current-tool" style={{ flexGrow: 1, minWidth: 1 }}>
            {features.state.installed.includes(ONLY_TAB) &&
              !closed.has(ONLY_TAB) &&
              ONLY_TAB === "database" && (
                <DatabaseViewer
                  active={backgroundToolActive}
                  tutorialMode={tutorialOpen}
                  queryRerunRequest={databaseQueryRerunRequest}
                  onQueryRerunRequestHandled={() => setDatabaseQueryRerunRequest(null)}
                />
              )}
            {features.state.installed.includes(ONLY_TAB) &&
              !closed.has(ONLY_TAB) &&
              ONLY_TAB === "git" && (
                <GitViewer
                  active={backgroundToolActive}
                  tutorialMode={tutorialOpen}
                  tutorialTargetId={tutorialTargetId}
                  configurationRevision={gitConfiguration.revision}
                  localConfigurationRevision={gitConfiguration.localRevision}
                  onOpenLocalConfiguration={() => openGitConfiguration("diffs")}
                />
              )}
            {features.state.installed.includes(ONLY_TAB) &&
              !closed.has(ONLY_TAB) &&
              ONLY_TAB === "runner" && <Runner active={backgroundToolActive} />}
            {features.state.installed.includes(ONLY_TAB) &&
              !closed.has(ONLY_TAB) &&
              ONLY_TAB === "http" && (
                <HttpClient
                  active={backgroundToolActive}
                  tutorialMode={tutorialOpen}
                  onUnsavedChangesChange={exit.track}
                />
              )}
            {features.state.installed.includes(ONLY_TAB) &&
              !closed.has(ONLY_TAB) &&
              ONLY_TAB === "terminal" && (
                <FreeTerminal
                  active={!interactionBlocked}
                  externalSidebarHost
                  remoteSetupRequest={remoteSetup.request}
                  onRemoteSetupRequestHandled={remoteSetup.handled}
                  onMasterKeyActiveChange={setTerminalMasterKeyActive}
                  onOpenSettings={openSettings}
                  onQuit={() => {
                    features.controller.cancel()
                    void exit.quit()
                  }}
                />
              )}
          </box>
        </box>
        {overlays}
      </box>
    )
  }

  return (
    <Tabs.Root
      value={activeTab}
      onValueChange={(value) => void selectTab(value as AppTab)}
      flexGrow={1}
      backgroundColor={LAYOUT.workspaceBackground}
    >
      <WorkspaceHeader
        terminalCompact={activeTab === "terminal"}
        installed={features.state.installed}
        compactNavigation={compactNavigation}
        minimalNavigation={minimalNavigation}
        terminalMasterKeyActive={terminalMasterKeyActive}
        openSettings={openSettings}
        onQuit={() => {
          features.controller.cancel()
          void exit.quit()
        }}
      />

      <box style={{ flexGrow: 1, flexDirection: "row", minHeight: 1 }}>
        <PinnedTerminalSidebar
          active={!interactionBlocked}
          height={Math.max(
            1,
            terminal.height - (activeTab === "terminal" || LAYOUT.compact ? 1 : 2),
          )}
          onOpenTerminal={() => void selectTab("terminal")}
        />
        <box style={{ flexGrow: 1, minWidth: 1 }}>
          <Tabs.Panel value="database" flexGrow={1} keepMounted>
            {visitedTabsRef.current.has("database") ? (
              <box
                {...(activeTab === "database" ? { id: "tutorial-current-tool" } : {})}
                style={{ flexGrow: 1 }}
              >
                <DatabaseViewer
                  active={activeTab === "database" && backgroundToolActive}
                  tutorialMode={tutorialOpen}
                  queryRerunRequest={databaseQueryRerunRequest}
                  onQueryRerunRequestHandled={() => setDatabaseQueryRerunRequest(null)}
                />
              </box>
            ) : null}
          </Tabs.Panel>
          <Tabs.Panel value="git" flexGrow={1} keepMounted>
            {visitedTabsRef.current.has("git") ? (
              <box
                {...(activeTab === "git" ? { id: "tutorial-current-tool" } : {})}
                style={{ flexGrow: 1 }}
              >
                <GitViewer
                  active={activeTab === "git" && backgroundToolActive}
                  tutorialMode={tutorialOpen}
                  tutorialTargetId={tutorialTargetId}
                  configurationRevision={gitConfiguration.revision}
                  localConfigurationRevision={gitConfiguration.localRevision}
                  onOpenLocalConfiguration={() => openGitConfiguration("diffs")}
                />
              </box>
            ) : null}
          </Tabs.Panel>
          <Tabs.Panel value="runner" flexGrow={1} keepMounted>
            {visitedTabsRef.current.has("runner") ? (
              <box
                {...(activeTab === "runner" ? { id: "tutorial-current-tool" } : {})}
                style={{ flexGrow: 1 }}
              >
                <Runner
                  active={activeTab === "runner" && backgroundToolActive}
                  onOpenHttp={openRunnerPortInHttp}
                />
              </box>
            ) : null}
          </Tabs.Panel>
          <Tabs.Panel value="http" flexGrow={1} keepMounted>
            {visitedTabsRef.current.has("http") ? (
              <box
                {...(activeTab === "http" ? { id: "tutorial-current-tool" } : {})}
                style={{ flexGrow: 1 }}
              >
                <HttpClient
                  active={activeTab === "http" && backgroundToolActive}
                  tutorialMode={tutorialOpen}
                  initialUrlRequest={runnerHttpRequest}
                  onUnsavedChangesChange={exit.track}
                />
              </box>
            ) : null}
          </Tabs.Panel>
          <Tabs.Panel value="terminal" flexGrow={1} keepMounted>
            {visitedTabsRef.current.has("terminal") ? (
              <box
                {...(activeTab === "terminal" ? { id: "tutorial-current-tool" } : {})}
                style={{ flexGrow: 1 }}
              >
                <FreeTerminal
                  active={activeTab === "terminal" && !interactionBlocked}
                  externalSidebarHost
                  remoteSetupRequest={remoteSetup.request}
                  onRemoteSetupRequestHandled={remoteSetup.handled}
                  onMasterKeyActiveChange={setTerminalMasterKeyActive}
                  onOpenSettings={openSettings}
                  onSelectTool={(tool) => void selectTab(tool)}
                  onQuit={() => {
                    features.controller.cancel()
                    void exit.quit()
                  }}
                />
              </box>
            ) : null}
          </Tabs.Panel>
        </box>
      </box>
      {overlays}
    </Tabs.Root>
  )
}

export const App = withNotifications(
  withSelectionClipboard(withStartupAnimation(withFeatures(AppContent))),
)
