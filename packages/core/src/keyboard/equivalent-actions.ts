/**
 * Only alternatives explicitly routed to the same action by the owning handler.
 * Do not infer Vim aliases across workspaces: the same letter can have another
 * meaning in a focused editor or an adjacent pane.
 */
export const EQUIVALENT_SHORTCUT_ACTIONS: Record<
  string,
  Record<string, readonly (readonly string[])[]>
> = {
  database: {
    "batch-export-modal": [["Enter", "c"]],
    "changes-modal": [
      ["Up", "k"],
      ["Down", "j"],
      ["Enter", "Space"],
    ],
    "query-history-modal": [
      ["Up", "k"],
      ["Down", "j"],
    ],
  },
  git: {
    configuration: [
      ["Up", "k"],
      ["Down", "j"],
    ],
  },
  http: {
    // HttpCollectionMenu: close, next item, previous item.
    "collection-menu": [
      ["Esc", "a"],
      ["Down", "j", "Tab"],
      ["Up", "k", "Shift+Tab"],
    ],
    // HttpEnvironmentMenu has exactly two choices and one toggle action.
    "environment-menu": [
      ["Esc", "a"],
      ["Up", "Down", "j", "k", "Tab"],
    ],
    // HttpSourcePicker uses one toggle action between Local and Postman.
    "source-picker": [["Left", "Right", "Up", "Down", "Tab"]],
    "postman-modal": [
      ["Up", "k"],
      ["Down", "j"],
    ],
    "postman-save-modal": [
      ["Up", "k"],
      ["Down", "j"],
    ],
    "chain-dependency-picker": [
      ["Up", "k"],
      ["Down", "j"],
    ],
    // environment-manager-keyboard and its list/choose/table handlers.
    "environment-manager-modal": [
      ["Up", "k"],
      ["Down", "j"],
      ["Left", "h"],
      ["Right", "l"],
    ],
  },
  terminal: {
    // terminal-sidebar-keyboard.handleMovementKey.
    sidebar: [
      ["Up", "k"],
      ["Down", "j"],
    ],
    // use-live-diff-keyboard uses these pairs in both file and preview focus.
    "live-diff": [
      ["Up", "k"],
      ["Down", "j"],
      ["Left", "h"],
      ["Right", "l"],
    ],
    "focus-selection": [
      ["Up", "k"],
      ["Down", "j"],
      ["Left", "h"],
      ["Right", "l"],
    ],
    "agent-message-history": [
      ["Up", "k"],
      ["Down", "j"],
    ],
    "split-dialog": [
      ["Up", "k"],
      ["Down", "j"],
    ],
    // TerminalLocationDialog toggles its two location choices for every direction.
    "location-dialog": [["Up", "Down", "Left", "Right", "j", "k"]],
    "remote-sync": [
      ["Up", "k"],
      ["Down", "j"],
    ],
    "remote-sync-progress": [
      ["Up", "k"],
      ["Down", "j"],
    ],
    "remote-sync-preview": [
      ["Up", "k"],
      ["Down", "j"],
      ["Left", "PageUp"],
      ["Right", "PageDown"],
    ],
  },
  runner: {
    "autostart-trust-modal": [
      ["Esc", "n"],
      ["Enter", "y"],
    ],
  },
}

export function equivalentShortcutActions(
  tool: string,
  context: string,
  first: string,
  second: string,
) {
  return (
    first === second ||
    (EQUIVALENT_SHORTCUT_ACTIONS[tool]?.[context]?.some(
      (group) => group.includes(first) && group.includes(second),
    ) ??
      false)
  )
}
