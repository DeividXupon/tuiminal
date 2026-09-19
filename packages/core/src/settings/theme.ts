import { existsSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { DEFAULT_LANGUAGE, isLanguage, setLanguage, type LanguageId } from "../i18n/index"
import {
  DEFAULT_SENSITIVE_TERMS,
  normalizeSensitiveTerms,
  setActiveSensitiveTerms,
} from "../security/sensitive-data"
import { DARK_PALETTES } from "./dark-palettes"
import { LIGHT_PALETTES } from "./light-palettes"
import type { ColorPalette, PaletteId } from "./theme-types"
import { atomicWriteFileSync, fileContentHash } from "../storage/atomic-file"

export type { ColorPalette, PaletteId } from "./theme-types"
export type LayoutMode = "framed" | "compact"
export type ColorMode = "dark" | "light"

export type UiSettings = {
  colorMode: ColorMode
  palette: PaletteId
  layout: LayoutMode
  language: LanguageId
  sensitiveTerms: string[]
}

export const PALETTES: Record<PaletteId, ColorPalette> = DARK_PALETTES

export const PALETTE_OPTIONS: ReadonlyArray<{
  id: PaletteId
  label: string
  description: string
}> = [
  { id: "prime", label: "Prime", description: "grafite profundo e acentos vivos" },
  { id: "midnight", label: "Midnight", description: "azul noturno e contraste frio" },
  { id: "nord", label: "Nord", description: "cinza ártico e tons suaves" },
  { id: "gruvbox", label: "Gruvbox", description: "tons quentes com visual retrô" },
  { id: "dracula", label: "Dracula", description: "roxo vibrante e contraste gótico" },
  { id: "catppuccin", label: "Catppuccin", description: "tons pastel suaves e modernos" },
  { id: "tokyo-night", label: "Tokyo Night", description: "azul urbano e acentos neon" },
]

const DEFAULT_SETTINGS: UiSettings = {
  colorMode: "dark",
  palette: "prime",
  layout: "framed",
  language: DEFAULT_LANGUAGE,
  sensitiveTerms: [...DEFAULT_SENSITIVE_TERMS],
}

const configRoot = process.env.XDG_CONFIG_HOME?.trim() || join(homedir(), ".config")
export const UI_SETTINGS_PATH = join(configRoot, "tuiminal", "settings.json")

function isPalette(value: unknown): value is PaletteId {
  return typeof value === "string" && Object.hasOwn(PALETTES, value)
}

function isLayout(value: unknown): value is LayoutMode {
  return value === "framed" || value === "compact"
}

function isColorMode(value: unknown): value is ColorMode {
  return value === "dark" || value === "light"
}

export function paletteFor(palette: PaletteId, colorMode: ColorMode) {
  return colorMode === "light" ? LIGHT_PALETTES[palette] : PALETTES[palette]
}

let settingsSourceHash: string | null = null
let settingsLoadError = ""

function loadSettings(): UiSettings {
  try {
    if (!existsSync(UI_SETTINGS_PATH)) {
      settingsSourceHash = null
      settingsLoadError = ""
      return { ...DEFAULT_SETTINGS }
    }
    const source = readFileSync(UI_SETTINGS_PATH, "utf8")
    const parsed = JSON.parse(source) as Partial<UiSettings>
    settingsSourceHash = fileContentHash(source)
    settingsLoadError = ""
    return {
      colorMode: isColorMode(parsed.colorMode) ? parsed.colorMode : DEFAULT_SETTINGS.colorMode,
      palette: isPalette(parsed.palette) ? parsed.palette : DEFAULT_SETTINGS.palette,
      layout: isLayout(parsed.layout) ? parsed.layout : DEFAULT_SETTINGS.layout,
      language: isLanguage(parsed.language) ? parsed.language : DEFAULT_SETTINGS.language,
      sensitiveTerms: normalizeSensitiveTerms(parsed.sensitiveTerms),
    }
  } catch (error) {
    try {
      const source = readFileSync(UI_SETTINGS_PATH, "utf8")
      settingsSourceHash = fileContentHash(source)
    } catch {
      settingsSourceHash = null
    }
    settingsLoadError =
      error instanceof Error ? error.message : "O arquivo de configuração é inválido."
    return { ...DEFAULT_SETTINGS }
  }
}

let currentSettings: UiSettings = {
  ...DEFAULT_SETTINGS,
  sensitiveTerms: [...DEFAULT_SETTINGS.sensitiveTerms],
}
const themeListeners = new Set<() => void>()

export const COLORS: ColorPalette = {
  ...paletteFor(currentSettings.palette, currentSettings.colorMode),
}

/** Explicit startup boundary: importing UI modules never reads user configuration. */
export function initializeUiSettings() {
  currentSettings = loadSettings()
  setLanguage(currentSettings.language)
  setActiveSensitiveTerms(currentSettings.sensitiveTerms)
  Object.assign(COLORS, paletteFor(currentSettings.palette, currentSettings.colorMode))
  return getUiSettings()
}

export function subscribeUiTheme(listener: () => void) {
  themeListeners.add(listener)
  return () => themeListeners.delete(listener)
}

export const LAYOUT = {
  get compact() {
    return currentSettings.layout === "compact"
  },
  get gap() {
    return currentSettings.layout === "compact" ? 0 : 1
  },
  get outerPadding() {
    return currentSettings.layout === "compact" ? 0 : 1
  },
  get border() {
    return currentSettings.layout !== "compact"
  },
  get headerSpacing() {
    return currentSettings.layout === "compact" ? 0 : 1
  },
  get workspaceBackground() {
    return currentSettings.layout === "compact" ? COLORS.canvas : COLORS.panel
  },
  get alternatePanel() {
    return currentSettings.layout === "compact" ? COLORS.panelAlt : COLORS.panel
  },
}

export function panelBorder(borderColor = COLORS.border) {
  return LAYOUT.compact
    ? { border: false as const }
    : {
        border: true as const,
        borderStyle: "rounded" as const,
        borderColor,
      }
}

export function focusedPanelBorder(focused: boolean, borderColor = COLORS.focus) {
  if (LAYOUT.compact) {
    return focused
      ? {
          border: ["left"] as ["left"],
          borderStyle: "single" as const,
          borderColor,
        }
      : { border: false as const }
  }
  return panelBorder(focused ? borderColor : COLORS.border)
}

export function separatorBorder(borderColor = COLORS.border) {
  return LAYOUT.compact
    ? { border: false as const }
    : {
        border: ["bottom"] as ["bottom"],
        borderColor,
      }
}

export function databaseSelectionColors() {
  return LAYOUT.compact
    ? { foreground: COLORS.text, background: COLORS.databaseSelectionBg }
    : { foreground: COLORS.canvas, background: COLORS.database }
}

export function getUiSettings(): UiSettings {
  return { ...currentSettings, sensitiveTerms: [...currentSettings.sensitiveTerms] }
}

function persistUiSettings(next: UiSettings, allowRecovery: boolean) {
  if (settingsLoadError && !allowRecovery) {
    throw new Error(
      "A configuração existente está corrompida; use Restaurar para preservá-la em settings.json.bak e criar uma nova.",
    )
  }
  const content = `${JSON.stringify(next, null, 2)}\n`
  settingsSourceHash = atomicWriteFileSync(UI_SETTINGS_PATH, content, {
    expectedHash: settingsSourceHash,
    mode: 0o600,
    backup: true,
  })
  settingsLoadError = ""
}

export function updateUiSettings(
  patch: Partial<UiSettings>,
  options: { recoverCorrupted?: boolean } = {},
): {
  settings: UiSettings
  error: string | null
} {
  const next: UiSettings = {
    colorMode: isColorMode(patch.colorMode) ? patch.colorMode : currentSettings.colorMode,
    palette: isPalette(patch.palette) ? patch.palette : currentSettings.palette,
    layout: isLayout(patch.layout) ? patch.layout : currentSettings.layout,
    language: isLanguage(patch.language) ? patch.language : currentSettings.language,
    sensitiveTerms:
      patch.sensitiveTerms === undefined
        ? [...currentSettings.sensitiveTerms]
        : normalizeSensitiveTerms(patch.sensitiveTerms),
  }
  const themeChanged =
    next.colorMode !== currentSettings.colorMode || next.palette !== currentSettings.palette
  currentSettings = next
  setLanguage(next.language)
  setActiveSensitiveTerms(next.sensitiveTerms)
  Object.assign(COLORS, paletteFor(next.palette, next.colorMode))
  if (themeChanged) for (const listener of themeListeners) listener()

  try {
    persistUiSettings(next, Boolean(options.recoverCorrupted))
    return {
      settings: { ...next, sensitiveTerms: [...next.sensitiveTerms] },
      error: null,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "erro desconhecido"
    return {
      settings: { ...next, sensitiveTerms: [...next.sensitiveTerms] },
      error: `Não foi possível salvar a configuração: ${message}`,
    }
  }
}

export function resetUiSettings() {
  return updateUiSettings(DEFAULT_SETTINGS, { recoverCorrupted: true })
}
