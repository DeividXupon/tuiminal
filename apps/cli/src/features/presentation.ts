import type { FeatureId } from "./model"

export const FEATURE_PRESENTATIONS: Record<FeatureId, { title: string; description: string }> = {
  database: {
    title: "Database",
    description:
      "Conecte bancos, explore tabelas e execute SQL. Filtre resultados, edite registros e revise alterações antes de salvar.",
  },
  git: {
    title: "Git",
    description:
      "Revise diffs, prepare commits e compare branches. Acompanhe pull requests, issues e notificações do GitHub no mesmo lugar.",
  },
  runner: {
    title: "Runner",
    description:
      "Descubra scripts do projeto e execute vários comandos. Acompanhe logs, processos e portas sem sair do seu workspace.",
  },
  http: {
    title: "HTTP",
    description:
      "Monte requisições com headers, autenticação e body. Explore respostas, organize coleções e teste APIs no terminal.",
  },
  terminal: {
    title: "Free Terminal",
    description:
      "Abra sessões de shell no diretório do projeto. Execute seus comandos e alterne entre terminais mantendo cada sessão ativa.",
  },
}

export {
  FEATURE_PREVIEW_INTERVAL,
  FEATURE_PREVIEW_STEPS,
  featurePreviewFrame,
} from "./preview-frames"
