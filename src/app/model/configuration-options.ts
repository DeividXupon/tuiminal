import type { UiSettings } from "../../core/settings/theme"
import { PALETTE_OPTIONS } from "../../core/settings/theme"
import { LANGUAGE_OPTIONS } from "../../shared/i18n/index"
import type { ConfigurationSection } from "./configuration-context"

export const PALETTE_ROWS = Array.from(
  { length: Math.ceil(PALETTE_OPTIONS.length / 2) },
  (_, index) => PALETTE_OPTIONS.slice(index * 2, index * 2 + 2),
)

export function configurationSettingPatch(
  section: ConfigurationSection,
  settings: UiSettings,
  direction: -1 | 1,
): Partial<UiSettings> | null {
  if (section === "colorMode") {
    return { colorMode: settings.colorMode === "dark" ? "light" : "dark" }
  }
  if (section === "layout") {
    return { layout: settings.layout === "framed" ? "compact" : "framed" }
  }
  if (section === "language") {
    const index = LANGUAGE_OPTIONS.findIndex((language) => language.id === settings.language)
    const nextIndex = (index + direction + LANGUAGE_OPTIONS.length) % LANGUAGE_OPTIONS.length
    const next = LANGUAGE_OPTIONS[nextIndex]
    return next ? { language: next.id } : null
  }
  if (section === "palette") {
    const index = PALETTE_OPTIONS.findIndex((palette) => palette.id === settings.palette)
    const nextIndex = (index + direction + PALETTE_OPTIONS.length) % PALETTE_OPTIONS.length
    const next = PALETTE_OPTIONS[nextIndex]
    return next ? { palette: next.id } : null
  }
  return null
}
