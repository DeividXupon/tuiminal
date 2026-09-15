import { FeatureInstallError } from "./model"
export function featureErrorMessage(error: unknown) {
  if (!(error instanceof FeatureInstallError))
    return "Não foi possível preparar a ferramenta. No desenvolvimento, execute bun run build:features."
  switch (error.kind) {
    case "integrity":
      return "A ferramenta falhou na verificação. Instale-a novamente."
    case "catalog":
      return "O catálogo de ferramentas não corresponde a esta versão do Tuiminal."
    case "network":
      return "O download falhou. Verifique sua conexão e tente novamente."
    case "storage":
      return "Não foi possível salvar a ferramenta. Verifique a pasta de dados do Tuiminal."
    case "missing":
      return "Esta ferramenta não está instalada. Execute tuiminal features para instalá-la."
    case "cancelled":
      return "Instalação de ferramenta cancelada"
  }
}
