import { access, readFile } from "node:fs/promises"

import type { RunnerCommandCategory, RunnerCommand } from "../model/types"

export async function fileExists(path: string) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

export function displayArgument(argument: string) {
  return /^[\w./:@-]+$/.test(argument) ? argument : `'${argument.replaceAll("'", "'\\''")}'`
}

export function commandDisplay(program: string, args: string[]) {
  return [program, ...args].map(displayArgument).join(" ")
}

export function createCommand(
  category: RunnerCommandCategory,
  id: string,
  label: string,
  description: string,
  program: string,
  args: string[] = [],
): RunnerCommand {
  return {
    id: `${category}:${id}`,
    label,
    category,
    description,
    program,
    args,
    displayCommand: commandDisplay(program, args),
    source: "detected",
  }
}

export async function readText(path: string) {
  try {
    return await readFile(path, "utf8")
  } catch {
    return null
  }
}
