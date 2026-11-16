const keys = (value: string) => value.split(" ")
// DatabaseWorkspace / DatabaseQueryWorkspace and their mounted modal handlers.
export const DATABASE_SHORTCUT_KEYS = {
  workspace: keys(
    "Esc Enter Tab Up Down Left Right j k h l c d e g i o r s u v w x / ? Space 1 2 3 4 [ ] Ctrl+a Ctrl+s Ctrl+Left Ctrl+Right Shift+Left Shift+Right Alt+Left Alt+Right",
  ),
  query: keys(
    "Esc Enter Tab Up Down Left Right j k h l a d e i u v x ? Space 1 2 3 4 5 6 Ctrl+a Ctrl+f Ctrl+n Ctrl+s Ctrl+w Ctrl+x Ctrl+Up Ctrl+Down Ctrl+Space Ctrl+@ Alt+Left Alt+Right F10",
  ),
  "cell-editor": keys("Esc Enter Ctrl+n"),
  "batch-export-modal": keys("Esc Enter 1 2 3 c s"),
  "query-favorites-modal": keys("Esc Enter Up Down j k d Delete Ctrl+s"),
  "query-history-modal": keys("Esc Enter Up Down j k s v d y"),
  "connection-modal": keys(
    "Esc Enter Tab Shift+Tab Up Down j k c e n x Delete Ctrl+k Ctrl+r Ctrl+s Ctrl+t Ctrl+w",
  ),
  "table-search-modal": keys("Esc Enter Ctrl+l Ctrl+s"),
  "changes-modal": keys("Esc Enter Up Down j k a Space Ctrl+s"),
}
