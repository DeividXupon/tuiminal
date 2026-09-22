export type PaletteId =
  | "prime"
  | "midnight"
  | "nord"
  | "gruvbox"
  | "dracula"
  | "catppuccin"
  | "tokyo-night"

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
  gitMerged: string
  runner: string
  http: string
  terminal: string
  success: string
  warning: string
  danger: string
  diffAddedBg: string
  diffRemovedBg: string
  diffModifiedBg: string
  diffRecentBg: string
  diffChangedBg: string
  diffRemovedChangedBg: string
  diffHunkBg: string
  diffGutterBg: string
  databaseEditedBg: string
  databaseDeletedBg: string
  databaseInsertedBg: string
  databaseSelectionBg: string
}
