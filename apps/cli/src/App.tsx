import { BRAND_COLOR } from "@xupon/tuiminal-core/ui/brand"
import { type ToolId as AppTab, TOOL_LABELS as TAB_LABELS, resolveToolLaunch } from "./tool-catalog"
import {
  focusedRenderableId,
  ownsKeyboardFocus,
  ownsInterrupt,
} from "@xupon/tuiminal-core/keyboard/scope"
import { TOOL_KEYBOARD_SCOPES } from "./feature-registry"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import { Tabs } from "@tuiparts/react/tabs"
import { useCallback, useMemo, useRef, useState } from "react"
import { ConfigurationModal, type ConfigurationSection } from "./ui/ConfigurationModal"
import {
  DatabaseQueryHistoryModal,
  DatabaseViewer,
  FreeTerminal,
  GitViewer,
  HttpClient,
  Runner,
  databaseQueryHistoryCanRerun,
  listDatabaseQueryHistory,
} from "./features/components"
import { withFeatures, useFeatureWorkspace, WorkspaceInstaller } from "./features/workspace"
import { loadedFeature } from "./features/registry"
import { useFeatureRetirement } from "./features/use-feature-retirement"
import type { DatabaseQueryRerunRequest } from "@xupon/tuiminal-feature-database"
import type { HttpClientUrlRequest } from "@xupon/tuiminal-feature-http"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { MountWhen } from "@xupon/tuiminal-core/ui/MountWhen"
import { SensitiveTermsModal } from "./ui/SensitiveTermsModal"
import { getTutorialSteps, TutorialOverlay } from "./tutorial/TutorialOverlay"
import type { DatabaseQueryHistoryEntry } from "@xupon/tuiminal-feature-database"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { COLORS, LAYOUT, separatorBorder } from "@xupon/tuiminal-core/settings/theme"
import { WorkspaceHeader } from "./ui/WorkspaceHeader"
import { applicationExitLayer } from "./ui/application-exit-layer"
import { useApplicationExit } from "./hooks/use-application-exit"
import { useConfigurationLayer } from "./hooks/use-configuration-layer"
import { useGitConfigurationLayer } from "./hooks/use-git-configuration-layer"
import { withNotifications } from "@xupon/tuiminal-core/notifications/index"
import { globalApplicationShortcut } from "./global-shortcuts"
import {
  activateConfigurationSection,
  configurationContextForTool,
} from "./model/configuration-context"
import { withStartupAnimation } from "./ui/StartupAnimation"
import { withSelectionClipboard } from "@xupon/tuiminal-core/ui/SelectionClipboard"

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
  for (const id of visitedTabsRef.current) {
    if (!features.state.installed.includes(id) || closed.has(id)) visitedTabsRef.current.delete(id)
  }
  if (
    features.state.installed.includes(activeTab) &&
    !closed.has(activeTab) &&
    loadedFeature(activeTab)
  )
    visitedTabsRef.current.add(activeTab)
  const [sensitiveTermsOpen, setSensitiveTermsOpen] = useState(false)
  const [queryHistoryOpen, setQueryHistoryOpen] = useState(false)
  const [queryHistoryEntries, setQueryHistoryEntries] = useState<DatabaseQueryHistoryEntry[]>([])
  const [databaseQueryRerunRequest, setDatabaseQueryRerunRequest] =
    useState<DatabaseQueryRerunRequest | null>(null)
  const [runnerHttpRequest, setRunnerHttpRequest] = useState<HttpClientUrlRequest | null>(null)
  const [tutorialOpen, setTutorialOpen] = useState(false)
  const [tutorialTargetId, setTutorialTargetId] = useState<string | null>(null)
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
    section: configurationSection,
    focusedSection: configurationCursor,
    navigationActive: configurationNavigationActive,
    notice: settingsNotice,
    applySettings,
    close: closeSettings,
    focusNavigation,
    selectSection: selectConfigurationSection,
    focusSection: focusConfigurationSection,
    reset: restoreDefaultSettings,
    openSettings: openConfiguration,
    openGit: openGitConfiguration,
    handleKey: handleConfigurationKey,
  } = configuration
  const tutorialSteps = useMemo(() => getTutorialSteps(tutorialScreen), [tutorialScreen])
  const modalBlocked = settingsOpen || tutorialOpen || exit.open
  const interactionBlocked = modalBlocked || features.showInstaller || Boolean(features.state.busy)
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
      })
    },
    [openFeatures, openQueryHistory, startTutorial],
  )

  useKeyboard((key) => {
    exit.guardKey(key)
    const focusedId = focusedRenderableId(renderer.currentFocusedRenderable)
    if (features.installerModal.current || focusedId?.startsWith("feature-uninstall-")) return
    const keyboardScope = features.showInstaller ? {} : TOOL_KEYBOARD_SCOPES[ONLY_TAB ?? activeTab]
    const globalLayerAvailable =
      !modalBlocked && (features.showInstaller || !ownsKeyboardFocus(keyboardScope, focusedId))
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

    if (handleConfigurationKey(key, activateConfiguration)) return

    if (features.showInstaller && !(key.ctrl && key.name === "c") && key.name !== "q") return

    if (key.ctrl && key.name === "c" && !ownsInterrupt(keyboardScope, focusedId)) {
      features.controller.cancel()
      void exit.quit()
      return
    }

    if (ownsKeyboardFocus(keyboardScope, focusedId)) return

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
      <MountWhen when={settingsOpen}>
        <ConfigurationModal
          open
          settings={settings}
          section={configurationSection}
          focusedSection={configurationCursor}
          navigationActive={configurationNavigationActive}
          notice={settingsNotice}
          onClose={closeSettings}
          onSectionChange={selectConfigurationSection}
          onSectionFocus={focusConfigurationSection}
          onNavigationFocus={focusNavigation}
          onPaletteChange={(palette) => applySettings({ palette })}
          onColorModeChange={(colorMode) => applySettings({ colorMode })}
          onLayoutChange={(layout) => applySettings({ layout })}
          onLanguageChange={(language) => applySettings({ language })}
          onOpenSensitiveTerms={() => setSensitiveTermsOpen(true)}
          onReset={restoreDefaultSettings}
          onOpenQueryHistory={openQueryHistory}
          onStartTutorial={startTutorial}
          onOpenFeatures={openFeatures}
          queryHistoryCount={queryHistoryEntries.length}
          tutorialLabel={TAB_LABELS[tutorialScreen]}
          context={configurationContext}
          onGitConfigurationChanged={gitConfiguration.onChanged}
        />
      </MountWhen>
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
            height: LAYOUT.compact ? 1 : 2,
            flexShrink: 0,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            ...separatorBorder(),
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
              id="tutorial-settings-button"
              label={compactNavigation ? "[,]" : "[,] Config"}
              accent={COLORS.focus}
              onPress={openSettings}
            />
            <InlineButton
              id="app-exit-button"
              label={compactNavigation ? "[Q]" : "[Q] Sair"}
              accent={COLORS.focus}
              onPress={() => void exit.quit()}
            />
          </box>
        </box>

        <box id="tutorial-current-tool" style={{ flexGrow: 1 }}>
          {features.state.installed.includes(ONLY_TAB) &&
            !closed.has(ONLY_TAB) &&
            ONLY_TAB === "database" && (
              <DatabaseViewer
                active={!interactionBlocked}
                tutorialMode={tutorialOpen}
                queryRerunRequest={databaseQueryRerunRequest}
                onQueryRerunRequestHandled={() => setDatabaseQueryRerunRequest(null)}
              />
            )}
          {features.state.installed.includes(ONLY_TAB) &&
            !closed.has(ONLY_TAB) &&
            ONLY_TAB === "git" && (
              <GitViewer
                active={!interactionBlocked}
                tutorialMode={tutorialOpen}
                tutorialTargetId={tutorialTargetId}
                configurationRevision={gitConfiguration.revision}
                localConfigurationRevision={gitConfiguration.localRevision}
                onOpenLocalConfiguration={() => openGitConfiguration("diffs")}
              />
            )}
          {features.state.installed.includes(ONLY_TAB) &&
            !closed.has(ONLY_TAB) &&
            ONLY_TAB === "runner" && <Runner active={!interactionBlocked} />}
          {features.state.installed.includes(ONLY_TAB) &&
            !closed.has(ONLY_TAB) &&
            ONLY_TAB === "http" && (
              <HttpClient
                active={!interactionBlocked}
                tutorialMode={tutorialOpen}
                onUnsavedChangesChange={exit.track}
              />
            )}
          {features.state.installed.includes(ONLY_TAB) &&
            !closed.has(ONLY_TAB) &&
            ONLY_TAB === "terminal" && <FreeTerminal active={!interactionBlocked} />}
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
        installed={features.state.installed}
        compactNavigation={compactNavigation}
        minimalNavigation={minimalNavigation}
        openSettings={openSettings}
        onQuit={() => {
          features.controller.cancel()
          void exit.quit()
        }}
      />

      <Tabs.Panel value="database" flexGrow={1} keepMounted>
        {visitedTabsRef.current.has("database") ? (
          <box
            {...(activeTab === "database" ? { id: "tutorial-current-tool" } : {})}
            style={{ flexGrow: 1 }}
          >
            <DatabaseViewer
              active={activeTab === "database" && !interactionBlocked}
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
              active={activeTab === "git" && !interactionBlocked}
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
              active={activeTab === "runner" && !interactionBlocked}
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
              active={activeTab === "http" && !interactionBlocked}
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
            <FreeTerminal active={activeTab === "terminal" && !interactionBlocked} />
          </box>
        ) : null}
      </Tabs.Panel>
      {overlays}
    </Tabs.Root>
  )
}

export const App = withNotifications(
  withSelectionClipboard(withStartupAnimation(withFeatures(AppContent))),
)
