import { Worker } from "node:worker_threads"
import PostmanSandbox from "postman-sandbox/lib/postman-sandbox"
import bootcode from "postman-sandbox/.cache/bootcode"
import type { HttpAssertionResult } from "../model/types"

// Bun's eval workers do not expose require to runInThisContext. The official
// bootstrap needs it to capture Buffer before removing globals from its worker.
const BOOTSTRAP = `const {parentPort} = require('worker_threads');
globalThis.require = require;
parentPort.once('message', ({__init_uvm}) => require('vm').runInThisContext(__init_uvm));`

type Variable = { key: string; value: unknown; disabled?: boolean }
export type ScriptScope = { values?: Variable[] }
export type ScriptExecution = {
  request?: import("postman-collection").RequestDefinition
  environment: ScriptScope
  globals: ScriptScope
  collectionVariables: ScriptScope
  _variables: ScriptScope
}

export class HttpScriptError extends Error {
  constructor(
    message: string,
    readonly result?: ScriptExecution,
  ) {
    super(message)
  }
}

export async function executePostmanScript(
  source: string,
  context: Record<string, unknown>,
  phase: "prerequest" | "test",
  signal?: AbortSignal,
) {
  signal?.throwIfAborted()
  if (source.length > 50_000) throw new Error("HTTP script exceeds 50,000 characters")
  const bootCode = await new Promise<string>((resolve, reject) =>
    bootcode((error, code) => (error ? reject(error) : resolve(code))),
  )
  signal?.throwIfAborted()
  const worker = new Worker(BOOTSTRAP, { eval: true })
  const assertions: HttpAssertionResult[] = []
  let dispose: (() => void) | undefined
  let abort: (() => void) | undefined
  let startupTimer: ReturnType<typeof setTimeout> | undefined
  try {
    const result = await new Promise<ScriptExecution>((resolve, reject) => {
      abort = () => reject(new Error("Script execution cancelled"))
      signal?.addEventListener("abort", abort, { once: true })
      worker.on("error", reject)
      startupTimer = setTimeout(() => reject(new Error("Script startup timed out")), 20000)
      const sandbox = new PostmanSandbox()
      sandbox.on("error", reject)
      dispose = () => sandbox.dispose()
      sandbox.initialize(
        { disableLegacyAPIs: true },
        { _sandbox: worker, timeout: 2000, bootTimeout: 60000, bootCode },
        (error, ctx) => {
          clearTimeout(startupTimer)
          if (error) return reject(error)
          dispose = () => ctx.dispose()
          if (signal?.aborted) return reject(new Error("Script execution cancelled"))
          ctx.on("execution.assertion", (_cursor, tests) => {
            for (const test of tests)
              assertions.push({
                id: `script-${phase}-${assertions.length}`,
                expression: test.name,
                passed: test.passed === true || test.skipped === true,
                actual: "",
                message: test.error?.message ?? (test.skipped ? "Skipped" : ""),
              })
          })
          ctx.execute(
            { listen: phase, script: { exec: source } },
            {
              context,
              disableLegacyAPIs: true,
              timeout: 2000,
              disabledAPIs: [
                "sendRequest",
                "execution.runRequest",
                "execution.setNextRequest",
                "execution.skipRequest",
                "vault",
                "cookies",
                "visualizer",
                "require",
                "datasets",
              ],
            },
            (error, result) =>
              error ? reject(new HttpScriptError(error.message, result)) : resolve(result),
          )
        },
      )
    })
    return { result, assertions }
  } finally {
    clearTimeout(startupTimer)
    if (abort) signal?.removeEventListener("abort", abort)
    dispose?.()
    await worker.terminate()
  }
}
