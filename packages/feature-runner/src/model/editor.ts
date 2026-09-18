import type { RunnerConfiguredCommand, RunnerEnvironmentProfile, RunnerHealthCheck } from "./config"
import {
  createRunnerPlan,
  resolveRunnerReference,
  type RunnerFlow,
  type RunnerDependency,
} from "./plan"
import type { RunnerCommand } from "./types"

export type RunnerDraft = Record<string, string>
export type RunnerEditorField = { key: string; label: string; help: string }
export const COMMAND_FIELDS: RunnerEditorField[] = [
  {
    key: "label",
    label: "Nome",
    help: "Nome exibido no Runner. Editar um comando detectado cria uma configuração local; a origem é preservada.",
  },
  {
    key: "command",
    label: "Comando literal",
    help: "Comando literal, executado somente por uma ação de executar. Sugestões incluem scripts detectados. Ex.: bun run dev",
  },
  {
    key: "cwd",
    label: "Diretório de execução",
    help: "Pasta absoluta ou relativa ao projeto. Vazio usa a raiz. [Ctrl+Space] sugere diretórios. Ex.: services/api",
  },
  {
    key: "env",
    label: "Ambiente JSON",
    help: 'Objeto JSON de textos. O comando sobrescreve o perfil. Ex.: {"PORT":"3000"}',
  },
  {
    key: "profile",
    label: "Perfil",
    help: "ID do perfil detectado; vazio usa o perfil selecionado no Runner. [Ctrl+Space] mostra os perfis.",
  },
  {
    key: "envFile",
    label: "Arquivo de ambiente",
    help: "Arquivo .env absoluto ou relativo ao projeto. Vazio não adiciona arquivo ao comando.",
  },
  {
    key: "interactive",
    label: "PTY",
    help: "true ou false. Use true para shells, REPLs e menus interativos. Servidores de log normalmente usam false.",
  },
  {
    key: "restartPolicy",
    label: "Política de reinício",
    help: "never: não reiniciar; on-failure: reiniciar em erro; always: reiniciar ao encerrar. Parar cancela reinícios.",
  },
  {
    key: "restartDelayMs",
    label: "Intervalo de reinício (ms)",
    help: "Intervalo inteiro entre reinícios: 100 a 300000 ms. Ex.: 1000",
  },
  {
    key: "maxRestarts",
    label: "Máximo de reinícios",
    help: "Número máximo de reinícios automáticos: 0 a 100. Ex.: 5",
  },
  {
    key: "healthCheck",
    label: "Health check JSON",
    help: 'JSON ou vazio. type: port (host, port), http (url), log (pattern regex). timeoutMs: 500–600000. Ex.: {"type":"log","pattern":"ready","timeoutMs":30000}',
  },
  {
    key: "dependsOn",
    label: "Dependências",
    help: "Separe nomes/IDs por vírgula. @completed aguarda sucesso; @started aguarda início e health check. Padrão: @completed. Ex.: build@completed, api@started",
  },
  {
    key: "autostart",
    label: "Autostart",
    help: "true solicita início automático com aprovação explícita. Alterar comandos, dependências ou fluxos exige nova aprovação. Ex.: true",
  },
]
export const FLOW_FIELDS: RunnerEditorField[] = [
  COMMAND_FIELDS[0]!,
  {
    key: "stages",
    label: "Etapas",
    help: "> separa etapas; + executa em paralelo. Sufixo da etapa: @completed (padrão) ou @started (inclui saúde). Ex.: build > api + worker@started > smoke",
  },
  COMMAND_FIELDS.at(-1)!,
]

export function runnerCommandDraft(command?: RunnerCommand): RunnerDraft {
  return {
    label: command?.label ?? "",
    command: command?.displayCommand ?? "",
    cwd: command?.workingDirectory ?? "",
    env: JSON.stringify(command?.env ?? {}),
    envFile: command?.envFile ?? "",
    profile: command?.profile ?? "",
    interactive: String(command?.interactive ?? false),
    restartPolicy: command?.restartPolicy ?? "never",
    restartDelayMs: String(command?.restartDelayMs ?? 1000),
    maxRestarts: String(command?.maxRestarts ?? 5),
    healthCheck: command?.healthCheck ? JSON.stringify(command.healthCheck) : "",
    dependsOn:
      command?.dependsOn
        ?.map((dependency) => `${dependency.commandId}@${dependency.condition}`)
        .join(", ") ?? "",
    autostart: String(command?.autostart ?? false),
  }
}
export function runnerFlowDraft(flow?: RunnerFlow): RunnerDraft {
  return {
    label: flow?.label ?? "",
    autostart: String(flow?.autostart ?? false),
    stages:
      flow?.stages.map((stage) => `${stage.commandIds.join(" + ")}@${stage.waitFor}`).join(" > ") ??
      "",
  }
}
function booleanField(value: string | undefined) {
  if (value !== "true" && value !== "false") throw new Error("Use true ou false.")
  return value === "true"
}
function integerField(value: unknown, minimum: number, maximum: number) {
  if (value === "" || value == null) throw new Error("Número fora do intervalo permitido.")
  const result = Number(value)
  if (!Number.isInteger(result) || result < minimum || result > maximum)
    throw new Error("Número fora do intervalo permitido.")
  return result
}
function healthField(source: string): RunnerHealthCheck | undefined {
  if (!source.trim()) return undefined
  const health = JSON.parse(source)
  const timeoutMs = integerField(health.timeoutMs ?? 30000, 500, 600000)
  if (health.type === "port")
    return {
      type: "port",
      host: String(health.host || "127.0.0.1"),
      port: integerField(health.port, 1, 65535),
      timeoutMs,
    }
  if (health.type === "http") {
    const url = new URL(health.url)
    if (!["http:", "https:"].includes(url.protocol)) throw new Error("Health check inválido.")
    return { type: "http", url: url.href, timeoutMs }
  }
  if (health.type === "log" && typeof health.pattern === "string" && health.pattern.trim()) {
    new RegExp(health.pattern)
    return { type: "log", pattern: health.pattern, timeoutMs }
  }
  throw new Error("Health check inválido.")
}
function conditionSuffix(source: string) {
  const [reference, condition = "completed", ...extra] = source.trim().split("@")
  if (extra.length || !["started", "completed"].includes(condition))
    throw new Error("Use @started ou @completed.")
  return { reference: reference!.trim(), condition: condition as RunnerDependency["condition"] }
}
export function runnerDependencies(source: string, commands: RunnerCommand[]): RunnerDependency[] {
  if (!source.trim()) return []
  return source.split(",").map((part) => {
    const { reference, condition } = conditionSuffix(part)
    return { commandId: resolveRunnerReference(commands, reference).id, condition }
  })
}
export function validateRunnerCommandDraft(
  draft: RunnerDraft,
  id: string,
  commands: RunnerCommand[],
  profiles: RunnerEnvironmentProfile[],
): RunnerConfiguredCommand {
  if (!draft.label?.trim() || !draft.command?.trim()) throw new Error("Informe nome e comando.")
  if (commands.some((command) => command.id !== id && command.label === draft.label!.trim()))
    throw new Error("Já existe um comando com esse nome.")
  const env = JSON.parse(draft.env || "{}")
  if (
    !env ||
    Array.isArray(env) ||
    typeof env !== "object" ||
    Object.entries(env).some(
      ([key, value]) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || typeof value !== "string",
    )
  )
    throw new Error("Use um objeto JSON com nomes de variáveis e valores de texto.")
  if (draft.profile && !profiles.some((profile) => profile.id === draft.profile))
    throw new Error("Perfil não encontrado.")
  if (!["never", "always", "on-failure"].includes(draft.restartPolicy!))
    throw new Error("Use never, on-failure ou always.")
  const command: RunnerConfiguredCommand = {
    id,
    label: draft.label.trim(),
    command: draft.command,
    description: "Comando salvo neste projeto",
    source: "saved",
    env,
    interactive: booleanField(draft.interactive),
    autostart: booleanField(draft.autostart),
    restartPolicy: draft.restartPolicy as RunnerConfiguredCommand["restartPolicy"],
    restartDelayMs: integerField(draft.restartDelayMs, 100, 300000),
    maxRestarts: integerField(draft.maxRestarts, 0, 100),
    persistLogs: false,
  }
  if (draft.cwd?.trim()) command.cwd = draft.cwd.trim()
  if (draft.envFile?.trim()) command.envFile = draft.envFile.trim()
  if (draft.profile) command.profile = draft.profile
  const healthCheck = healthField(draft.healthCheck ?? "")
  if (healthCheck) command.healthCheck = healthCheck
  const candidate: RunnerCommand = {
    id,
    label: command.label,
    displayCommand: command.command,
    category: "custom",
    description: command.description,
    program: "",
    args: [],
  }
  const catalog = [...commands.filter((item) => item.id !== id), candidate]
  command.dependsOn = runnerDependencies(draft.dependsOn ?? "", catalog)
  candidate.dependsOn = command.dependsOn
  createRunnerPlan(catalog, [id])
  return command
}
export function validateRunnerFlowDraft(
  draft: RunnerDraft,
  id: string,
  commands: RunnerCommand[],
): RunnerFlow {
  if (!draft.label?.trim() || !draft.stages?.trim())
    throw new Error("Informe um nome e pelo menos uma etapa.")
  const stages = draft.stages.split(">").map((part) => {
    const { reference, condition } = conditionSuffix(part)
    return {
      commandIds: reference
        .split("+")
        .map((name) => resolveRunnerReference(commands, name.trim()).id),
      waitFor: condition,
    }
  })
  const flow = { id, label: draft.label.trim(), autostart: booleanField(draft.autostart), stages }
  createRunnerPlan(commands, [], flow)
  return flow
}

export function runnerEditorSuggestions(
  field: string,
  value: string,
  commands: RunnerCommand[],
  profiles: RunnerEnvironmentProfile[],
) {
  if (field === "command")
    return [...new Set(commands.map((command) => command.displayCommand))]
      .filter((command) => command.includes(value))
      .slice(0, 6)
  if (field === "profile")
    return profiles
      .map((profile) => profile.id)
      .filter((id) => id.includes(value))
      .slice(0, 6)
  if (field === "dependsOn" || field === "stages") {
    const separator = field === "stages" ? /[>+]/ : /,/
    const parts = value.split(separator)
    const tail = parts.at(-1)!.trimStart()
    const prefix = value.slice(0, value.length - tail.length)
    return commands
      .filter((command) => command.id.includes(tail) || command.label.includes(tail))
      .slice(0, 6)
      .map((command) => prefix + command.id)
  }
  const values =
    field === "restartPolicy"
      ? ["never", "on-failure", "always"]
      : ["interactive", "autostart"].includes(field)
        ? ["false", "true"]
        : []
  return values.filter((candidate) => candidate.startsWith(value))
}
