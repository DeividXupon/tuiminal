/** Independently owned Terminal dialogs may reuse the workspace keys. */
export const TERMINAL_SHORTCUT_KEYS: Record<string, string[]> = {
  actions:
    "a s d . r m n c Shift+h e x b Shift+l Escape / Up Down Left Right Tab Enter h j k l z v 1 2 3 4 5 6 7 8 9".split(
      " ",
    ),
  sidebar: "Escape Up Down j k Enter".split(" "),
  "live-diff": "Escape x n a h j k l Up Down Left Right Enter".split(" "),
  "focus-selection": "Escape Enter h j k l Up Down Left Right".split(" "),
  "agent-message-history": "Escape x m r a d j k Up Down Enter".split(" "),
  dialog: "Escape Enter".split(" "),
  "split-dialog": "Escape n j k Up Down Enter".split(" "),
  "location-dialog": "Escape j k Up Down Left Right Enter".split(" "),
  "provider-picker": "Escape Up Down Enter".split(" "),
  "environment-dialog": "Escape Up Down Enter".split(" "),
  "live-diff-project-picker": "Escape Up Down Enter".split(" "),
  "agent-project-picker": "Escape / Up Down j k Enter p e".split(" "),
  "agent-folder-browser": "Escape Up Down Tab Enter".split(" "),
  "directory-dialog": "Escape".split(" "),
  "remote-server-setup": "Escape Enter".split(" "),
  "remote-update": "Escape Enter".split(" "),
  "remote-compatibility": "Escape Enter".split(" "),
  "remote-sync": "Escape Enter Up Down j k".split(" "),
  "remote-files": "Escape Enter a Delete Backspace Up Down j k".split(" "),
  "remote-sync-progress": "Escape a Up Down j k".split(" "),
  "remote-sync-preview": "Escape Enter a Up Down j k Left Right PageUp PageDown".split(" "),
}
