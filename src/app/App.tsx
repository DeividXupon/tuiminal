import { ShortcutText } from "../shared/ui/ShortcutText"
import { BRAND_COLOR } from "../shared/ui/brand"
import {
  type ToolId as AppTab,
  TOOL_SHORTCUTS as TAB_SHORTCUTS,
  TOOL_LABELS as TAB_LABELS,
  resolveToolLaunch,
} from "./tool-catalog"
import { ownsKeyboardFocus, ownsInterrupt } from "../core/keyboard/scope"
import { shutdownTools, TOOL_KEYBOARD_SCOPES } from "./feature-registry"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import { Tabs } from "@tuiparts/react/tabs"
import { useCallback, useMemo, useRef, useState } from "react"
import {
  ConfigurationModal,
  type ConfigurationSection,
  configurationSectionsForContext,
  normalizeConfigurationSectionForContext,
} from "./ui/ConfigurationModal"
import { DatabaseQueryHistoryModal } from "../features/database"
import { type DatabaseQueryRerunRequest, DatabaseViewer } from "../features/database"
import { FreeTerminal } from "../features/terminal"
import { GitViewer } from "../features/git"
import { HttpClient } from "../features/http"
import { InlineButton } from "../shared/ui/InlineButton"
import { Runner } from "../features/runner"
import { SensitiveTermsModal } from "./ui/SensitiveTermsModal"
import { getTutorialSteps, TutorialOverlay } from "./tutorial/TutorialOverlay"
import type { DatabaseQueryHistoryEntry } from "../features/database"
import { databaseQueryHistoryCanRerun, listDatabaseQueryHistory } from "../features/database"
import { LANGUAGE_OPTIONS, translateUi } from "../shared/i18n/index"
import {
  COLORS,
  getUiSettings,
  LAYOUT,
  PALETTE_OPTIONS,
  resetUiSettings,
  separatorBorder,
  type UiSettings,
  updateUiSettings,
} from "../core/settings/theme"

function NavigationTab({
  value,
  label,
  shortcut,
  minimal = false,
}: {
  value: AppTab
  label: string
  shortcut: string
  minimal?: boolean
}) {
  const symbol = shortcut.slice(1, -1)
  return (
    <Tabs.Tab value={value} flexShrink={0}>
      {(state) => (
        <ShortcutText
          content={
            minimal
              ? ` ${state.selected ? "◆" : "◇"}${symbol} `
              : ` ${state.selected ? "◆" : "◇"} ${translateUi(label)} ${shortcut} `
          }
          style={{
            fg: minimal ? BRAND_COLOR : state.selected ? COLORS.text : COLORS.muted,
            bg: state.selected ? COLORS.panelRaised : COLORS.canvas,
          }}
        />
      )}
    </Tabs.Tab>
  )
}
export function App() {
  const renderer = useRenderer()
  const terminal = useTerminalDimensions()
  const [{ onlyTab: ONLY_TAB, initialTab: INITIAL_TAB }] = useState(() =>
    resolveToolLaunch(process.env.TUIMINAL_INITIAL_TAB, process.env.TUIMINAL_ONLY_TAB),
  )
  const [activeTab, setActiveTab] = useState<AppTab>(INITIAL_TAB)
  const visitedTabsRef = useRef(new Set<AppTab>([INITIAL_TAB]))
  visitedTabsRef.current.add(activeTab)
  const [settings, setSettings] = useState(getUiSettings)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [sensitiveTermsOpen, setSensitiveTermsOpen] = useState(false)
  const [queryHistoryOpen, setQueryHistoryOpen] = useState(false)
  const [queryHistoryEntries, setQueryHistoryEntries] = useState<DatabaseQueryHistoryEntry[]>([])
  const [databaseQueryRerunRequest, setDatabaseQueryRerunRequest] =
    useState<DatabaseQueryRerunRequest | null>(null)
  const [runnerHttpRequest, setRunnerHttpRequest] = useState<{
    id: number
    url: string
  } | null>(null)
  const [tutorialOpen, setTutorialOpen] = useState(false)
  const [configurationSection, setConfigurationSection] = useState<ConfigurationSection>("palette")
  const [settingsNotice, setSettingsNotice] = useState("")
  const settingsRef = useRef(settings)
  const openRunnerPortInHttp = useCallback((url: string) => {
    setRunnerHttpRequest({ id: Date.now(), url })
    setActiveTab("http")
  }, [])
  const configurationSectionRef = useRef(configurationSection)
  const queryRerunCounterRef = useRef(0)
  const compactNavigation = terminal.width < 150
  const minimalNavigation = terminal.width < 82
  const tutorialScreen = ONLY_TAB ?? activeTab
  const showDatabaseSettings = tutorialScreen === "database"
  const configurationSections = useMemo(
    () => configurationSectionsForContext(showDatabaseSettings),
    [showDatabaseSettings],
  )
  const tutorialSteps = useMemo(() => getTutorialSteps(tutorialScreen), [tutorialScreen])
  const applySettings = useCallback(
    (patch: Partial<Pick<UiSettings, "palette" | "layout" | "language" | "sensitiveTerms">>) => {
      const result = updateUiSettings(patch)
      settingsRef.current = result.settings
      setSettings(result.settings)
      setSettingsNotice(result.error ?? "Configuração salva")
    },
    [],
  )
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
    setQueryHistoryEntries(showDatabaseSettings ? listDatabaseQueryHistory() : [])
    setSensitiveTermsOpen(false)
    setSettingsOpen(true)
  }, [configurationSections, selectConfigurationSection, showDatabaseSettings])

  const openQueryHistory = useCallback(() => {
    if (!showDatabaseSettings) return
    setQueryHistoryEntries(listDatabaseQueryHistory())
    setQueryHistoryOpen(true)
  }, [showDatabaseSettings])

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
    setTutorialOpen(true)
  }, [])

  const cycleConfigurationSection = useCallback(
    (direction: -1 | 1) => {
      const currentSection = normalizeConfigurationSectionForContext(
        configurationSectionRef.current,
        showDatabaseSettings,
      )
      const index = configurationSections.indexOf(currentSection)
      const nextIndex =
        (index + direction + configurationSections.length) % configurationSections.length
      const next = configurationSections[nextIndex]
      if (next) selectConfigurationSection(next)
    },
    [configurationSections, selectConfigurationSection, showDatabaseSettings],
  )

  const cycleConfiguration = useCallback(
    (direction: -1 | 1) => {
      const currentSettings = settingsRef.current
      if (
        configurationSectionRef.current === "tutorial" ||
        configurationSectionRef.current === "history" ||
        configurationSectionRef.current === "sensitive"
      )
        return
      if (configurationSectionRef.current === "language") {
        const index = LANGUAGE_OPTIONS.findIndex(
          (language) => language.id === currentSettings.language,
        )
        const nextIndex = (index + direction + LANGUAGE_OPTIONS.length) % LANGUAGE_OPTIONS.length
        const next = LANGUAGE_OPTIONS[nextIndex]
        if (next) applySettings({ language: next.id })
        return
      }
      if (configurationSectionRef.current === "layout") {
        applySettings({
          layout: currentSettings.layout === "framed" ? "compact" : "framed",
        })
        return
      }
      const index = PALETTE_OPTIONS.findIndex((palette) => palette.id === currentSettings.palette)
      const nextIndex = (index + direction + PALETTE_OPTIONS.length) % PALETTE_OPTIONS.length
      const next = PALETTE_OPTIONS[nextIndex]
      if (next) applySettings({ palette: next.id })
    },
    [applySettings],
  )

  const quit = useCallback(async () => {
    await shutdownTools(visitedTabsRef.current)
    renderer.destroy()
  }, [renderer])

  useKeyboard((key) => {
    if (key.defaultPrevented) return

    if (queryHistoryOpen || sensitiveTermsOpen) return

    if (tutorialOpen) {
      key.preventDefault()
      return
    }

    if (settingsOpen) {
      key.preventDefault()
      if (key.name === "escape" || key.name === "q") {
        setSettingsOpen(false)
      } else if (key.name === "enter" || key.name === "return") {
        if (configurationSectionRef.current === "tutorial") startTutorial()
        else if (configurationSectionRef.current === "history") openQueryHistory()
        else if (configurationSectionRef.current === "sensitive") setSensitiveTermsOpen(true)
        else setSettingsOpen(false)
      } else if (key.name === "up") {
        cycleConfigurationSection(-1)
      } else if (key.name === "down" || key.name === "tab") {
        cycleConfigurationSection(1)
      } else if (key.name === "left") {
        cycleConfiguration(-1)
      } else if (key.name === "right") {
        cycleConfiguration(1)
      } else if (key.name === "r") {
        restoreDefaultSettings()
      }
      return
    }

    const focusedId = renderer.currentFocusedRenderable?.id
    const keyboardScope = TOOL_KEYBOARD_SCOPES[ONLY_TAB ?? activeTab]

    if (key.ctrl && key.name === "c" && !ownsInterrupt(keyboardScope, focusedId)) {
      void quit()
      return
    }

    if (ownsKeyboardFocus(keyboardScope, focusedId)) return

    if (!key.shift && (key.name === "," || key.sequence === "," || key.raw === ",")) {
      key.preventDefault()
      openSettings()
      return
    }

    if (!ONLY_TAB) {
      const shortcut = TAB_SHORTCUTS.find(
        (candidate) =>
          key.name === candidate.symbol ||
          key.sequence === candidate.symbol ||
          key.raw === candidate.symbol ||
          (key.shift && key.name === candidate.key),
      )
      if (shortcut) {
        key.preventDefault()
        setActiveTab(shortcut.tab)
        return
      }
    }

    if (key.name === "escape" && keyboardScope.deferEscape) {
      setTimeout(() => {
        if (!key.defaultPrevented) void quit()
      }, 0)
      return
    }

    if (key.name === "q" || key.name === "escape") {
      void quit()
    }
  })

  if (ONLY_TAB) {
    return (
      <box style={{ flexGrow: 1, backgroundColor: COLORS.canvas }}>
        <box
          id="tutorial-app-header"
          style={{
            height: LAYOUT.compact ? 1 : 2,
            flexShrink: 0,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            ...separatorBorder(),
            backgroundColor: LAYOUT.compact ? COLORS.panel : COLORS.canvas,
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
              onPress={() => {
                openSettings()
              }}
            />
            <InlineButton
              label={compactNavigation ? "[Q]" : "[Q] Sair"}
              accent={COLORS.focus}
              onPress={() => void quit()}
            />
          </box>
        </box>

        <box id="tutorial-current-tool" style={{ flexGrow: 1 }}>
          {ONLY_TAB === "database" && (
            <DatabaseViewer
              active={!settingsOpen && !tutorialOpen}
              tutorialMode={tutorialOpen}
              queryRerunRequest={databaseQueryRerunRequest}
              onQueryRerunRequestHandled={() => setDatabaseQueryRerunRequest(null)}
            />
          )}
          {ONLY_TAB === "git" && (
            <GitViewer active={!settingsOpen && !tutorialOpen} tutorialMode={tutorialOpen} />
          )}
          {ONLY_TAB === "runner" && <Runner active={!settingsOpen && !tutorialOpen} />}
          {ONLY_TAB === "http" && <HttpClient active={!settingsOpen && !tutorialOpen} />}
          {ONLY_TAB === "terminal" && <FreeTerminal active={!settingsOpen && !tutorialOpen} />}
        </box>
        <ConfigurationModal
          open={settingsOpen}
          settings={settings}
          section={configurationSection}
          notice={settingsNotice}
          onClose={() => setSettingsOpen(false)}
          onSectionChange={selectConfigurationSection}
          onPaletteChange={(palette) => applySettings({ palette })}
          onLayoutChange={(layout) => applySettings({ layout })}
          onLanguageChange={(language) => applySettings({ language })}
          onOpenSensitiveTerms={() => setSensitiveTermsOpen(true)}
          onReset={restoreDefaultSettings}
          onOpenQueryHistory={openQueryHistory}
          onStartTutorial={startTutorial}
          queryHistoryCount={queryHistoryEntries.length}
          tutorialLabel={TAB_LABELS[ONLY_TAB]}
          showDatabaseSettings={showDatabaseSettings}
        />
        <SensitiveTermsModal
          open={sensitiveTermsOpen}
          terms={settings.sensitiveTerms}
          onClose={() => setSensitiveTermsOpen(false)}
          onSave={(terms) => {
            applySettings({ sensitiveTerms: terms })
            setSensitiveTermsOpen(false)
          }}
        />
        <DatabaseQueryHistoryModal
          open={queryHistoryOpen}
          entries={queryHistoryEntries}
          canRerun={queryHistoryCanRerun}
          onClose={() => setQueryHistoryOpen(false)}
          onRerun={rerunHistoryQuery}
        />
        <TutorialOverlay
          open={tutorialOpen}
          steps={tutorialSteps}
          onClose={() => setTutorialOpen(false)}
        />
      </box>
    )
  }

  return (
    <Tabs.Root
      value={activeTab}
      onValueChange={(value) => setActiveTab(value as AppTab)}
      flexGrow={1}
      backgroundColor={COLORS.canvas}
    >
      <box
        id="tutorial-app-header"
        key={LAYOUT.compact ? "app-header-compact" : "app-header-framed"}
        style={{
          height: LAYOUT.compact ? 1 : 2,
          flexShrink: 0,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          ...separatorBorder(),
          backgroundColor: LAYOUT.compact ? COLORS.panel : COLORS.canvas,
          paddingLeft: 1,
          paddingRight: 1,
        }}
      >
        <text
          content={minimalNavigation ? "◆ T" : "◆ TUIMINAL"}
          style={{ flexShrink: 0, fg: BRAND_COLOR }}
        />
        <Tabs.List flexDirection="row" gap={compactNavigation ? 0 : 1}>
          <NavigationTab
            minimal={minimalNavigation}
            value="database"
            label={compactNavigation ? "DB" : translateUi("Banco")}
            shortcut="[@]"
          />
          <NavigationTab
            minimal={minimalNavigation}
            value="git"
            label={compactNavigation ? "G" : "Git"}
            shortcut="[#]"
          />
          <NavigationTab
            minimal={minimalNavigation}
            value="runner"
            label={compactNavigation ? "Run" : "Runner"}
            shortcut="[$]"
          />
          <NavigationTab minimal={minimalNavigation} value="http" label="HTTP" shortcut="[%]" />
          <NavigationTab
            minimal={minimalNavigation}
            value="terminal"
            label={compactNavigation ? "FT" : translateUi("Terminal")}
            shortcut="[^]"
          />
        </Tabs.List>
        <box style={{ flexDirection: "row", alignItems: "center" }}>
          {compactNavigation ? null : (
            <ShortcutText
              content={`[@ # $ % ^] ${translateUi("MUDAR")}  `}
              style={{ fg: COLORS.muted }}
            />
          )}
          <InlineButton
            id="tutorial-settings-button"
            label={compactNavigation ? "[,]" : "[,] Config"}
            accent={COLORS.focus}
            onPress={() => {
              openSettings()
            }}
          />
          <InlineButton
            label={compactNavigation ? "[Q]" : "[Q] Sair"}
            accent={COLORS.focus}
            onPress={() => void quit()}
          />
        </box>
      </box>

      <Tabs.Panel value="database" flexGrow={1} keepMounted>
        {visitedTabsRef.current.has("database") ? (
          <box
            {...(activeTab === "database" ? { id: "tutorial-current-tool" } : {})}
            style={{ flexGrow: 1 }}
          >
            <DatabaseViewer
              active={activeTab === "database" && !settingsOpen && !tutorialOpen}
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
              active={activeTab === "git" && !settingsOpen && !tutorialOpen}
              tutorialMode={tutorialOpen}
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
              active={activeTab === "runner" && !settingsOpen && !tutorialOpen}
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
              active={activeTab === "http" && !settingsOpen && !tutorialOpen}
              initialUrlRequest={runnerHttpRequest}
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
            <FreeTerminal active={activeTab === "terminal" && !settingsOpen && !tutorialOpen} />
          </box>
        ) : null}
      </Tabs.Panel>
      <ConfigurationModal
        open={settingsOpen}
        settings={settings}
        section={configurationSection}
        notice={settingsNotice}
        onClose={() => setSettingsOpen(false)}
        onSectionChange={selectConfigurationSection}
        onPaletteChange={(palette) => applySettings({ palette })}
        onLayoutChange={(layout) => applySettings({ layout })}
        onLanguageChange={(language) => applySettings({ language })}
        onOpenSensitiveTerms={() => setSensitiveTermsOpen(true)}
        onReset={restoreDefaultSettings}
        onOpenQueryHistory={openQueryHistory}
        onStartTutorial={startTutorial}
        queryHistoryCount={queryHistoryEntries.length}
        tutorialLabel={TAB_LABELS[activeTab]}
        showDatabaseSettings={showDatabaseSettings}
      />
      <SensitiveTermsModal
        open={sensitiveTermsOpen}
        terms={settings.sensitiveTerms}
        onClose={() => setSensitiveTermsOpen(false)}
        onSave={(terms) => {
          applySettings({ sensitiveTerms: terms })
          setSensitiveTermsOpen(false)
        }}
      />
      <DatabaseQueryHistoryModal
        open={queryHistoryOpen}
        entries={queryHistoryEntries}
        canRerun={queryHistoryCanRerun}
        onClose={() => setQueryHistoryOpen(false)}
        onRerun={rerunHistoryQuery}
      />
      <TutorialOverlay
        open={tutorialOpen}
        steps={tutorialSteps}
        onClose={() => setTutorialOpen(false)}
      />
    </Tabs.Root>
  )
}
