import type { ColorPalette } from "@xupon/tuiminal-core/settings/theme"
import type { ActionPaletteTag } from "@xupon/tuiminal-core/ui/action-palette"
import type { GitBaseActionTag } from "../model/base-actions"
import type { GitRemotePaletteTag } from "../model/remote-palette"

export const GIT_BASE_ACTION_TAGS = {
  files: { label: "ARQUIVOS", color: "git" },
  diff: { label: "DIFF", color: "success" },
  history: { label: "HISTÓRICO", color: "database" },
  terminal: { label: "TERMINAL", color: "terminal" },
  box: { label: "BOX", color: "focus" },
  partial: { label: "STAGE PARCIAL", color: "warning" },
  navigation: { label: "NAVEGAÇÃO", color: "http" },
  app: { label: "APP", color: "muted" },
} as const satisfies Record<GitBaseActionTag, { label: string; color: keyof ColorPalette }>

/** Resolves tag colors against the active palette at render time. */
export function gitBaseActionTags(
  colors: ColorPalette,
): Record<GitBaseActionTag, ActionPaletteTag> {
  return Object.fromEntries(
    Object.entries(GIT_BASE_ACTION_TAGS).map(([tag, { label, color }]) => [
      tag,
      { label, color: colors[color] },
    ]),
  ) as Record<GitBaseActionTag, ActionPaletteTag>
}

export const GIT_REMOTE_PALETTE_TAGS = {
  list: { label: "LISTA", color: "git" },
  preview: { label: "PRÉVIA", color: "success" },
  github: { label: "GITHUB", color: "warning" },
  box: { label: "BOX", color: "focus" },
  view: { label: "VISUALIZAÇÃO", color: "database" },
  navigation: { label: "NAVEGAÇÃO", color: "http" },
  app: { label: "APP", color: "muted" },
} as const satisfies Record<GitRemotePaletteTag, { label: string; color: keyof ColorPalette }>

/** Resolves tag colors against the active palette at render time. */
export function gitRemotePaletteTags(
  colors: ColorPalette,
): Record<GitRemotePaletteTag, ActionPaletteTag> {
  return Object.fromEntries(
    Object.entries(GIT_REMOTE_PALETTE_TAGS).map(([tag, { label, color }]) => [
      tag,
      { label, color: colors[color] },
    ]),
  ) as Record<GitRemotePaletteTag, ActionPaletteTag>
}
