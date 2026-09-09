# Contribuindo com o Tuiminal

## Começar

Use Bun 1.3.14 (`.bun-version`). Na raiz do repositório:

```sh
bun install --frozen-lockfile
bun run dev
```

O CLI executa o código-fonte diretamente; não é necessário recompilar nem reinstalar
o comando global a cada edição. Não altere o link global de outro desenvolvedor.
Para iniciar um Runner com configuração descartável:

```sh
task_config=$(mktemp -d)
XDG_CONFIG_HOME="$task_config" bun bin/tuiminal.ts runner tests/fixtures/runner-project
```

A pasta temporária desse exemplo pode ser removida após fechar **essa** instância.
Não encerre processos, bancos ou outras instâncias do usuário durante os testes.

## Onde trabalhar

Leia [Arquitetura](./docs/architecture.md). Comece pela ferramenta em `src/features`.
Regras puras ficam em `model`; processos, disco e rede em serviços/drivers/storage;
componentes e integração com OpenTUI ficam na camada de interface.

Evite criar uma abstração genérica antes de haver usos concretos. Não crie um
`utils.ts` para misturar assuntos nem um hook com toda a lógica da ferramenta.
Preserve o runtime JSX localizado: trocar pelo JSX padrão quebra traduções.

## Comandos de qualidade

| Comando | Finalidade |
| --- | --- |
| `bun run format` | Aplicar a formatação padronizada |
| `bun run typecheck` | Validar com TypeScript nativo 7 e regras estritas |
| `bun run lint` | Encontrar problemas e avisos de complexidade |
| `bun run check:architecture` | Bloquear ciclos e imports entre camadas proibidas |
| `bun run check:maintainability` | Impedir crescimento acima dos limites registrados |
| `bun run test:unit` | Lógica e integrações locais determinísticas |
| `bun run test:tui` | Renderizador OpenTUI real com teclado simulado |
| `bun run check` | Executar todos os gates anteriores, incluindo formato e testes |
| `bun run test:database:drivers` | Matriz opt-in com Docker, fora do gate normal |

O Bun é o runtime dos comandos, inclusive do dependency-cruiser. O compilador
principal continua sendo TypeScript 7 (`typescript-native`, alias npm). A dependência
`typescript` 6.0.3 fornece somente a API AST compatível com dependency-cruiser 18;
não substitua `typecheck` por `bunx tsc`, pois o binário resolvido pode ser o outro.
Essa compatibilidade deve ser revisitada quando o analisador suportar a API nativa.

## Testes e revisão

1. Adicione testes da regra pura e regressões da interação alterada.
2. Use fixtures locais e configuração temporária; nunca credenciais reais.
3. Para foco/teclado, teste o componente **e** a composição com `App`. Valide uma
   instância real do CLI quando a sequência puder ser automatizada.
4. Execute `bun run format`, `bun run check` e `git diff --check`.
5. Atualize README/AGENTS se comportamento ou atalhos mudaram; registre decisões
   arquiteturais duráveis em `docs/adr`.

O CI está configurado para Linux e macOS. A matriz Docker continua opt-in.
Cobertura do Bun só considera arquivos carregados: uma porcentagem alta isolada
não demonstra cobertura de todas as telas. Não substitua os testes de interação
por testes que apenas procuram texto no código.

## Dívida existente

`docs/quality-baseline.json` registra exceções para arquivos grandes e funções acima
de complexidade 20. O verificador compara tamanho e a distribuição de complexidade
por arquivo; não garante qualidade arquitetural por si só. Funções novas devem ser
pequenas e testáveis mesmo quando uma redução em outra função cria margem no gate.

Prefira reduzir as exceções. Alterar o baseline exige justificativa e revisão.
`bun scripts/check-maintainability.ts --write-baseline` é uma operação **explícita de
manutenção**, nunca uma etapa automática do check ou do CI.

## Licença das contribuições

Ao enviar uma contribuição ao Tuiminal, você concorda que ela seja licenciada sob
a [Apache License 2.0](./LICENSE), salvo quando houver um acordo escrito diferente.
