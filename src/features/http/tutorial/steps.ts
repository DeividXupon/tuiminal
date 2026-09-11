export const HTTP_TUTORIAL_STEPS = [
  {
    targetId: "tutorial-http-documents",
    group: "HTTP · DOCUMENTOS",
    title: "Requests abertos",
    description:
      "Cada tab preserva seu draft, resposta, foco e layout. Arquivos .http continuam versionáveis no projeto.",
    hint: "[Ctrl+N/W] cria ou fecha · [Alt+←/→] alterna",
    kind: "control",
  },
  {
    targetId: "tutorial-http-omnibar",
    group: "HTTP · EXECUÇÃO",
    title: "Método, URL, ambiente e envio",
    description:
      "A barra estável concentra o alvo da requisição. Enviar e cancelar funcionam pelo teclado ou pelo mouse.",
    hint: "[/] URL · [M] método · [E] ambiente · [S] enviar · [X] cancelar",
    kind: "action",
  },
  {
    targetId: "tutorial-http-collection",
    group: "HTTP · PROJETO",
    title: "Coleção e histórico",
    description:
      "A sidebar acompanha os arquivos .http, importa Postman/OpenAPI com prévia e reúne execuções da sessão.",
    hint: "[I] importa com prévia · [R] executa coleção · [Y] abre histórico",
    kind: "block",
  },
  {
    targetId: "tutorial-http-request",
    group: "HTTP · REQUEST",
    title: "Builder progressivo",
    description:
      "Params, headers, body e autenticação ficam disponíveis sem retirar espaço da URL e da resposta.",
    hint: "[A←]/[F→] percorre Params, Headers, Body, Auth e Mais no request focado",
    kind: "block",
  },
  {
    targetId: "tutorial-http-automation",
    group: "HTTP · AUTOMAÇÃO E SEGURANÇA",
    title: "Opções, assertions e chaining",
    description:
      "Mais mostra a preparação exata, dependências e extrações. Segredos ficam redigidos e valores extraídos podem ser voláteis.",
    hint: "[Z←]/[V→] navega · TLS inseguro sempre pede confirmação",
    kind: "control",
  },
  {
    targetId: "tutorial-http-response",
    group: "HTTP · RESPONSE",
    title: "Resposta inspecionável",
    description:
      "Status, headers, timing, busca, JSONPath e truncamento permanecem explícitos em qualquer composição responsiva.",
    hint: "[A←]/[F→] muda visão · [Ctrl+F] busca · [F10] maximiza",
    kind: "block",
  },
] as const
