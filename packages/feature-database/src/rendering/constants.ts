import type { DatabaseTableQuery } from "../model/types"
import { createUiSyntaxStyle } from "@xupon/tuiminal-core/ui/syntax-style"

export const SIDEBAR_WIDTH = 32
export const CELL_WIDTH = 18
export const ROW_INSPECTOR_BREAKPOINT = 130
export const COMPACT_ACTIONS_BREAKPOINT = 145
export const QUERY_CELL_WIDTH = 22
export const BATCH_SELECTOR_WIDTH = 3
export const TABLE_HISTORY_LIMIT = 6
export const SQL_TAB_LIMIT = 6
export const EMPTY_TABLE_QUERY: DatabaseTableQuery = { search: "", sort: null }
export const LOADING_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]
export const SQL_SYNTAX_STYLE = createUiSyntaxStyle()
