import { constants } from "node:fs"
import { access } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"

export type DatabaseColumn = {
  field: string
  type: string
  nullable: boolean
  key: string
}

export type DatabaseCatalog = {
  databaseName: string
  tables: string[]
}

export type TablePage = {
  columns: DatabaseColumn[]
  rows: Array<Record<string, unknown>>
  hasMore: boolean
}

const DEFAULT_MCP_COMMAND = join(homedir(), ".codex", "bin", "mysql-rw-mcp")
const MCP_COMMAND =
  process.env.TUIMINAL_MYSQL_MCP_COMMAND?.trim() || DEFAULT_MCP_COMMAND
const SENSITIVE_COLUMN_PATTERN =
  /(password|passwd|secret|token|api.?key|private.?key|pin|hash|salt|cpf|cnpj|document|email|phone|telefone|celular)/i
const LONG_VALUE_PATTERN = /(text|json|blob|binary)/i
const BINARY_VALUE_PATTERN = /(blob|binary)/i

let clientPromise: Promise<Client> | null = null
const schemaCache = new Map<string, DatabaseColumn[]>()

type McpTextContent = {
  type: "text"
  text: string
}

function isTextContent(part: unknown): part is McpTextContent {
  if (!part || typeof part !== "object") return false
  const candidate = part as { type?: unknown; text?: unknown }
  return candidate.type === "text" && typeof candidate.text === "string"
}

function quoteIdentifier(identifier: string) {
  if (!/^[A-Za-z0-9_$]+$/.test(identifier)) {
    throw new Error(`Identificador de banco inválido: ${identifier}`)
  }

  return `\`${identifier}\``
}

function assertReadOnly(sql: string) {
  const normalized = sql.trim()
  if (!/^(SELECT|SHOW|DESCRIBE|DESC|EXPLAIN)\b/i.test(normalized)) {
    throw new Error("A interface de banco aceita apenas consultas de leitura.")
  }

  if (normalized.includes(";") || /(--|\/\*)/.test(normalized)) {
    throw new Error("Consulta de leitura recusada por segurança.")
  }
}

async function createClient() {
  await access(MCP_COMMAND, constants.X_OK).catch(() => {
    throw new Error(
      `MCP MySQL não encontrado em ${MCP_COMMAND}. Configure TUIMINAL_MYSQL_MCP_COMMAND.`,
    )
  })

  const client = new Client({
    name: "tuiminal-database-viewer",
    version: "0.2.0",
  })
  const transport = new StdioClientTransport({ command: MCP_COMMAND })

  await client.connect(transport)
  const { tools } = await client.listTools()
  if (!tools.some((tool) => tool.name === "mysql_query")) {
    await client.close()
    throw new Error("O MCP conectado não oferece a ferramenta mysql_query.")
  }

  return client
}

async function getClient() {
  if (!clientPromise) {
    clientPromise = createClient().catch((error) => {
      clientPromise = null
      throw error
    })
  }

  return clientPromise
}

async function readQuery(sql: string) {
  assertReadOnly(sql)
  const client = await getClient()
  const result = await client.callTool({
    name: "mysql_query",
    arguments: { sql },
  })
  const content = Array.isArray(result.content) ? result.content : []
  const text = content
    .filter(isTextContent)
    .map((part) => part.text)
    .join("\n")

  if (result.isError) {
    throw new Error(text || "A consulta ao banco falhou.")
  }

  const jsonBlock = content.find(isTextContent)
  if (!jsonBlock) return []

  try {
    const parsed: unknown = JSON.parse(jsonBlock.text)
    return Array.isArray(parsed)
      ? (parsed as Array<Record<string, unknown>>)
      : []
  } catch {
    throw new Error("O MCP retornou uma resposta que não pôde ser interpretada.")
  }
}

async function loadSchema(tableName: string) {
  const cached = schemaCache.get(tableName)
  if (cached) return cached

  const rows = await readQuery(`DESCRIBE ${quoteIdentifier(tableName)}`)
  const columns = rows.map((row) => ({
    field: String(row.Field ?? ""),
    type: String(row.Type ?? ""),
    nullable: row.Null === "YES",
    key: String(row.Key ?? ""),
  }))
  schemaCache.set(tableName, columns)
  return columns
}

function selectExpression(column: DatabaseColumn) {
  const identifier = quoteIdentifier(column.field)

  if (SENSITIVE_COLUMN_PATTERN.test(column.field)) {
    return `CASE WHEN ${identifier} IS NULL THEN NULL ELSE '<mascarado>' END AS ${identifier}`
  }

  if (BINARY_VALUE_PATTERN.test(column.type)) {
    return `CASE WHEN ${identifier} IS NULL THEN NULL ELSE CONCAT('<binário ', OCTET_LENGTH(${identifier}), ' bytes>') END AS ${identifier}`
  }

  if (LONG_VALUE_PATTERN.test(column.type)) {
    return `LEFT(CAST(${identifier} AS CHAR), 240) AS ${identifier}`
  }

  return identifier
}

export async function listDatabaseTables(): Promise<DatabaseCatalog> {
  const rows = await readQuery(
    "SELECT TABLE_SCHEMA AS database_name, TABLE_NAME AS table_name " +
      "FROM information_schema.TABLES " +
      "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE' " +
      "ORDER BY TABLE_NAME",
  )

  return {
    databaseName: String(rows[0]?.database_name ?? "MySQL"),
    tables: rows.map((row) => String(row.table_name)),
  }
}

export async function loadTablePage(
  tableName: string,
  offset: number,
  limit: number,
): Promise<TablePage> {
  const columns = await loadSchema(tableName)
  const selectList = columns.map(selectExpression).join(", ")
  const safeOffset = Math.max(0, Math.floor(offset))
  const safeLimit = Math.max(1, Math.min(50, Math.floor(limit)))
  const rows = await readQuery(
    `SELECT ${selectList} FROM ${quoteIdentifier(tableName)} LIMIT ${safeLimit + 1} OFFSET ${safeOffset}`,
  )

  return {
    columns,
    rows: rows.slice(0, safeLimit),
    hasMore: rows.length > safeLimit,
  }
}

export async function closeDatabaseConnection() {
  const pendingClient = clientPromise
  clientPromise = null
  schemaCache.clear()
  if (!pendingClient) return

  try {
    const client = await pendingClient
    await client.close()
  } catch {
    // The process is already shutting down; there is nothing else to release.
  }
}
