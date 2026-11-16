import { DARK_PALETTES } from "./dark-palettes"
import type { ColorPalette, PaletteId } from "./theme-types"

export type ConfiguredTheme = {
  palette: PaletteId | null
  mode: "dark" | "light" | null
  colors: Partial<ColorPalette>
}

export const DEFAULT_CONFIGURED_THEME: ConfiguredTheme = {
  palette: null,
  mode: null,
  colors: {},
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
}

export function validateConfiguredTheme(value: unknown): ConfiguredTheme {
  if (!record(value)) throw new Error("theme must be a mapping")
  for (const key of Object.keys(value)) {
    if (!["palette", "mode", "colors"].includes(key))
      throw new Error(`Unknown theme option: ${key}`)
  }
  const palette = value.palette ?? null
  if (palette !== null && (typeof palette !== "string" || !Object.hasOwn(DARK_PALETTES, palette))) {
    throw new Error("theme.palette must name a built-in palette or be null")
  }
  const mode = value.mode ?? null
  if (mode !== null && mode !== "dark" && mode !== "light") {
    throw new Error("theme.mode must be dark, light or null")
  }
  const colors = value.colors ?? {}
  if (!record(colors)) throw new Error("theme.colors must be a mapping")
  for (const [key, color] of Object.entries(colors)) {
    if (!Object.hasOwn(DARK_PALETTES.prime, key)) throw new Error(`Unknown theme color: ${key}`)
    if (typeof color !== "string" || !/^#[\da-f]{6}$/i.test(color)) {
      throw new Error(`theme.colors.${key} must be a #RRGGBB color`)
    }
  }
  return { palette: palette as PaletteId | null, mode, colors: { ...colors } }
}

let configuredTheme: ConfiguredTheme = structuredClone(DEFAULT_CONFIGURED_THEME)

export function setConfiguredTheme(theme: ConfiguredTheme) {
  configuredTheme = validateConfiguredTheme(theme)
}

export function getConfiguredTheme(): ConfiguredTheme {
  return { ...configuredTheme, colors: { ...configuredTheme.colors } }
}

export function configuredColors(base: ColorPalette): ColorPalette {
  return { ...base, ...configuredTheme.colors }
}
