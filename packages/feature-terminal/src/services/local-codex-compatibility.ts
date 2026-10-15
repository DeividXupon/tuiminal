import type { RemoteCodexCompatibilityReport } from "../model/remote-codex"
import { runBoundedCommand } from "./bounded-command"
import { resolveCodexExecutable } from "./codex-executable"
import {
  localCodexCompatibility,
  RemoteCodexCompatibilityError,
} from "./remote-codex-compatibility"

const LOCAL_CODEX_TIMEOUT_MS = 10_000

type LocalCodexPreflightOptions = {
  localVersionCommand?: readonly string[]
  timeoutMs?: number
}

/** Validates the local Codex CLI before starting its app-server. */
export async function preflightLocalCodex(
  signal: AbortSignal,
  options: LocalCodexPreflightOptions = {},
) {
  const timeout = AbortSignal.timeout(options.timeoutMs ?? LOCAL_CODEX_TIMEOUT_MS)
  try {
    const result = await runBoundedCommand(
      options.localVersionCommand ?? [resolveCodexExecutable(), "--version"],
      AbortSignal.any([signal, timeout]),
    )
    const local = localCodexCompatibility(result.exitCode, result.stdout, result.stderr)
    const report = {
      providerId: "codex",
      compatible: local.reason === null,
      reason: local.reason,
      localVersion: local.version,
      remoteVersion: null,
      daemonAvailable: true,
      proxyAvailable: true,
    } satisfies RemoteCodexCompatibilityReport
    if (!report.compatible) throw new RemoteCodexCompatibilityError(report)
    return report
  } catch (error) {
    if (signal.aborted) signal.throwIfAborted()
    if (timeout.aborted) throw new Error("A verificação do Codex excedeu o tempo limite.")
    throw error
  }
}
