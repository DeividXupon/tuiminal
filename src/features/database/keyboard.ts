import type { KeyboardScope } from "../../core/keyboard/scope"

export const databaseKeyboardScope = {
  ids: ["table-search", "database-cell-editor-value", "database-connection-list"],
  prefixes: [
    "db-connection-",
    "database-query-",
    "database-saved-query-",
    "database-table-search-",
    "database-connection-card-",
    "database-changes-",
    "database-batch-",
    "database-sensitive-terms-",
  ],
  localCtrlC: true,
  deferEscape: true,
} as const satisfies KeyboardScope
