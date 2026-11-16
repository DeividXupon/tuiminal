const keys = (value: string) => value.split(" ")
// Shared commands are handled by use-http-keyboard after the owning pane's guards.
const common =
  "Esc Enter Tab Shift+Tab Up Down Left Right j k h l / ? F1 F10 Ctrl+n Ctrl+w Ctrl+s Ctrl+o Ctrl+m Ctrl+g Ctrl+p Ctrl+Enter Ctrl+Delete Alt+Left Alt+Right r Shift+r m Shift+m s c e x w + - 1 2 3 4 5 6 7 8 9"
export const HTTP_SHORTCUT_KEYS = {
  workspace: keys(common),
  url: keys(common),
  request: keys(
    `${common} a f z v n d i t b u Space Backspace Delete Ctrl+d Ctrl+j Ctrl+k Home End`,
  ),
  response: keys(`${common} a f z v n o Ctrl+f Space Home End PageUp PageDown`),
  navigation: keys(`${common} a f z v n d i o p Space Delete Backspace Home End`),
  "overlay-jump": keys("Esc Ctrl+o F1 u r c e"),
  "overlay-help": keys("Esc Ctrl+o F1"),
  "overlay-curl-import": keys("Esc Ctrl+o F1 Ctrl+Enter"),
  "overlay-curl-export": keys("Esc Ctrl+o F1 c"),
  "overlay-history-diff": keys("Esc Ctrl+o F1"),
  "overlay-request-move": keys("Esc Ctrl+o F1 Ctrl+Enter"),
  "overlay-request-delete": keys("Esc Ctrl+o F1 d"),
  "overlay-collection-import": keys("Esc Ctrl+o F1 Enter Ctrl+Enter b"),
  "overlay-discard-document": keys("Esc Ctrl+o F1 d"),
  "overlay-external-conflict": keys("Esc Ctrl+o F1 r l c"),
  "overlay-insecure-tls-confirmation": keys("Esc Ctrl+o F1 i"),
  "collection-menu": keys("Esc Enter Tab Shift+Tab Up Down j k a"),
  "postman-modal": keys("Esc Enter Up Down j k e"),
  "environment-menu": keys("Esc Enter Tab Up Down j k a"),
  "redirect-approval-modal": keys("Esc Up Down i y"),
  "source-picker": keys("Enter Tab Left Right Up Down l p"),
  "environment-confirmation": keys("Esc d"),
  "collection-runner-modal": keys("Esc Ctrl+o F1 Enter Tab Shift+Tab d t c i Ctrl+Enter"),
  "environment-manager-modal": keys(
    "Esc Enter Tab Shift+Tab Up Down Left Right j k h l n g e d y / Ctrl+s",
  ),
  "collection-settings-confirmation": keys("Esc d"),
  "import-source-picker": keys("Enter Tab Up Down"),
  "chain-dependency-picker": keys("Esc Enter Tab Up Down j k"),
  "postman-workspace-create-modal": keys("Esc Enter"),
  "postman-save-modal": keys("Esc Enter Up Down j k"),
}
