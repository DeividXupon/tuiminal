import type { DatabaseConnectionProfile } from "../model/types"
import type { RuntimeSqlClient, RuntimeSqlExecutor } from "./read-only-query"
import type {
  DatabaseMutationExecutionState,
  DatabaseMutationRuntime,
  PreparedDatabaseMutation,
} from "./database-mutation-types"
export type {
  DatabaseMutationExecution,
  DatabaseMutationExecutionState,
  DatabaseMutationRuntime,
  PreparedDatabaseMutation,
  ReviewedDatabaseMutation,
} from "./database-mutation-types"
import {
  assertReviewedSchema,
  assertTransactionalWriteTarget,
  confirmMutation,
  validateOriginalSnapshot,
} from "./database-mutation-validation"

export function emptyDatabaseMutationExecutionState(): DatabaseMutationExecutionState {
  return {
    executions: [],
    sentStatements: 0,
    matchedRows: 0,
    affectedRows: 0,
    affectedRowsKnown: true,
    confirmedRows: 0,
    noOpStatements: 0,
    callbackCompleted: false,
  }
}

async function executeMutationStatement(
  profile: DatabaseConnectionProfile,
  statement: PreparedDatabaseMutation,
  transaction: RuntimeSqlExecutor,
  state: DatabaseMutationExecutionState,
  runtime: DatabaseMutationRuntime,
) {
  const startedAt = performance.now()
  const parameterPreview = runtime.parameterPreview(statement.parameters, statement.parameterNames)
  const sessionParameterPreview = runtime.sessionParameterPreview(
    statement.parameters,
    parameterPreview,
  )
  try {
    await assertTransactionalWriteTarget(profile, statement, transaction, runtime)
    await assertReviewedSchema(profile, statement, transaction, runtime)
    const noOp = await validateOriginalSnapshot(profile, statement, transaction, runtime)
    if (statement.mutation.kind !== "insert") state.matchedRows += 1
    if (noOp) {
      state.noOpStatements += 1
      return
    }
    state.sentStatements += 1
    const result = await transaction.unsafe(statement.sql, statement.parameters)
    const affected = runtime.affectedRowCount(result)
    if (affected === null) state.affectedRowsKnown = false
    else state.affectedRows += affected
    if (await confirmMutation(profile, statement, affected, transaction, runtime)) {
      state.noOpStatements += 1
    }
    state.confirmedRows += 1
    state.executions.push({
      sql: statement.sql,
      durationMs: performance.now() - startedAt,
      affectedRows: affected,
      error: null,
      parameterPreview,
      sessionParameterPreview,
    })
  } catch (error) {
    state.executions.push({
      sql: statement.sql,
      durationMs: performance.now() - startedAt,
      affectedRows: null,
      error: error instanceof Error ? error.message : "Falha desconhecida",
      parameterPreview,
      sessionParameterPreview,
    })
    throw error
  }
}

export async function executeDatabaseMutationTransaction({
  profile,
  statements,
  client,
  state,
  runtime,
}: {
  profile: DatabaseConnectionProfile
  statements: PreparedDatabaseMutation[]
  client: RuntimeSqlClient
  state: DatabaseMutationExecutionState
  runtime: DatabaseMutationRuntime
}) {
  await client.begin(async (transaction) => {
    for (const statement of statements) {
      await executeMutationStatement(profile, statement, transaction, state, runtime)
    }
    state.callbackCompleted = true
  })
}

export function databaseMutationConnectionFailureMayBeUncertain(error: unknown) {
  const code = String((error as { code?: unknown })?.code ?? "").toLocaleUpperCase()
  if (
    [
      "ECONNABORTED",
      "ECONNREFUSED",
      "ECONNRESET",
      "EPIPE",
      "ETIMEDOUT",
      "PROTOCOL_CONNECTION_LOST",
    ].includes(code)
  ) {
    return true
  }
  const message = error instanceof Error ? error.message : String(error)
  return /connection.*(?:closed|lost|reset)|socket|broken pipe|network|timed?\s*out/i.test(message)
}
