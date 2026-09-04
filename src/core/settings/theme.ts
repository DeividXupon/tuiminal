import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { DEFAULT_LANGUAGE, isLanguage, setLanguage, type LanguageId } from "../../shared/i18n/index"
import {
  DEFAULT_SENSITIVE_TERMS,
  normalizeSensitiveTerms,
  setActiveSensitiveTerms,
} from "../../shared/security/sensitive-data"

export type PaletteId = "prime" | "midnight" | "nord" | "gruvbox"
export type LayoutMode = "framed" | "compact"

export type UiSettings = {
  palette: PaletteId
  layout: LayoutMode
  language: LanguageId
  sensitiveTerms: string[]
}

export type ColorPalette = {
  canvas: string
  panel: string
  panelAlt: string
  panelRaised: string
  border: string
  muted: string
  text: string
  focus: string
  graphAccent: string
  database: string
  git: string
  runner: string
  http: string
  terminal: string
  success: string
  warning: string
  danger: string
  diffAddedBg: string
  diffRemovedBg: string
  diffModifiedBg: string
  diffChangedBg: string
  diffRemovedChangedBg: string
  diffHunkBg: string
  diffGutterBg: string
  databaseEditedBg: string
  databaseDeletedBg: string
  databaseInsertedBg: string
  databaseSelectionBg: string
}

export const PALETTES: Record<PaletteId, ColorPalette> = {
  prime: {
    canvas: "#080b10",
    panel: "#0f141c",
    panelAlt: "#111923",
    panelRaised: "#171e29",
    border: "#263143",
    muted: "#8290a3",
    text: "#f3f6fa",
    focus: "#ff7a90",
    graphAccent: "#64d8ff",
    database: "#a78bfa",
    git: "#f7c873",
    runner: "#64d8ff",
    http: "#fb923c",
    terminal: "#5ee6a8",
    success: "#5ee6a8",
    warning: "#f7c873",
    danger: "#ff6b6b",
    diffAddedBg: "#132a21",
    diffRemovedBg: "#321a21",
    diffModifiedBg: "#17263a",
    diffChangedBg: "#246b49",
    diffRemovedChangedBg: "#7a2938",
    diffHunkBg: "#192338",
    diffGutterBg: "#111821",
    databaseEditedBg: "#3b2a14",
    databaseDeletedBg: "#35191f",
    databaseInsertedBg: "#102c42",
    databaseSelectionBg: "#292344",
  },
  midnight: {
    canvas: "#050814",
    panel: "#0a1020",
    panelAlt: "#0d1528",
    panelRaised: "#151f38",
    border: "#273555",
    muted: "#7f8faa",
    text: "#e8eefb",
    focus: "#7aa2f7",
    graphAccent: "#7dcfff",
    database: "#bb9af7",
    git: "#e0af68",
    runner: "#7dcfff",
    http: "#ff9e64",
    terminal: "#9ece6a",
    success: "#9ece6a",
    warning: "#e0af68",
    danger: "#f7768e",
    diffAddedBg: "#11281f",
    diffRemovedBg: "#311923",
    diffModifiedBg: "#142543",
    diffChangedBg: "#245e43",
    diffRemovedChangedBg: "#713047",
    diffHunkBg: "#17213b",
    diffGutterBg: "#0d1528",
    databaseEditedBg: "#382b18",
    databaseDeletedBg: "#351822",
    databaseInsertedBg: "#102b47",
    databaseSelectionBg: "#252343",
  },
  nord: {
    canvas: "#1d2129",
    panel: "#252a34",
    panelAlt: "#292f3a",
    panelRaised: "#343b49",
    border: "#4c566a",
    muted: "#8b97aa",
    text: "#eceff4",
    focus: "#bf616a",
    graphAccent: "#88c0d0",
    database: "#b48ead",
    git: "#ebcb8b",
    runner: "#81a1c1",
    http: "#d08770",
    terminal: "#a3be8c",
    success: "#a3be8c",
    warning: "#ebcb8b",
    danger: "#bf616a",
    diffAddedBg: "#2a3b35",
    diffRemovedBg: "#422d34",
    diffModifiedBg: "#29394a",
    diffChangedBg: "#476b59",
    diffRemovedChangedBg: "#70434e",
    diffHunkBg: "#303946",
    diffGutterBg: "#222832",
    databaseEditedBg: "#4a402c",
    databaseDeletedBg: "#482d35",
    databaseInsertedBg: "#283f4d",
    databaseSelectionBg: "#403849",
  },
  gruvbox: {
    canvas: "#1b1b19",
    panel: "#282724",
    panelAlt: "#2d2b27",
    panelRaised: "#3a3833",
    border: "#504d45",
    muted: "#a89984",
    text: "#ebdbb2",
    focus: "#fb4934",
    graphAccent: "#83a598",
    database: "#d3869b",
    git: "#fabd2f",
    runner: "#83a598",
    http: "#fe8019",
    terminal: "#b8bb26",
    success: "#b8bb26",
    warning: "#fabd2f",
    danger: "#fb4934",
    diffAddedBg: "#26351f",
    diffRemovedBg: "#402421",
    diffModifiedBg: "#26343b",
    diffChangedBg: "#4f682f",
    diffRemovedChangedBg: "#783c32",
    diffHunkBg: "#34312b",
    diffGutterBg: "#24231f",
    databaseEditedBg: "#4a371c",
    databaseDeletedBg: "#48221f",
    databaseInsertedBg: "#223b46",
    databaseSelectionBg: "#423238",
  },
}

export const PALETTE_OPTIONS: ReadonlyArray<{
  id: PaletteId
  label: string
  description: string
}> = [
  { id: "prime", label: "Prime", description: "grafite profundo e acentos vivos" },
  { id: "midnight", label: "Midnight", description: "azul noturno e contraste frio" },
  { id: "nord", label: "Nord", description: "cinza ártico e tons suaves" },
  { id: "gruvbox", label: "Gruvbox", description: "tons quentes com visual retrô" },
]

const DEFAULT_SETTINGS: UiSettings = {
  palette: "prime",
  layout: "framed",
  language: DEFAULT_LANGUAGE,
  sensitiveTerms: [...DEFAULT_SENSITIVE_TERMS],
}

const configRoot = process.env.XDG_CONFIG_HOME?.trim() || join(homedir(), ".config")
export const UI_SETTINGS_PATH = join(configRoot, "tuiminal", "settings.json")

function isPalette(value: unknown): value is PaletteId {
  return typeof value === "string" && value in PALETTES
}

function isLayout(value: unknown): value is LayoutMode {
  return value === "framed" || value === "compact"
}

function loadSettings(): UiSettings {
  try {
    if (!existsSync(UI_SETTINGS_PATH)) return { ...DEFAULT_SETTINGS }
    const parsed = JSON.parse(readFileSync(UI_SETTINGS_PATH, "utf8")) as Partial<UiSettings>
    return {
      palette: isPalette(parsed.palette) ? parsed.palette : DEFAULT_SETTINGS.palette,
      layout: isLayout(parsed.layout) ? parsed.layout : DEFAULT_SETTINGS.layout,
      language: isLanguage(parsed.language) ? parsed.language : DEFAULT_SETTINGS.language,
      sensitiveTerms: normalizeSensitiveTerms(parsed.sensitiveTerms),
    }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

let currentSettings: UiSettings = {
  ...DEFAULT_SETTINGS,
  sensitiveTerms: [...DEFAULT_SETTINGS.sensitiveTerms],
}

export const COLORS: ColorPalette = { ...PALETTES[currentSettings.palette] }

/** Explicit startup boundary: importing UI modules never reads user configuration. */
export function initializeUiSettings() {
  currentSettings = loadSettings()
  setLanguage(currentSettings.language)
  setActiveSensitiveTerms(currentSettings.sensitiveTerms)
  Object.assign(COLORS, PALETTES[currentSettings.palette])
  return getUiSettings()
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

export function updateUiSettings(patch: Partial<UiSettings>): {
  settings: UiSettings
  error: string | null
} {
  const next: UiSettings = {
    palette: isPalette(patch.palette) ? patch.palette : currentSettings.palette,
    layout: isLayout(patch.layout) ? patch.layout : currentSettings.layout,
    language: isLanguage(patch.language) ? patch.language : currentSettings.language,
    sensitiveTerms:
      patch.sensitiveTerms === undefined
        ? [...currentSettings.sensitiveTerms]
        : normalizeSensitiveTerms(patch.sensitiveTerms),
  }
  currentSettings = next
  setLanguage(next.language)
  setActiveSensitiveTerms(next.sensitiveTerms)
  Object.assign(COLORS, PALETTES[next.palette])

  try {
    mkdirSync(dirname(UI_SETTINGS_PATH), { recursive: true })
    writeFileSync(UI_SETTINGS_PATH, `${JSON.stringify(next, null, 2)}\n`, "utf8")
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
  return updateUiSettings(DEFAULT_SETTINGS)
}
