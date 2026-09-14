import { dirname, resolve } from "node:path"
import {
  discoverRunnerEnvironmentProfiles,
  loadRunnerProjectConfiguration,
  type RunnerEnvironmentProfile,
} from "../storage/runner-config"

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

async function discoverRunnerCommandsWithConfiguration(
  root: string,
  configuredCommands: ReturnType<typeof loadRunnerProjectConfiguration>["commands"],
) {
  const configured = configuredCommands.map(configuredRunnerCommand)
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

export async function discoverRunnerCommands(root = RUNNER_WORKING_DIRECTORY) {
  return discoverRunnerCommandsWithConfiguration(
    root,
    loadRunnerProjectConfiguration(root).commands,
  )
}

export type RunnerProjectContext = {
  root: string
  commands: RunnerCommand[]
  environmentProfiles: RunnerEnvironmentProfile[]
}

async function runnerProjectDiscovery(root: string) {
  const configuration = loadRunnerProjectConfiguration(root)
  const commands = await discoverRunnerCommandsWithConfiguration(root, configuration.commands)
  return { root, commands, configuredProfiles: configuration.profiles }
}

function completeRunnerProjectContext(
  discovery: Awaited<ReturnType<typeof runnerProjectDiscovery>>,
): RunnerProjectContext {
  return {
    root: discovery.root,
    commands: discovery.commands,
    environmentProfiles: discoverRunnerEnvironmentProfiles(
      discovery.root,
      discovery.configuredProfiles,
    ),
  }
}

export async function resolveRunnerProjectContext(
  directory = RUNNER_WORKING_DIRECTORY,
): Promise<RunnerProjectContext | null> {
  const requestedRoot = resolve(directory)
  const requested = await runnerProjectDiscovery(requestedRoot)
  if (requested.commands.length || isGitWorktreeRoot(requestedRoot)) {
    return completeRunnerProjectContext(requested)
  }

  let candidate = dirname(requestedRoot)
  while (candidate !== dirname(candidate)) {
    if (isGitWorktreeRoot(candidate)) {
      return completeRunnerProjectContext(await runnerProjectDiscovery(candidate))
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
