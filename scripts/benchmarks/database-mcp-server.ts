import { writeFileSync } from "node:fs"
import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js"

function rowsFor(sql: string): Array<Record<string, unknown>> {
  if (/^SELECT 1 AS connection_ok$/i.test(sql.trim())) return [{ connection_ok: 1 }]
  if (/FROM information_schema\.TABLES/i.test(sql)) {
    return [{ schema_name: "benchmark", table_name: "users", table_type: "BASE TABLE" }]
  }
  if (/^DESCRIBE `users`$/i.test(sql.trim())) {
    return [
      { Field: "id", Type: "int", Null: "NO", Key: "PRI", Default: null },
      { Field: "name", Type: "varchar(80)", Null: "NO", Key: "", Default: null },
      { Field: "note", Type: "text", Null: "YES", Key: "", Default: null },
    ]
  }
  if (!sql.includes("FROM `users`") && !/\bFROM\s+users\b/i.test(sql)) {
    throw new Error(`Unsupported benchmark MCP query: ${sql}`)
  }
  const limit = Number(sql.match(/\bLIMIT\s+(\d+)/i)?.[1] ?? 100)
  const offset = Number(sql.match(/\bOFFSET\s+(\d+)/i)?.[1] ?? 0)
  return Array.from({ length: Math.max(0, Math.min(limit, 2_000 - offset)) }, (_, index) => {
    const id = offset + index + 1
    return { id, name: `User ${id}`, note: `Note ${id}`, __tuiminal_pk_0: id }
  })
}

const server = new Server(
  { name: "tuiminal-benchmark-mysql-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } },
)
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "mysql_query",
      description: "Read-only benchmark fixture query",
      inputSchema: {
        type: "object",
        properties: { sql: { type: "string" } },
        required: ["sql"],
      },
    },
  ],
}))
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name !== "mysql_query" || typeof request.params.arguments?.sql !== "string") {
    throw new Error("Unsupported benchmark MCP tool call")
  }
  if (request.params.arguments.sql.includes("benchmark_slow")) {
    const encodedFile = request.params.arguments.sql.match(/benchmark_slow:([^\s*]+)/)?.[1]
    if (encodedFile) writeFileSync(decodeURIComponent(encodedFile), "started")
    await Bun.sleep(200)
  }
  return {
    content: [{ type: "text", text: JSON.stringify(rowsFor(request.params.arguments.sql)) }],
  }
})
await server.connect(new StdioServerTransport())
