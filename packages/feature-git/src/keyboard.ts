import type { KeyboardScope } from "@xupon/tuiminal-core/keyboard/scope"

export const gitKeyboardScope = {
  ids: [
    "git-pr-action-menu",
    "git-pr-action-modal",
    "git-pr-action-input",
    "git-issue-action-menu",
    "git-issue-action-modal",
    "git-issue-action-input",
    "git-inbox-action-modal",
    "git-discard-changes-modal",
    "git-command-input",
    "git-configuration-modal",
    "git-local-target-picker",
    "git-local-target-list",
    "git-local-target-search",
    "git-compare-branch-picker",
    "git-compare-branch-list",
    "git-compare-branch-search",
  ],
  prefixes: ["git-pr-section-editor-", "git-issue-section-editor-", "git-gh-guidance-"],
  deferEscape: true,
} as const satisfies KeyboardScope
