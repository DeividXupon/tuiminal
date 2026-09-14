import type { GitHubCliInstallMode } from "../../services/github/installer"

export type GitHubGuidanceMode = GitHubCliInstallMode | "authenticate"
export type GitHubGuidanceStatus = "idle" | "checking" | "ready" | "failed"

export type GitHubGuidanceCopy = {
  title: string
  description: string
  compactGuide: string
  steps: readonly string[]
  terminalTitle: string
  waiting: string
  checking: string
  ready: string
  unavailable: string
}

export function githubGuidanceCopy(mode: GitHubGuidanceMode, missing: boolean): GitHubGuidanceCopy {
  if (mode === "authenticate") {
    return {
      title: "◆ AUTENTICAÇÃO GITHUB NECESSÁRIA",
      description:
        "O gh cuida do login com o GitHub e guarda a credencial usando os mecanismos configurados no seu sistema.",
      compactGuide:
        "Copie o comando, abra o mini terminal e execute você mesmo. O Tuiminal apenas verifica quando o login estiver pronto.",
      steps: [
        "1. Confira o host e o comando de login exibidos abaixo.",
        "2. Use [C] para copiar, [Enter] para abrir o terminal e cole o comando.",
        "3. Execute e siga o navegador ou código informado pelo próprio GitHub.",
        "4. Ao concluir, o Tuiminal detecta o login e recarrega esta tela automaticamente.",
      ],
      terminalTitle: "❯ LOGIN DO GITHUB",
      waiting: "AGUARDANDO O LOGIN FEITO POR VOCÊ…",
      checking: "VALIDANDO A AUTENTICAÇÃO…",
      ready: "LOGIN CONFIRMADO · RECARREGANDO…",
      unavailable: "O login ainda não foi confirmado para este host.",
    }
  }
  return {
    title: missing ? "◆ GITHUB CLI NÃO ENCONTRADO" : "◆ GITHUB CLI PRECISA SER ATUALIZADO",
    description:
      "gh é a ferramenta oficial do GitHub para usar Pull Requests, Issues e autenticação diretamente no terminal.",
    compactGuide:
      "Copie o comando, abra o mini terminal e execute você mesmo. O Tuiminal nunca inicia a instalação.",
    steps: [
      "1. Confira o comando oficial detectado para seu sistema.",
      "2. Use [C] para copiar, [Enter] para abrir o terminal e cole o comando.",
      "3. Execute e informe sua senha administrativa somente se o sistema pedir.",
      "4. Ao concluir, o Tuiminal valida a versão e recarrega esta tela automaticamente.",
    ],
    terminalTitle: "❯ TERMINAL GUIADO · INSTALAÇÃO DO GH",
    waiting: "AGUARDANDO A INSTALAÇÃO FEITA POR VOCÊ…",
    checking: "VALIDANDO A INSTALAÇÃO…",
    ready: "GH INSTALADO · RECARREGANDO…",
    unavailable: "gh 2.40.0 ou mais recente ainda não foi encontrado.",
  }
}
