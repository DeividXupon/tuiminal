<div align="center">

# Tuiminal

### Um workspace completo de desenvolvimento dentro do terminal.

Banco de dados, GitHub, processos, APIs e terminais reais em uma única interface rápida e responsiva.

[![npm](https://img.shields.io/npm/v/tuiminal?label=npm&color=4B75FF)](https://www.npmjs.com/package/tuiminal)
[![status](https://img.shields.io/badge/status-pre--alpha-F7C873)](https://github.com/DeividXupon/tuiminal/releases)
[![license](https://img.shields.io/github/license/DeividXupon/tuiminal?color=72D5A3)](./LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-5FA04E)](#instalação)

[Instalação](#instalação) · [Banco](#banco) · [Git](#git) · [Runner](#runner) · [HTTP](#http) · [Free Terminal](#free-terminal) · [Contribuir](#desenvolvimento)

</div>

> [!WARNING]
> O Tuiminal está em **pré-alfa**. Já pode ser instalado e testado, mas atalhos, formatos e APIs ainda podem mudar entre versões.

O Tuiminal foi feito para manter o fluxo de trabalho no mesmo lugar. Em vez de alternar entre um cliente de banco, uma interface Git, vários terminais e um cliente HTTP, você abre o projeto uma vez e troca de ferramenta com `[Alt+1–5]`.

- Interface densa construída com Bun, OpenTUI, React e tuiparts.
- Funciona em qualquer diretório; Git, Runner e terminais usam o projeto informado ao CLI.
- Teclado e mouse são cidadãos de primeira classe.
- Layout moldurado ou compacto, sete paletas e seis idiomas.
- Processos e PTYs permanecem vivos enquanto você troca de tab.
- Dados sensíveis, escritas e operações remotas recebem proteções explícitas.

## Instalação

Instale a pré-alfa pelo npm:

```bash
npm install --global tuiminal@pre-alpha
tuiminal
```

Você **não precisa instalar o Bun** para usar o pacote publicado. O npm baixa o binário compatível com macOS, Linux glibc ou Windows, nas arquiteturas x64 e ARM64. Node.js 18 ou superior é usado pelo pequeno launcher do pacote.

Para atualizar ou remover:

```bash
npm install --global tuiminal@pre-alpha
npm uninstall --global tuiminal
```

## Primeiros passos

Abra o diretório atual, outro projeto ou somente uma ferramenta:

```bash
tuiminal
tuiminal ../meu-projeto

tuiminal banco ./meu-projeto
tuiminal git ./meu-projeto
tuiminal runner ./meu-projeto
tuiminal http ./meu-projeto
tuiminal terminal ./meu-projeto
```

Os aliases `database`/`db`, `run` e `term`/`tty` também são aceitos. No modo isolado, ferramentas ocultas não são inicializadas.

### Navegação global

| Ação | Atalho |
| --- | --- |
| Abrir Banco | `[Alt+1]` |
| Abrir Git | `[Alt+2]` |
| Abrir Runner | `[Alt+3]` |
| Abrir HTTP | `[Alt+4]` |
| Abrir Free Terminal | `[Alt+5]` |
| Abrir configurações | `[,]` |
| Sair | `[Q]`, `[Esc]` ou `[Ctrl+C]` |

No macOS, `Alt` corresponde a `Option`. Se o terminal não enviar essas combinações, ative **Use Option as Meta key** ou a opção equivalente. Os números sem modificador continuam livres para ações locais das ferramentas.

## Cinco ferramentas, um único fluxo

| Tab | Para quê serve |
| --- | --- |
| `[Alt+1]` Banco | Explorar dados e schema, escrever SQL e preparar alterações transacionais. |
| `[Alt+2]` Git | Revisar diffs locais, PRs, Issues e notificações do GitHub. |
| `[Alt+3]` Runner | Detectar comandos, executar serviços e acompanhar vários logs. |
| `[Alt+4]` HTTP | Criar, salvar, executar e automatizar requisições de API. |
| `[Alt+5]` Free Terminal | Abrir shells e qualquer CLI em seções com splits `2 × 2`. |

<a id="banco"></a>

## Banco

<p align="center">
  <img src="https://github.com/DeividXupon/tuiminal/raw/refs/heads/main/docs/media/database.gif" alt="Demonstração da tab Banco do Tuiminal" width="100%">
</p>

Um explorador de banco responsivo com catálogo, grade, inspetor e workspace SQL. Nenhuma conexão é criada automaticamente: a primeira abertura leva ao gerenciador de conexões.

### O que você pode fazer

- **Conectar:** MySQL/MariaDB, PostgreSQL, SQLite e servidores MySQL MCP opcionais. MCP é sempre explícito e somente leitura.
- **Explorar:** navegar por schemas, tabelas e views; inspecionar registros, colunas, índices, DDL, constraints e relacionamentos.
- **Encontrar dados:** ordenar a coluna ativa, buscar em todas as colunas, paginar e navegar horizontalmente sem perder a linha selecionada.
- **Selecionar em lote:** `[Space]` marca linhas; `[Alt+Space]` fixa uma âncora e `[↑/↓]` aumenta ou reduz um intervalo como em uma planilha.
- **Editar com segurança:** `INSERT`, `UPDATE` e `DELETE` ficam preparados localmente. `[Ctrl+S]` abre uma revisão e executa o conjunto aprovado em uma única transação.
- **Escrever SQL:** manter até seis abas independentes, executar somente o comando sob o cursor, cancelar consultas e ajustar a divisão editor/resultado.
- **Inspecionar e exportar:** visualizar todos os campos da linha e exportar as linhas marcadas em CSV, TSV ou JSON.
- **Proteger informações:** mascarar colunas sensíveis sob demanda e personalizar os termos usados para reconhecê-las.

### Fluxo de escrita

1. Abra uma tabela ou execute um `SELECT` simples editável.
2. Use `[Enter]`/`[E]` para editar, `[Ctrl+A]` para preparar uma linha ou `[dd]` para preparar exclusão.
3. Confira os indicadores de alterações locais na grade.
4. Pressione `[Ctrl+S]`, revise cada comando e confirme novamente.
5. O Tuiminal executa tudo em uma transação; se um comando falhar, o lote inteiro é revertido.

Perfis começam em **somente leitura**. Senhas não são gravadas no JSON de configuração: quando solicitado, são enviadas ao Keychain do macOS, libsecret no Linux ou Credential Manager no Windows. `DATABASE_URL`, `MYSQL_URL` e `POSTGRES_URL` podem ser descobertas sem virar perfis editáveis silenciosamente.

### Atalhos essenciais do Banco

| Ação | Atalho |
| --- | --- |
| Gerenciar conexões | `[C]` |
| Dados, colunas, índices e schema | `[1]`, `[2]`, `[3]`, `[4]` |
| Navegar por linhas | `[J/K]` ou `[↑/↓]` |
| Abrir tabela ou editar célula | `[Enter]` |
| Buscar tabela / buscar nos dados | `[/]` / `[S]` |
| Ordenar coluna | `[F]` |
| Marcar linha / selecionar intervalo | `[Space]` / `[Alt+Space]` |
| Exportar seleção | `[X]` |
| Página anterior / seguinte | `[P]` / `[N]` |
| Abrir workspace SQL | `[A]` |
| Executar comando SQL atual | `[Ctrl+A]` |
| Cancelar consulta | `[Ctrl+X]` |
| Nova aba / fechar aba SQL | `[Ctrl+N]` / `[Ctrl+W]` |
| Alternar abas SQL | `[Alt+←/→]` |
| Ajustar divisão / maximizar painel | `[Ctrl+↑/↓]` / `[F10]` |
| Revisar escritas preparadas | `[Ctrl+S]` |
| Atualizar dados e catálogo | `[R]` |

Configurações, termos sensíveis e até 100 leituras recentes ficam em `~/.config/tuiminal/databases.json`. Alterações são preservadas por 184 dias; parâmetros sensíveis são persistidos somente como `<mascarado>`.

<a id="git"></a>

## Git

<p align="center">
  <img src="https://github.com/DeividXupon/tuiminal/raw/refs/heads/main/docs/media/git.gif" alt="Demonstração da tab Git do Tuiminal" width="100%">
</p>

Uma área local no estilo lazygit e três dashboards remotos inspirados no gh-dash. Diffs funciona offline; PR, Issues e Inbox são carregados separadamente somente quando você os abre.

### `[1] Diffs`

- Agrupa arquivos modificados em uma árvore real de diretórios.
- Distingue staged, unstaged e untracked com o status de dois caracteres do Git.
- Exibe preview unificado, lado a lado ou intralinha com syntax highlight e números antigos/novos.
- Mantém um pequeno grafo de commits sob a árvore; `[G]` expande o grafo e `[O]` abre o histórico detalhado.
- `[Space]` aplica ou remove stage do arquivo; `[A]` faz o mesmo para todos.
- `[C]` alterna para **Comparar**, onde duas refs conhecidas são comparadas por `base...comparada` sem checkout e sem incluir mudanças locais.
- `[Ctrl+P]` escolhe outro repositório e branch local sem alterar o escopo de PR, Issues ou Inbox.

### `[2] PR`

- Começa com as seções **My PRs** e **Review requested**.
- Lista estado, repositório, revisão, CI, autor, responsáveis, comentários, labels e tamanho do diff.
- A prévia alterna entre visão geral, checks, atividade, commits e arquivos.
- O diff remoto abre dentro do Tuiminal e mantém a fila preservada ao voltar.
- Busca e seções usam qualifiers do GitHub com autocomplete para `repo:`, `author:`, `review-requested:` e outros filtros.
- Comentários, review, merge e demais escritas usam preparação, reautenticação, releitura do estado remoto e confirmação antes da execução.

### `[3] Issues`

- Começa com a seção **My Issues** e permite criar outras filas por query.
- Combina uma lista densa de duas linhas com visão geral e atividade da issue.
- Permite comentar, atribuir/remover responsáveis, editar labels, criar branch com checkout, fechar e reabrir.
- A busca sempre fica limitada a issues não arquivadas e nunca vira acidentalmente uma pesquisa global do GitHub.

### `[4] Inbox`

- Reúne Inbox, revisões solicitadas, itens atribuídos, menções e itens salvos localmente.
- Marcar como lida é explícito; concluir e cancelar inscrição sempre pedem confirmação.
- A atualização automática preserva os dados visíveis quando a rede falha.

PR e Issues usam o repositório do `origin` quando ele é reconhecido. Fora de um repositório, o escopo padrão é a conta autenticada — organizações e repositórios externos incluídos de forma explícita — em vez de uma busca aberta em todo o GitHub. As áreas remotas exigem o [GitHub CLI](https://cli.github.com/) autenticado.

### Atalhos essenciais do Git

| Ação | Atalho |
| --- | --- |
| Abrir Diffs, PR, Issues ou Inbox | `[1]`, `[2]`, `[3]`, `[4]` |
| Alternar Diffs / Comparar | `[C]` |
| Navegar na lista | `[J/K]` ou `[↑/↓]` |
| Alternar foco entre lista e preview | `[H/L]` ou `[←/→]` |
| Mudar seção | `[<]` / `[>]` |
| Abrir diff remoto | `[D]` |
| Abrir ações remotas | `[?]` |
| Stage do arquivo / todos | `[Space]` / `[A]` |
| Abrir histórico / grafo local | `[O]` / `[G]` |
| Mudar visualização do diff | `[V]` |
| Alterar projeto/branch de Diffs | `[Ctrl+P]` |
| Editar query remota | `[/]` |

O escopo remoto é salvo nos perfis de Git. A escolha local de Diffs fica separada em `~/.config/tuiminal/git-diffs.json`; itens salvos do Inbox ficam em `~/.config/tuiminal/git-inbox.json` com permissão `0600`.

<a id="runner"></a>

## Runner

<p align="center">
  <img src="https://github.com/DeividXupon/tuiminal/raw/refs/heads/main/docs/media/runner.gif" alt="Demonstração da tab Runner do Tuiminal" width="100%">
</p>

O Runner é a tela inicial do Tuiminal. Ele detecta comandos do projeto, inicia processos de curta ou longa duração e mantém logs, entrada e histórico dentro do mesmo workspace.

### O que você pode fazer

- **Detectar automaticamente:** scripts JavaScript, Composer/PHP, Laravel, Symfony, Python/Django, Go, Rust, Ruby/Rails, Maven, Gradle, .NET, Deno, Taskfile, Makefile, justfile e Docker Compose.
- **Executar qualquer coisa:** o campo manual aceita o comando literal; `[Ctrl+S]` salva o comando com nome e opção explícita de PTY.
- **Manter processos vivos:** selecionar um comando já ativo abre a sessão existente. `[R]` é a ação separada para iniciar outra instância.
- **Acompanhar logs:** alternar stdout/stderr, filtrar, copiar, exportar, mostrar horários e enviar dados para `stdin` ou PTY.
- **Ver vários serviços:** o modo Multi mostra até três logs lado a lado e navega por grupos adicionais.
- **Agir em grupo:** marcar comandos e iniciar, parar ou reiniciar todos em paralelo; grupos não fingem ser grafos de dependência.
- **Trocar de projeto:** `[+]` abre outro repositório ou diretório sem interromper processos atuais. Até quatro projetos ficam em tabs locais `[1]–[4]`.
- **Usar portas detectadas:** abrir a URL, copiá-la ou enviar a requisição diretamente para a tab HTTP.

Arquivos `.tuiminal/runner.yaml`, `mprocs.yaml`, `Procfile`, `Procfile.dev`, `Taskfile`, `Makefile` e outros formatos reconhecidos alimentam a descoberta. Somente `autostart: true` declarado no arquivo do Tuiminal pode iniciar um processo automaticamente.

```yaml
version: 1

profiles:
  development:
    envFile: .env.development
    env:
      LOG_LEVEL: debug

commands:
  api:
    command: npm run dev
    profile: development
    cwd: services/api
    restart: on-failure
    maxRestarts: 5
    health:
      type: http
      url: http://127.0.0.1:3000/health
      timeoutMs: 30000
```

### Atalhos essenciais do Runner

| Ação | Atalho |
| --- | --- |
| Executar ou abrir processo existente | `[Enter]` |
| Iniciar outra instância | `[R]` |
| Focar comando manual / salvar | `[/]` / `[Ctrl+S]` |
| Comandos / processos ativos | `[P]` |
| Visualização única / múltipla | `[M]` |
| Selecionar grupo | `[Space]` |
| Iniciar / parar / reiniciar grupo | `[G]` / `[Shift+G]` / `[Shift+R]` |
| Lista → log / log → lista | `[L/→]` / `[H/←]` |
| Abrir ou recolher histórico | `[S]` |
| Parar processo atual | `[Shift+K]` |
| Abrir menu de ações | `[A]` |
| Abrir outro projeto | `[+]` |
| Alternar projetos do Runner | `[1]`–`[4]` |
| Fechar tab de projeto sem parar processos | `[Ctrl+X]` |

Estado de sessão e comandos salvos ficam em `~/.config/tuiminal/runner.json`. Logs só são persistidos por opt-in ou exportação para `tuiminal-logs/`. Ao sair do Tuiminal, ele encerra somente os processos que iniciou.

<a id="http"></a>

## HTTP

<p align="center">
  <img src="https://github.com/DeividXupon/tuiminal/raw/refs/heads/main/docs/media/http.gif" alt="Demonstração da tab HTTP do Tuiminal" width="100%">
</p>

Um cliente de API compacto com documentos, coleção, builder, resposta e automação. O layout passa de três colunas para split ou painel único conforme o espaço, sem perder drafts, cursor, resposta ou foco.

### O que você pode fazer

- **Montar requests:** método, URL, query params, headers, JSON/texto/XML, form URL encoded, multipart, arquivo e autenticação Bearer, Basic ou API Key.
- **Inspecionar respostas:** status, duração, tamanho, headers, timing, Pretty/Raw, busca, JSONPath, cópia, salvamento e comparação.
- **Controlar o espaço:** request e response começam em `50/50`; `[Ctrl+↑/↓]` e o drag handle usam a mesma proporção por documento, limitada entre 25% e 70%.
- **Versionar coleções:** abrir e salvar `.http`/`.rest` interoperáveis sem regravar silenciosamente blocos que o Tuiminal não entende.
- **Importar:** Postman v2.1 e OpenAPI 3.0/3.1, com preview das conversões, avisos de perda e proteção para segredos encontrados.
- **Automatizar:** assertions de status/header/body/JSONPath, dependências entre requests e extração de variáveis públicas ou voláteis.
- **Executar coleções:** resolver dependências em ordem topológica, usar dataset JSON/CSV, limitar concorrência e emitir relatórios text, JSON ou JUnit.
- **Trabalhar com ambientes:** variáveis públicas/privadas por diretório, defaults do workspace e referências opacas ao gerenciador de credenciais do sistema.
- **Controlar transporte:** timeout, redirects, cookie jar, proxy HTTP/HTTPS e TLS. Desabilitar verificação TLS é explícito, visível em vermelho e exige aprovação por destino.

### Atalhos essenciais do HTTP

| Ação | Atalho |
| --- | --- |
| Focar URL / enviar / cancelar | `[/]` / `[S]` ou `[Enter]` / `[X]` |
| Método anterior / seguinte | `[Shift+M]` / `[M]` |
| Params, headers, body, auth e mais | `[P]`, `[H]`, `[B]`, `[A]`, `[O]` |
| Abrir ambientes | `[E]` |
| Alternar visualização da resposta | `[V]` |
| Abrir coleção / histórico | `[C]` / `[Y]` |
| Nova tab / fechar tab | `[Ctrl+N]` / `[Ctrl+W]` |
| Alternar documentos | `[Alt+←/→]` |
| Salvar `.http` | `[Ctrl+S]` |
| Ajustar split / maximizar | `[Ctrl+↑/↓]` / `[F10]` |
| Abrir jump mode | `[Ctrl+O]` |

Exemplo de request versionável:

```http
### Buscar usuário
# @name buscar-usuario
# @depends login
# @extract-secret token = $.token
# @assert status == 200
# @assert jsonpath $.id exists
GET {{baseUrl}}/users/42
Authorization: Bearer {{token}}
```

O mesmo motor também funciona sem abrir a interface:

```bash
tuiminal http run api.http#buscar-usuario --env local --report text
tuiminal http run api.http --data cases.json --concurrency 4 --report junit
tuiminal http import postman collection.json --output .tuiminal/http/imported
tuiminal http import openapi openapi.yaml --output .tuiminal/http/imported
```

Respostas são capturadas até cerca de 1,5 MB e renderizadas de forma limitada para manter a interface responsiva. Segredos são removidos de preview, cURL, conflitos, relatórios e erros; variáveis extraídas como secretas ficam somente em memória.

Valores de Path marcados como sensíveis seguem essa proteção, inclusive em URLs codificadas e linhas desativadas. Para salvar esses parâmetros em `.http`, use referências a variáveis privadas; valores secretos literais são recusados sem alterar o arquivo.

<a id="free-terminal"></a>

## Free Terminal

<p align="center">
  <img src="https://github.com/DeividXupon/tuiminal/raw/refs/heads/main/docs/media/terminal.gif" alt="Demonstração da tab Free Terminal do Tuiminal" width="100%">
</p>

Um multiplexador genérico, não um terminal restrito a uma ferramenta. Cada painel usa um PTY real e pode executar shells, REPLs, bancos interativos, Codex, Claude ou qualquer CLI disponível no `PATH`.

### O que você pode fazer

- Criar seções independentes e manter até 12 terminais na execução.
- Organizar cada seção em até quatro painéis numa grade `2 × 2`.
- Dividir o painel ativo para o lado ou criar uma linha inferior.
- Alternar entre a seção inteira e um terminal maximizado.
- Preservar cores, cursor, prompts interativos e aplicações TUI em tela cheia.
- Trocar de tab sem encerrar as sessões.
- Focar, dividir, reiniciar e fechar painéis pelo teclado ou mouse.

O prefixo `[Ctrl+B]`, inspirado no tmux, separa os comandos do multiplexador das teclas enviadas ao processo aberto:

| Depois de `[Ctrl+B]` | Ação |
| --- | --- |
| `[C]` | Criar seção |
| `[V]` | Dividir para o lado |
| `[S]` | Dividir para baixo |
| `[N]` / `[P]` | Próximo terminal / terminal anterior |
| `[1]`–`[4]` | Focar terminal visível |
| `[M]` ou `[F]` | Alternar seção / foco |
| `[[]` / `[]]` | Seção anterior / seguinte |
| `[R]` | Reiniciar sessão |
| `[X]` | Fechar sessão |
| `[G]` | Liberar o terminal para usar os atalhos globais |
| `[Ctrl+B]` | Enviar `Ctrl+B` ao processo aberto |

O campo `CMD` é opcional: vazio abre o shell padrão; preenchido executa o comando informado. Ao fechar o Tuiminal, somente os processos criados por ele são encerrados.

## Interface e personalização

`[,]` abre configurações contextuais. As mudanças são aplicadas sem desmontar editores, perder foco ou apagar o estado das ferramentas.

- **Modo de cor:** Dark ou Light.
- **Paletas:** Prime, Midnight, Nord, Gruvbox, Dracula, Catppuccin e Tokyo Night.
- **Layout:** Moldurado, com gaps e bordas completas; ou Compacto, com mais espaço e uma linha de foco por painel.
- **Idiomas:** português brasileiro, inglês, espanhol, japonês, chinês simplificado e coreano.
- **Tutorial:** um tour da ferramenta ativa com dados simulados e sem acesso a serviços reais.
- **Mouse:** tabs, listas, botões, campos, commits, diffs, scroll e splits continuam clicáveis.
- **Notificações:** informações, sucessos, avisos e erros aparecem sem roubar o foco.

As preferências ficam em `~/.config/tuiminal/settings.json`.

## Desenvolvimento

O pacote npm não exige Bun do usuário final. O checkout de desenvolvimento usa **Bun 1.3.14**, registrado em `.bun-version` e `package.json`:

```bash
git clone https://github.com/DeividXupon/tuiminal.git
cd tuiminal
bun install --frozen-lockfile
bun run dev
```

Comandos principais:

| Comando | Finalidade |
| --- | --- |
| `bun run dev` | Executar com reload durante o desenvolvimento |
| `bun run test:unit` | Testar regras e integrações locais |
| `bun run test:tui` | Testar a interface com o renderer real do OpenTUI |
| `bun run check` | Typecheck, formato, lint, arquitetura, manutenção e testes |
| `bun run docs:demos` | Recriar os cinco GIFs deste README a partir da UI real |
| `bun run build:release` | Gerar os pacotes de distribuição por plataforma |

`bun run docs:demos` usa dados simulados ou um repositório temporário, nunca credenciais e serviços do usuário. A conversão final dos frames requer [ImageMagick](https://imagemagick.org/).

Antes de contribuir, leia:

- [Guia de contribuição](./CONTRIBUTING.md)
- [Arquitetura do projeto](./docs/architecture.md)
- [Decisão do monólito modular](./docs/adr/0001-modular-monolith.md)

## Arquitetura e próximos passos

O código atual é um monólito modular: `src/app` compõe a aplicação, `src/core` contém infraestrutura, `src/shared` oferece peças reutilizáveis e `src/features` separa cada ferramenta.

O objetivo futuro é permitir que ferramentas oficiais e comunitárias usem o mesmo SDK público de plugins. Os documentos abaixo registram direção e evidências atuais; são planos evolutivos, não promessas de API congelada:

- [Plano do sistema de plugins](./PLUGIN_SYSTEM_PLAN.md)
- [Plano do cliente HTTP](./HTTP_CLIENT_PLAN.md)
- [Git Diffs e Pull Requests](./GIT_PR_PLAN.md)
- [Git Issues](./GIT_ISSUES_PLAN.md)
- [Git Inbox](./GIT_INBOX_PLAN.md)

## Licença

Copyright 2026 DeividXupon.

Distribuído sob a [Apache License 2.0](./LICENSE). Você pode usar, modificar e distribuir o Tuiminal, inclusive comercialmente, desde que preserve os termos e avisos exigidos pela licença.
