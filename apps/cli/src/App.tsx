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
import {
  ConfigurationModal,
  type ConfigurationSection,
  configurationSectionsForContext,
  normalizeConfigurationSectionForContext,
} from "./ui/ConfigurationModal"
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
import { type DatabaseQueryRerunRequest } from "@xupon/tuiminal-feature-database"
import { type GitConfigurationTab } from "@xupon/tuiminal-feature-git"
import { type HttpClientUrlRequest } from "@xupon/tuiminal-feature-http"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { MountWhen } from "@xupon/tuiminal-core/ui/MountWhen"
import { SensitiveTermsModal } from "./ui/SensitiveTermsModal"
import { getTutorialSteps, TutorialOverlay } from "./tutorial/TutorialOverlay"
import type { DatabaseQueryHistoryEntry } from "@xupon/tuiminal-feature-database"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import {
  COLORS,
  getUiSettings,
  LAYOUT,
  resetUiSettings,
  separatorBorder,
  type UiSettings,
  updateUiSettings,
} from "@xupon/tuiminal-core/settings/theme"
import { WorkspaceHeader } from "./ui/WorkspaceHeader"
import { applicationExitLayer } from "./ui/application-exit-layer"
import { useApplicationExit } from "./hooks/use-application-exit"
import { useGitConfigurationLayer } from "./hooks/use-git-configuration-layer"
import {
  useNotificationFromValue,
  withNotifications,
} from "@xupon/tuiminal-core/notifications/index"
import { globalApplicationShortcut } from "./global-shortcuts"
import {
  activateConfigurationSection,
  configurationContextForTool,
} from "./model/configuration-context"
import { configurationSettingPatch } from "./model/configuration-options"
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
  const [settings, setSettings] = useState(getUiSettings)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [sensitiveTermsOpen, setSensitiveTermsOpen] = useState(false)
  const [queryHistoryOpen, setQueryHistoryOpen] = useState(false)
  const [queryHistoryEntries, setQueryHistoryEntries] = useState<DatabaseQueryHistoryEntry[]>([])
  const [databaseQueryRerunRequest, setDatabaseQueryRerunRequest] =
    useState<DatabaseQueryRerunRequest | null>(null)
  const [runnerHttpRequest, setRunnerHttpRequest] = useState<HttpClientUrlRequest | null>(null)
  const [tutorialOpen, setTutorialOpen] = useState(false)
  const [tutorialTargetId, setTutorialTargetId] = useState<string | null>(null)
  const [configurationSection, setConfigurationSection] = useState<ConfigurationSection>("palette")
  const [settingsNotice, setSettingsNotice] = useState("")
  useNotificationFromValue(settingsNotice, { source: "Configurações" })
  const settingsRef = useRef(settings)
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
  const configurationSectionRef = useRef(configurationSection)
  const queryRerunCounterRef = useRef(0)
  const exit = useApplicationExit(renderer, visitedTabsRef)
  const gitConfiguration = useGitConfigurationLayer()
  const [compactNavigation, minimalNavigation] = [terminal.width < 150, terminal.width < 82]
  const tutorialScreen = ONLY_TAB ?? activeTab
  const configurationContext = features.showInstaller
    ? "installer"
    : configurationContextForTool(tutorialScreen)
  const configurationSections = useMemo(
    () => configurationSectionsForContext(configurationContext),
    [configurationContext],
  )
  const tutorialSteps = useMemo(() => getTutorialSteps(tutorialScreen), [tutorialScreen])
  const modalBlocked = settingsOpen || gitConfiguration.open || tutorialOpen || exit.open
  const interactionBlocked = modalBlocked || features.showInstaller || Boolean(features.state.busy)
  const applySettings = useCallback((patch: Partial<UiSettings>) => {
    const result = updateUiSettings(patch)
    settingsRef.current = result.settings
    setSettings(result.settings)
    setSettingsNotice(result.error ?? "Configuração salva")
  }, [])
  const selectConfigurationSection = useCallback((section: ConfigurationSection) => {
    configurationSectionRef.current = section
    setConfigurationSection(section)
  }, [])
  const restoreDefaultSettings = useCallback(() => {
    const result = resetUiSettings()
    settingsRef.current = result.settings
    setSettings(result.settings)
    setSettingsNotice(result.error ?? "Configuração padrão restaurada")
  }, [])
  const openSettings = useCallback(() => {
    setSettingsNotice("")
    selectConfigurationSection(configurationSections[0] ?? "palette")
    setQueryHistoryEntries(configurationContext === "database" ? listDatabaseQueryHistory() : [])
    setSensitiveTermsOpen(false)
    setSettingsOpen(true)
  }, [configurationContext, configurationSections, selectConfigurationSection])
  const openQueryHistory = useCallback(() => {
    if (configurationContext !== "database") return
    setQueryHistoryEntries(listDatabaseQueryHistory())
    setQueryHistoryOpen(true)
  }, [configurationContext])

  const openGitConfiguration = useCallback(
    (tab: GitConfigurationTab = "diffs") => {
      setSettingsOpen(false)
      setSettingsNotice("")
      gitConfiguration.openModal(tab)
    },
    [gitConfiguration.openModal],
  )
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
      setSettingsOpen(false)
      setSettingsNotice("")
      if (!ONLY_TAB) setActiveTab("database")
    },
    [ONLY_TAB, queryHistoryCanRerun],
  )
  const startTutorial = useCallback(() => {
    setSettingsOpen(false)
    setSettingsNotice("")
    setTutorialTargetId(null)
    setTutorialOpen(true)
  }, [])
  const closeTutorial = useCallback(() => {
    setTutorialOpen(false)
    setTutorialTargetId(null)
  }, [])
  const cycleConfigurationSection = useCallback(
    (direction: -1 | 1) => {
      const currentSection = normalizeConfigurationSectionForContext(
        configurationSectionRef.current,
        configurationContext,
      )
      const index = configurationSections.indexOf(currentSection)
      const nextIndex =
        (index + direction + configurationSections.length) % configurationSections.length
      const next = configurationSections[nextIndex]
      if (next) selectConfigurationSection(next)
    },
    [configurationContext, configurationSections, selectConfigurationSection],
  )

  const cycleConfiguration = useCallback(
    (direction: -1 | 1) => {
      const currentSettings = settingsRef.current
      const patch = configurationSettingPatch(
        configurationSectionRef.current,
        currentSettings,
        direction,
      )
      if (patch) applySettings(patch)
    },
    [applySettings],
  )

  const openFeatures = useCallback(() => {
    setSettingsOpen(false)
    features.setInstaller(true)
  }, [features.setInstaller])
  const activateConfiguration = useCallback(() => {
    activateConfigurationSection(configurationSectionRef.current, {
      startTutorial,
      openFeatures,
      openHistory: openQueryHistory,
      openSensitive: () => setSensitiveTermsOpen(true),
      openGit: openGitConfiguration,
    })
  }, [openGitConfiguration, openQueryHistory, startTutorial, openFeatures])

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

    if (queryHistoryOpen || sensitiveTermsOpen || gitConfiguration.open) return

    if (tutorialOpen) {
      key.preventDefault()
      return
    }

    if (settingsOpen) {
      key.preventDefault()
      if (key.name === "escape" || key.name === "q") {
        setSettingsOpen(false)
      } else if (key.name === "enter" || key.name === "return") {
        activateConfiguration()
      } else if (key.name === "up" || key.name === "k") {
        cycleConfigurationSection(-1)
      } else if (key.name === "down" || key.name === "j" || key.name === "tab") {
        cycleConfigurationSection(1)
      } else if (key.name === "left" || key.name === "h") {
        cycleConfiguration(-1)
      } else if (key.name === "right" || key.name === "l") {
        cycleConfiguration(1)
      } else if (key.name === "r") {
        restoreDefaultSettings()
      }
      return
    }

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
          notice={settingsNotice}
          onClose={() => setSettingsOpen(false)}
          onSectionChange={selectConfigurationSection}
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
          onOpenGitConfiguration={openGitConfiguration}
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
      {gitConfiguration.modal}
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
