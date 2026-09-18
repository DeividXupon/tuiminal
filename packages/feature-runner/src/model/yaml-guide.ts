import { runnerYamlHelp } from "./yaml-editor"

export type RunnerYamlGuideTopic = {
  title: string
  fields: { names: string[]; help: string }[]
  example: string
}
const field = (...names: string[]) => ({ names, help: runnerYamlHelp(names[0]!) })

export const RUNNER_YAML_GUIDE: RunnerYamlGuideTopic[] = [
  {
    title: "Estrutura e nomes",
    fields: [
      {
        names: ["commands", "flows", "profiles"],
        help: "commands define comandos; flows organiza etapas; profiles reúne variáveis de ambiente. Cada entrada tem um ID estável, usado nas referências. label muda só o nome exibido.",
      },
      field("label"),
      field("description"),
    ],
    example: `commands:
  api:
    label: API local
    description: Local development server
    command: bun run dev
flows: {}
profiles: {}`,
  },
  {
    title: "Comandos e diretórios",
    fields: [
      field("command"),
      field("cwd"),
      {
        names: ["|", "#"],
        help: "Use dois espaços por nível. | preserva várias linhas no comando. # inicia um comentário fora de aspas; dentro de um bloco | faz parte do comando.",
      },
    ],
    example: `commands:
  build:
    label: Build
    cwd: .
    command: |
      bun install
      bun run build
    # Optional settings
    interactive: false`,
  },
  {
    title: "Ambiente e perfis",
    fields: [field("env"), field("profile"), field("envFile")],
    example: `profiles:
  local:
    label: Local
    env:
      NODE_ENV: development
    envFile: .env.local
commands:
  api:
    command: bun run dev
    profile: local
    env:
      PORT: '3000'`,
  },
  {
    title: "Processos e reinícios",
    fields: [
      field("interactive"),
      field("restart", "restartPolicy"),
      field("restartDelayMs"),
      field("maxRestarts"),
      {
        names: ["persistLogs"],
        help: "true mantém os logs deste comando em disco; false mantém apenas o buffer da sessão. Padrão: false.",
      },
    ],
    example: `commands:
  worker:
    command: bun run worker
    interactive: false
    restart: on-failure
    restartDelayMs: 1000
    maxRestarts: 5
    persistLogs: false`,
  },
  {
    title: "Dependências",
    fields: [field("dependsOn", "commandId", "condition")],
    example: `commands:
  build:
    command: bun run build
  api:
    command: bun run dev
    dependsOn:
      - commandId: build
        condition: completed`,
  },
  {
    title: "Prontidão dos serviços",
    fields: [
      field("health", "healthCheck", "type", "timeoutMs"),
      {
        names: ["pattern", "port", "host", "url"],
        help: "log procura pattern (expressão regular) nos logs. port testa uma porta de 1 a 65535 em host (padrão: 127.0.0.1). http consulta url HTTP(S). Sem health, started espera apenas o início do processo.",
      },
    ],
    example: `commands:
  api:
    command: bun run dev
    health:
      type: http
      url: http://127.0.0.1:3000/health
      timeoutMs: 30000
  worker:
    command: bun run worker
    health:
      type: log
      pattern: 'ready|listening'
  server:
    command: bun run server
    health:
      type: port
      host: 127.0.0.1
      port: 8080`,
  },
  {
    title: "Fluxos por etapas",
    fields: [field("stages", "commandIds", "waitFor")],
    example: `commands:
  build:
    command: bun run build
  api:
    command: bun run dev
  worker:
    command: bun run worker
flows:
  development:
    label: Development
    stages:
      - commandIds: [build]
        waitFor: completed
      - commandIds: [api, worker]
        waitFor: started`,
  },
  {
    title: "Salvar e iniciar",
    fields: [
      field("autostart"),
      {
        names: ["Ctrl+Y", "F1", "Ctrl+Space", "Tab", "Ctrl+S", "Ctrl+O"],
        help: "[Ctrl+Y] abre o YAML no Runner. [F1] abre este tutorial. [Ctrl+Space] sugere valores; [Tab] insere dois espaços. [Ctrl+S] valida e salva globalmente, sem executar. [Ctrl+O] abre comandos e fluxos após salvar.",
      },
    ],
    example: `commands:
  api:
    command: bun run dev
    autostart: false
flows:
  development:
    autostart: false
    stages:
      - commandIds: [api]
        waitFor: started`,
  },
]

export function runnerYamlGuideIndex(key: string) {
  return Math.max(
    0,
    RUNNER_YAML_GUIDE.findIndex((topic) => topic.fields.some((field) => field.names.includes(key))),
  )
}
