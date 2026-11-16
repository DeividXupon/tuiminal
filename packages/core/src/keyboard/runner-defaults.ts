const keys = (value: string) => value.split(" ")
// RunnerWorkspace, native command selects, and runner-yaml-keyboard own these keys.
export const RUNNER_SHORTCUT_KEYS = {
  workspace: keys(
    "Esc Enter Tab Up Down Left Right j k h l a f m n r s c o e p t x y u i v d q / ? Space 1 2 3 4 [ ] Shift+a Shift+f Shift+m Ctrl+m Ctrl+s Ctrl+x Ctrl+y",
  ),
  configuration: keys("Esc Enter Up Down Ctrl+y Ctrl+n Ctrl+f Ctrl+r Ctrl+k Ctrl+t"),
  "configuration-editor": keys("Esc Enter Tab Ctrl+s Ctrl+Space Ctrl+j Ctrl+k"),
  "save-command-modal": keys("Esc Enter Ctrl+s Ctrl+p"),
  "autostart-trust-modal": keys("Esc Enter Up Down y n"),
}
