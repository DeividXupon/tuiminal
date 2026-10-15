import type { KeyEvent } from "@opentui/core"
import { useCallback, useMemo, useRef, useState } from "react"
import { useNotificationFromValue } from "@xupon/tuiminal-core/notifications/index"
import {
  getUiSettings,
  resetUiSettings,
  type UiSettings,
  updateUiSettings,
} from "@xupon/tuiminal-core/settings/theme"
import type { GitConfigurationTab } from "@xupon/tuiminal-feature-git"
import {
  configurationSectionForGitTab,
  configurationSectionsForContext,
  isGitConfigurationSection,
  normalizeConfigurationSectionForContext,
  type ConfigurationContext,
  type ConfigurationSection,
} from "../model/configuration-context"
import { configurationSettingPatch } from "../model/configuration-options"

type ConfigurationKeyAction =
  | "activate"
  | "close"
  | "next"
  | "previous"
  | "reset"
  | "valueNext"
  | "valuePrevious"

const NAVIGATION_KEY_ACTIONS: Record<string, ConfigurationKeyAction | undefined> = {
  escape: "close",
  q: "close",
  enter: "activate",
  return: "activate",
  right: "activate",
  l: "activate",
  up: "previous",
  k: "previous",
  down: "next",
  j: "next",
  tab: "next",
}

const DETAIL_KEY_ACTIONS: Record<string, ConfigurationKeyAction | undefined> = {
  escape: "close",
  q: "close",
  enter: "activate",
  return: "activate",
  up: "previous",
  k: "previous",
  down: "next",
  j: "next",
  tab: "next",
  left: "valuePrevious",
  h: "valuePrevious",
  right: "valueNext",
  l: "valueNext",
  r: "reset",
}

function runConfigurationKeyAction(
  action: ConfigurationKeyAction | undefined,
  handlers: Record<ConfigurationKeyAction, () => void>,
) {
  if (action) handlers[action]()
}

export function useConfigurationLayer(context: ConfigurationContext) {
  const sections = useMemo(() => configurationSectionsForContext(context), [context])
  const [settings, setSettings] = useState(getUiSettings)
  const [open, setOpen] = useState(false)
  const [section, setSection] = useState<ConfigurationSection>("palette")
  const [focusedSection, setFocusedSection] = useState<ConfigurationSection>("palette")
  const [navigationActive, setNavigationActive] = useState(false)
  const [notice, setNotice] = useState("")
  const settingsRef = useRef(settings)
  const sectionRef = useRef(section)
  const focusedSectionRef = useRef(focusedSection)
  useNotificationFromValue(notice, { source: "Configurações" })

  const applySettings = useCallback((patch: Partial<UiSettings>) => {
    const result = updateUiSettings(patch)
    settingsRef.current = result.settings
    setSettings(result.settings)
    setNotice(result.error ?? "Configuração salva")
  }, [])

  const selectSection = useCallback((next: ConfigurationSection) => {
    sectionRef.current = next
    focusedSectionRef.current = next
    setSection(next)
    setFocusedSection(next)
    setNavigationActive(false)
  }, [])

  const focusSection = useCallback((next: ConfigurationSection) => {
    sectionRef.current = next
    focusedSectionRef.current = next
    setSection(next)
    setFocusedSection(next)
    setNavigationActive(isGitConfigurationSection(next))
  }, [])

  const reset = useCallback(() => {
    const result = resetUiSettings()
    settingsRef.current = result.settings
    setSettings(result.settings)
    setNotice(result.error ?? "Configuração padrão restaurada")
  }, [])

  const close = useCallback(() => setOpen(false), [])
  const focusNavigation = useCallback(() => setNavigationActive(true), [])

  const openSettings = useCallback(() => {
    const firstSection = sections[0] ?? "palette"
    setNotice("")
    selectSection(firstSection)
    setNavigationActive(isGitConfigurationSection(firstSection))
    setOpen(true)
  }, [sections, selectSection])

  const openGit = useCallback(
    (tab: GitConfigurationTab = "diffs") => {
      setNotice("")
      selectSection(configurationSectionForGitTab(tab))
      setOpen(true)
    },
    [selectSection],
  )

  const cycleSection = useCallback(
    (direction: -1 | 1) => {
      const current = normalizeConfigurationSectionForContext(focusedSectionRef.current, context)
      const index = sections.indexOf(current)
      const next = sections[(index + direction + sections.length) % sections.length]
      if (next) focusSection(next)
    },
    [context, focusSection, sections],
  )

  const cycleValue = useCallback(
    (direction: -1 | 1) => {
      const patch = configurationSettingPatch(sectionRef.current, settingsRef.current, direction)
      if (patch) applySettings(patch)
    },
    [applySettings],
  )

  const handleKey = useCallback(
    (key: KeyEvent, onActivate: (section: ConfigurationSection) => void) => {
      if (!open) return false
      if (!navigationActive && isGitConfigurationSection(sectionRef.current)) return true
      key.preventDefault()
      const action = (navigationActive ? NAVIGATION_KEY_ACTIONS : DETAIL_KEY_ACTIONS)[key.name]
      runConfigurationKeyAction(action, {
        close,
        previous: () => cycleSection(-1),
        next: () => cycleSection(1),
        valuePrevious: () => cycleValue(-1),
        valueNext: () => cycleValue(1),
        reset,
        activate: () => {
          const next = normalizeConfigurationSectionForContext(focusedSectionRef.current, context)
          selectSection(next)
          onActivate(next)
        },
      })
      return true
    },
    [close, context, cycleSection, cycleValue, navigationActive, open, reset, selectSection],
  )

  return {
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
    openSettings,
    openGit,
    handleKey,
  }
}
