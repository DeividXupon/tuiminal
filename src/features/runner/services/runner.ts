import { dirname, resolve } from "node:path"
import { loadRunnerProjectConfiguration } from "../storage/runner-config"

import type { RunnerCommand } from "../model/types"
import { isGitWorktreeRoot, RUNNER_WORKING_DIRECTORY } from "./context"
import { discoverPackageCommands, discoverPhpCommands } from "../discovery/node-php"
import { discoverPythonCommands } from "../discovery/python"
import {
  discoverGoCommands,
  discoverRustCommands,
  discoverRubyCommands,
  discoverJavaCommands,
  discoverDotnetCommands,
  discoverDenoCommands,
} from "../discovery/languages"
import {
  discoverTaskfileCommands,
  discoverFileCommands,
  discoverDockerCommands,
} from "../discovery/recipes"
import { configuredRunnerCommand } from "./shell-command"

export async function discoverRunnerCommands(root = RUNNER_WORKING_DIRECTORY) {
  const configured = loadRunnerProjectConfiguration(root).commands.map(configuredRunnerCommand)
  const discovered = await Promise.all([
    discoverPackageCommands(root),
    discoverPhpCommands(root),
    discoverPythonCommands(root),
    discoverGoCommands(root),
    discoverRustCommands(root),
    discoverRubyCommands(root),
    discoverJavaCommands(root),
    discoverDotnetCommands(root),
    discoverDenoCommands(root),
    discoverTaskfileCommands(root),
    discoverFileCommands(root, ["Makefile", "makefile"], "make"),
    discoverFileCommands(root, ["justfile", "Justfile"], "just"),
    discoverDockerCommands(root),
  ])
  const unique = new Map<string, RunnerCommand>()
  for (const command of [...configured, ...discovered.flat()]) {
    if (!unique.has(command.displayCommand)) {
      unique.set(command.displayCommand, command)
    }
  }
  return [...unique.values()]
}

export type RunnerProjectContext = {
  root: string
  commands: RunnerCommand[]
}

export async function resolveRunnerProjectContext(
  directory = RUNNER_WORKING_DIRECTORY,
): Promise<RunnerProjectContext | null> {
  const requestedRoot = resolve(directory)
  const requestedCommands = await discoverRunnerCommands(requestedRoot)
  if (requestedCommands.length || isGitWorktreeRoot(requestedRoot)) {
    return { root: requestedRoot, commands: requestedCommands }
  }

  let candidate = dirname(requestedRoot)
  while (candidate !== dirname(candidate)) {
    if (isGitWorktreeRoot(candidate)) {
      return {
        root: candidate,
        commands: await discoverRunnerCommands(candidate),
      }
    }
    candidate = dirname(candidate)
  }
  return null
}

export type * from "../model/types"
export { RUNNER_WORKING_DIRECTORY, resolveRunnerSessionScope } from "./context"
export { createShellRunnerCommand } from "./shell-command"
export { discoverRunnerProjects, listRunnerDirectories } from "../discovery/projects"
export { discoverRunnerListeningPorts } from "./ports"
export { startRunnerProcess, stopAllRunnerProcesses } from "./process"
export { waitForRunnerHealthCheck } from "./health"
export { openRunnerUrl } from "./open-url"
