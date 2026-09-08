import type { KeyboardScope } from "../../core/keyboard/scope"

export const gitKeyboardScope = {
  ids: [
    "git-pr-repository-modal",
    "git-pr-repository-input",
    "git-pr-section-manager-modal",
    "git-pr-action-menu",
    "git-pr-action-modal",
    "git-pr-action-input",
    "git-issue-repository-modal",
    "git-issue-repository-input",
    "git-issue-section-manager-modal",
    "git-issue-action-menu",
    "git-issue-action-modal",
    "git-issue-action-input",
  ],
  prefixes: ["git-pr-section-editor-", "git-issue-section-editor-"],
  deferEscape: true,
} as const satisfies KeyboardScope
