import type { RunnerCommand } from "./types"

import type { RunnerDependency } from "./config"
export type { RunnerDependency } from "./config"
export type RunnerFlow = {
  id: string
  label: string
  autostart: boolean
  stages: { commandIds: string[]; waitFor: RunnerDependency["condition"] }[]
}
export type RunnerPlanNode = { command: RunnerCommand; dependencies: RunnerDependency[] }
export type RunnerPlan = RunnerPlanNode[]
export type RunnerNodeStatus =
  | "pending"
  | "starting"
  | "started"
  | "healthy"
  | "success"
  | "failed"
  | "stopped"
  | "blocked"

export function resolveRunnerReference(commands: RunnerCommand[], reference: string) {
  const exact = commands.find((command) => command.id === reference)
  if (exact) return exact
  const matches = commands.filter(
    (command) => command.label === reference || command.id === `tuiminal:${reference}`,
  )
  if (matches.length !== 1) throw new Error(`Referência ausente ou ambígua: ${reference}`)
  return matches[0]!
}

export function createRunnerPlan(
  commands: RunnerCommand[],
  targets: string[],
  flow?: RunnerFlow,
): RunnerPlan {
  const nodes = new Map<string, RunnerPlanNode>()
  const add = (reference: string): RunnerPlanNode => {
    const command = resolveRunnerReference(commands, reference)
    const existing = nodes.get(command.id)
    if (existing) return existing
    const node: RunnerPlanNode = { command, dependencies: [] }
    nodes.set(command.id, node)
    node.dependencies = (command.dependsOn ?? []).map((dependency) => {
      if (!["started", "completed"].includes(dependency.condition))
        throw new Error("Use @started ou @completed.")
      return { commandId: add(dependency.commandId).command.id, condition: dependency.condition }
    })
    return node
  }
  for (const target of targets) add(target)
  if (flow) addFlowStages(flow, add)
  const visited = new Set<string>()
  const visiting = new Set<string>()
  const visit = (id: string) => {
    if (visiting.has(id)) throw new Error("Ciclo de dependências detectado.")
    if (visited.has(id)) return
    visiting.add(id)
    for (const parent of nodes.get(id)!.dependencies) visit(parent.commandId)
    visiting.delete(id)
    visited.add(id)
  }
  for (const id of nodes.keys()) visit(id)
  return structuredClone([...nodes.values()])
}

export function runnerDependencySatisfied(
  dependency: RunnerDependency,
  parent: RunnerPlanNode,
  status: RunnerNodeStatus,
) {
  if (dependency.condition === "completed") return status === "success"
  if (parent.command.healthCheck) return status === "healthy" || status === "success"
  return status === "started" || status === "healthy" || status === "success"
}

export function runnerPlanTransitions(
  plan: RunnerPlan,
  states: ReadonlyMap<string, RunnerNodeStatus>,
) {
  const nodes = new Map(plan.map((node) => [node.command.id, node]))
  const failures = new Map<string, boolean>()
  const hasFailedAncestor = (id: string): boolean => {
    if (failures.has(id)) return failures.get(id)!
    const failed = nodes
      .get(id)!
      .dependencies.some(
        (dependency) =>
          ["failed", "stopped", "blocked"].includes(states.get(dependency.commandId)!) ||
          hasFailedAncestor(dependency.commandId),
      )
    failures.set(id, failed)
    return failed
  }
  const blocked: string[] = []
  const ready: string[] = []
  for (const node of plan) {
    if (states.get(node.command.id) !== "pending") continue
    const failed = hasFailedAncestor(node.command.id)
    if (failed) blocked.push(node.command.id)
    else if (
      node.dependencies.every((dependency) =>
        runnerDependencySatisfied(
          dependency,
          plan.find((parent) => parent.command.id === dependency.commandId)!,
          states.get(dependency.commandId)!,
        ),
      )
    )
      ready.push(node.command.id)
  }
  return { blocked, ready }
}

function addFlowStages(flow: RunnerFlow, add: (reference: string) => RunnerPlanNode) {
  if (!flow.stages.length) throw new Error("Informe um nome e pelo menos uma etapa.")
  const seen = new Set<string>()
  for (const [index, stage] of flow.stages.entries()) {
    if (!stage.commandIds.length) throw new Error("Uma etapa precisa de comandos.")
    if (!["started", "completed"].includes(stage.waitFor))
      throw new Error("Use @started ou @completed.")
    for (const reference of stage.commandIds) {
      const node = add(reference)
      if (seen.has(node.command.id)) throw new Error("Não repita um comando nas etapas.")
      seen.add(node.command.id)
      const previous = flow.stages[index - 1]
      for (const parent of previous?.commandIds ?? []) {
        node.dependencies.push({
          commandId: add(parent).command.id,
          condition: previous!.waitFor,
        })
      }
    }
  }
}
