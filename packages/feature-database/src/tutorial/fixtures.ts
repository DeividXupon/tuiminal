import type {
  DatabaseColumn,
  DatabaseTable,
  DatabaseTableStructure,
  DatabaseTableMutation,
} from "../model/types"
import type { DatabaseGridRow, DatabaseView } from "../model/workspace"

export const noop = () => {}
export const DEMO_TABLE: DatabaseTable = { schema: "main", name: "users", type: "table" }
export const DEMO_TABLES: DatabaseTable[] = ["orders", "products", "users"].map((name) => ({
  schema: "main",
  name,
  type: "table",
}))
export const DEMO_COLUMNS: DatabaseColumn[] = [
  { field: "id", type: "INTEGER", nullable: false, key: "PRI", defaultValue: null },
  { field: "name", type: "TEXT", nullable: false, key: "", defaultValue: null },
  { field: "email", type: "TEXT", nullable: false, key: "UNI", defaultValue: null },
  { field: "role", type: "TEXT", nullable: false, key: "", defaultValue: "'viewer'" },
  { field: "active", type: "INTEGER", nullable: false, key: "", defaultValue: "1" },
  { field: "password", type: "TEXT", nullable: true, key: "", defaultValue: null },
  {
    field: "created_at",
    type: "TEXT",
    nullable: false,
    key: "",
    defaultValue: "CURRENT_TIMESTAMP",
  },
]
const PEOPLE = [
  ["Ana Lima", "ana@example.test", "admin"],
  ["Bruno Reis", "bruno@example.test", "viewer"],
  ["Carla Melo", "carla@example.test", "viewer"],
  ["Diego Luz", "diego@example.test", "viewer"],
  ["Eva Nunes", "eva@example.test", "editor"],
  ["Fábio Paz", "fabio@example.test", "viewer"],
]
export const DEMO_STRUCTURE: DatabaseTableStructure = {
  ddl: "CREATE TABLE users (\n  id INTEGER PRIMARY KEY,\n  name TEXT NOT NULL,\n  email TEXT NOT NULL UNIQUE,\n  role TEXT NOT NULL DEFAULT 'viewer',\n  active INTEGER NOT NULL DEFAULT 1,\n  password TEXT,\n  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP\n);",
  constraints: [{ name: "users_pk", type: "PRIMARY KEY", definition: "PRIMARY KEY (id)" }],
  indexes: [{ name: "sqlite_autoindex_users_1", unique: true, definition: "email" }],
  relationships: [
    {
      name: "orders_user_id_fk",
      direction: "incoming",
      columns: ["id"],
      relatedSchema: "main",
      relatedTable: "orders",
      relatedColumns: ["user_id"],
      onUpdate: "NO ACTION",
      onDelete: "RESTRICT",
    },
  ],
}

export type TutorialState = {
  view: DatabaseView
  query: boolean
  inspector: boolean
  selected: boolean
  masked: boolean
  sorted: boolean
  mutation: "insert" | "update" | "delete" | "all" | null
  dialog: "connections" | "export" | "review" | null
  rowIndex: number
  columnIndex: number
  rowTarget: string | null
}
const SCENES = new Map<string, Partial<TutorialState>>([
  ["tutorial-db-columns", { view: "columns" }],
  ["tutorial-db-indexes", { view: "indexes" }],
  ["tutorial-db-schema", { view: "schema" }],
  ["tutorial-db-diagram", { view: "schema" }],
  ["tutorial-db-query-editor", { query: true }],
  ["tutorial-db-inspector", { inspector: true }],
  ["tutorial-db-inspector-fields", { inspector: true, columnIndex: 1 }],
  ["tutorial-db-selection", { selected: true, rowIndex: 1 }],
  ["tutorial-db-export", { selected: true, rowIndex: 1, dialog: "export" }],
  ["tutorial-db-sensitive", { masked: true, columnIndex: 5 }],
  ["tutorial-db-table-tools", { sorted: true }],
  ["tutorial-db-new-row", { mutation: "insert", rowIndex: 6, rowTarget: "tutorial-db-new-row" }],
  [
    "tutorial-db-edit-cell",
    { mutation: "update", rowIndex: 1, columnIndex: 3, rowTarget: "tutorial-db-edit-cell" },
  ],
  [
    "tutorial-db-delete-row",
    { mutation: "delete", rowIndex: 3, rowTarget: "tutorial-db-delete-row" },
  ],
  ["tutorial-db-undo-row", { rowIndex: 1, columnIndex: 3, rowTarget: "tutorial-db-undo-row" }],
  ["tutorial-db-review", { mutation: "all", dialog: "review" }],
  ["tutorial-db-connections", { dialog: "connections" }],
])

export function tutorialState(target: string | null): TutorialState {
  return {
    view: "data",
    query: false,
    inspector: false,
    selected: false,
    masked: false,
    sorted: false,
    mutation: null,
    dialog: null,
    rowIndex: 0,
    columnIndex: 0,
    rowTarget: null,
    ...SCENES.get(target ?? ""),
  }
}

export function tutorialRowTarget(state: TutorialState, index: number) {
  if (state.rowTarget && index === state.rowIndex) return { id: state.rowTarget }
  if (index === 0 && state.selected) return { id: "tutorial-db-selection" }
  return {}
}

function mutation(
  kind: DatabaseTableMutation["kind"],
  row: DatabaseGridRow,
): DatabaseTableMutation {
  if (kind === "insert") return { kind, values: row.data }
  if (kind === "update") return { kind, rowKey: { id: row.data.id }, values: { role: "editor" } }
  return { kind, rowKey: { id: row.data.id } }
}

export function tutorialRows(state: TutorialState): DatabaseGridRow[] {
  const rows: DatabaseGridRow[] = PEOPLE.map(([name, email, role], index) => ({
    id: `demo-${index}`,
    data: {
      id: 101 + index,
      name,
      email,
      role,
      active: 1,
      password: state.masked ? "<mascarado>" : "demo-only",
      created_at: "2026-08-21 14:32:08",
    },
    rowKey: { id: 101 + index },
    change: null,
  }))
  if (state.mutation === "insert" || state.mutation === "all") {
    rows.push({
      id: "demo-insert",
      data: {
        id: 107,
        name: "Gabi Dias",
        email: "gabi@example.test",
        role: "viewer",
        active: 1,
        password: null,
        created_at: "2026-08-21 14:32:08",
      },
      rowKey: null,
      change: null,
    })
  }
  for (const [index, row] of rows.entries()) {
    const kinds: Record<number, DatabaseTableMutation["kind"]> = {
      6: "insert",
      1: "update",
      3: "delete",
    }
    const kind = kinds[index]
    if (!kind || (state.mutation !== "all" && state.mutation !== kind)) continue
    const originalRow = { ...row.data }
    if (kind === "update") row.data = { ...row.data, role: "editor" }
    row.change = {
      id: `change-${index}`,
      connectionId: "tutorial",
      connectionName: "Loja Demo",
      table: DEMO_TABLE,
      columns: DEMO_COLUMNS,
      approved: false,
      originalRow: kind === "insert" ? null : originalRow,
      mutation: mutation(kind, row),
    }
  }
  return rows
}
