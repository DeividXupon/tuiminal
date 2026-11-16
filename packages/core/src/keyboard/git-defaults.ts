const keys = (value: string) => value.split(" ")
const navigation = "Esc Enter Tab Up Down Left Right j k h l"
const remote = `${navigation} ? m a f z v r o e c y x / Home End Ctrl+n Ctrl+p Ctrl+y Ctrl+d Ctrl+u Shift+y Shift+c Shift+e Shift+a Shift+x`
// Includes helper-owned shortcuts (query completion, partial staging, preview/diff).
export const GIT_SHORTCUT_KEYS = {
  workspace: keys("1 2 3 4 c Ctrl+p"),
  diffs: keys(
    `${navigation} ? m a f s d r t o g v b [ ] Space Ctrl+p Shift+h Shift+l Shift+Left Shift+Right`,
  ),
  compare: keys(`${navigation} ? m c b t v r Ctrl+p`),
  "pull-requests": keys(`${remote} d w u [ ] Ctrl+a Shift+w Shift+m`),
  issues: keys(`${remote} Shift+l`),
  inbox: keys(`${navigation} ? m Shift+m a f z v o r b d u e c Ctrl+p Ctrl+d Ctrl+u`),
  configuration: keys("Esc Enter Space Up Down j k n e d x"),
  "configuration-section-editor": keys("Esc Enter Tab Shift+Tab Ctrl+s Ctrl+n Ctrl+p Ctrl+y"),
  "inbox-action-modal": keys("Esc Enter Ctrl+s"),
  "local-target-picker": keys("Esc Enter Up Down /"),
  "hub-create-modal": keys("Esc Enter Tab Shift+Tab Ctrl+s d v"),
  "hub-create-branch-picker": keys("Esc Enter Tab Up Down j k / m r"),
  "hub-create-repository-picker": keys("Esc Enter Tab Up Down j k / r"),
  "pull-request-action-modal": keys("Esc Ctrl+s Up Down j k 1 2 3 4 5 6 7 8 9"),
  "issue-action-modal": keys("Esc Ctrl+s 1 2 3 4 5 6 7 8 9"),
  "compare-branch-picker": keys("Esc Enter Up Down j k /"),
  "discard-changes-modal": keys("Esc d"),
}
