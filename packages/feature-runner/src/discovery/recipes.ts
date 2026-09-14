import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

import type { RunnerCommand } from "../model/types"
import { fileExists, commandDisplay, createCommand, readText } from "./shared"

export function discoverTaskfileTargets(source: string) {
  const lines = source.split("\n")
  const tasksLine = lines.findIndex((line) => /^\s*tasks:\s*(?:#.*)?$/.test(line))
  if (tasksLine === -1) return []
  const baseIndent = lines[tasksLine]?.match(/^\s*/)?.[0].length ?? 0
  const targets: string[] = []
  let childIndent: number | null = null

  for (const line of lines.slice(tasksLine + 1)) {
    if (!line.trim() || /^\s*#/.test(line)) continue
    const indent = line.match(/^\s*/)?.[0].length ?? 0
    if (indent <= baseIndent) break
    if (childIndent === null) childIndent = indent
    if (indent !== childIndent) continue
    const target = line.trim().match(/^([A-Za-z0-9][\w:.-]*):/)?.[1]
    if (target) targets.push(target)
  }
  return targets
}

export async function discoverTaskfileCommands(root: string) {
  const source =
    (await readText(resolve(root, "Taskfile.yml"))) ??
    (await readText(resolve(root, "Taskfile.yaml")))
  if (!source) return []
  return discoverTaskfileTargets(source).map((target) =>
    createCommand("task", target, target, `Taskfile: ${target}`, "task", [target]),
  )
}

export function discoverRecipeTargets(source: string, kind: "make" | "just"): RunnerCommand[] {
  const seen = new Set<string>()
  const targetPattern =
    kind === "make" ? /^([A-Za-z0-9][\w.-]*):(?:\s|$)/ : /^([A-Za-z][\w-]*)(?:\s[^:=]*)?:\s*$/
  const ignored = new Set(["all", "default", "help", "clean", "install"])

  return source
    .split("\n")
    .map((line) => line.match(targetPattern)?.[1] ?? "")
    .filter((target) => {
      if (!target || target.startsWith(".") || seen.has(target)) return false
      seen.add(target)
      return true
    })
    .sort((left, right) => {
      const leftIgnored = ignored.has(left)
      const rightIgnored = ignored.has(right)
      if (leftIgnored !== rightIgnored) return leftIgnored ? 1 : -1
      return left.localeCompare(right)
    })
    .slice(0, 24)
    .map((target) => {
      const program = kind === "make" ? "make" : "just"
      const args = [target]
      return {
        id: `${kind}:${target}`,
        label: target,
        category: kind,
        description: `${program} ${target}`,
        program,
        args,
        displayCommand: commandDisplay(program, args),
      }
    })
}

export async function discoverFileCommands(root: string, names: string[], kind: "make" | "just") {
  for (const name of names) {
    const path = resolve(root, name)
    if (!(await fileExists(path))) continue
    try {
      return discoverRecipeTargets(await readFile(path, "utf8"), kind)
    } catch {
      return []
    }
  }
  return []
}

export async function discoverDockerCommands(root: string): Promise<RunnerCommand[]> {
  const composeNames = ["compose.yaml", "compose.yml", "docker-compose.yaml", "docker-compose.yml"]
  const hasCompose = await Promise.all(composeNames.map((name) => fileExists(resolve(root, name))))
  if (!hasCompose.some(Boolean)) return []

  const definitions = [
    {
      id: "docker:up",
      label: "compose up",
      description: "Subir os serviços e acompanhar os logs",
      args: ["compose", "up"],
    },
    {
      id: "docker:ps",
      label: "compose ps",
      description: "Listar o estado dos serviços",
      args: ["compose", "ps"],
    },
    {
      id: "docker:logs",
      label: "compose logs",
      description: "Acompanhar os últimos logs dos serviços",
      args: ["compose", "logs", "--follow", "--tail=200"],
    },
  ]
  return definitions.map((definition) => ({
    ...definition,
    category: "docker" as const,
    program: "docker",
    displayCommand: commandDisplay("docker", definition.args),
  }))
}
