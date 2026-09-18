import { definedProperties } from "@xupon/tuiminal-core/data/defined-properties"
import type { RunnerConfiguredCommand } from "../storage/runner-config"

import type { RunnerCommand } from "../model/types"

export function createShellRunnerCommand(
  source: string,
  options: Partial<
    Pick<
      RunnerCommand,
      | "dependsOn"
      | "profile"
      | "id"
      | "label"
      | "description"
      | "interactive"
      | "source"
      | "workingDirectory"
      | "env"
      | "envFile"
      | "autostart"
      | "restartPolicy"
      | "restartDelayMs"
      | "maxRestarts"
      | "persistLogs"
      | "healthCheck"
    >
  > = {},
): RunnerCommand {
  const shell = process.env.SHELL ?? (process.platform === "win32" ? "cmd.exe" : "/bin/sh")
  const args = process.platform === "win32" ? ["/d", "/s", "/c", source] : ["-lc", source]
  return definedProperties({
    id: options.id ?? `custom:${source}`,
    label: options.label ?? source,
    category: "custom" as const,
    description: options.description ?? "Comando digitado manualmente",
    program: shell,
    args,
    displayCommand: source,
    source: options.source ?? "detected",
    workingDirectory: options.workingDirectory,
    dependsOn: options.dependsOn,
    profile: options.profile,
    env: options.env,
    envFile: options.envFile,
    interactive: options.interactive,
    autostart: options.autostart,
    restartPolicy: options.restartPolicy,
    restartDelayMs: options.restartDelayMs,
    maxRestarts: options.maxRestarts,
    persistLogs: options.persistLogs,
    healthCheck: options.healthCheck,
  })
}

export function configuredRunnerCommand(command: RunnerConfiguredCommand) {
  return createShellRunnerCommand(
    command.command,
    definedProperties({
      id: command.id,
      label: command.label,
      description: command.description,
      source: command.source,
      workingDirectory: command.cwd,
      dependsOn: command.dependsOn,
      profile: command.profile,
      env: command.env,
      envFile: command.envFile,
      interactive: command.interactive,
      autostart: command.autostart,
      restartPolicy: command.restartPolicy,
      restartDelayMs: command.restartDelayMs,
      maxRestarts: command.maxRestarts,
      persistLogs: command.persistLogs,
      healthCheck: command.healthCheck,
    }),
  )
}
