# Tuiminal

Um painel de trabalho extensível construído com OpenTUI, React e tuiparts.

Funcionalidades atuais:

- Navegação por tabs
- Explorador de bancos MySQL, PostgreSQL e SQLite, além de servidores MCP compatíveis
- Workspace Git no estilo lazygit para o repositório de onde o app foi iniciado
- Git `[1] Base` / `[2] PR`, com dashboard multirrepositório, prévia, diff, CI e ações seguras
- Runner de scripts com logs ao vivo, processos simultâneos e histórico da sessão
- Cliente HTTP com métodos, headers, body, resposta formatada e histórico
- Free Terminal com sessões PTY persistentes, splits e comandos livres
- Busca de tabelas, paginação adaptativa e navegação horizontal por colunas
- Mascaramento automático de colunas sensíveis

## Planejamento futuro

O plano para transformar as ferramentas em plugins oficiais e permitir plugins
criados pela comunidade está em [PLUGIN_SYSTEM_PLAN.md](./PLUGIN_SYSTEM_PLAN.md).
Ele é um roteiro evolutivo, não uma especificação definitiva: fases, comandos e
decisões técnicas podem mudar depois de protótipos, testes e feedback. Nada nesse
plano deve ser interpretado como funcionalidade já disponível.

O [plano Git Base/PR](./GIT_PR_PLAN.md) documenta a implementação da aba
`[1] Base` / `[2] PR`, com dashboard multirrepositório inspirado no gh-dash. A
[especificação de interface](./docs/design/git-pr-interface.md) reúne imagens de
referência, wireframes, atalhos, decisões de segurança e critérios de layout.

## Executar

Use Bun **1.3.14**, registrado em `.bun-version` e `package.json`.

```bash
bun install --frozen-lockfile
bun run start
```

## Testes

Testes automatizados fazem parte do fluxo obrigatório do projeto. Rode a suíte
durante o desenvolvimento com:

```bash
bun run test
```

Antes de entregar uma alteração, rode a verificação completa, que executa
typecheck, formatação, lint, arquitetura, limites de manutenção e todos os testes:

```bash
bun run check
```

Correções de bugs devem ganhar um teste de regressão quando o comportamento
puder ser automatizado. Testes de integração usam somente diretórios
temporários, servidores locais efêmeros e bancos descartáveis.

## Organização e contribuição

O código é um **monólito modular**: `src/app` compõe as ferramentas,
`src/core` contém infraestrutura, `src/shared` contém peças reutilizáveis e
`src/features` separa Runner, Banco, Git, HTTP e Terminal.

- [Guia para contribuir](./CONTRIBUTING.md): setup, comandos, testes e checklist.
- [Arquitetura atual](./docs/architecture.md): responsabilidades, dependências e como adicionar ferramentas.
- [Decisão e limites desta migração](./docs/adr/0001-modular-monolith.md): o que mudou e o que ainda precisa ser extraído.

O uso do aplicativo e os arquivos de sessão/configuração continuam iguais.
Os testes de interface podem ser executados separadamente com `bun run test:tui`.

## Usar como comando

Instale o projeto local como um comando global uma vez:

```bash
bun add --global "$PWD"
```

Depois, execute o Tuiminal de qualquer diretório. A tela inicial é o Runner:
sem argumento, ele usa o diretório atual; com um caminho, abre esse projeto.
As outras ferramentas continuam disponíveis nas abas:

```bash
tuiminal
tuiminal ../outro-projeto
tuiminal /caminho/absoluto/do/repositorio
```

Para carregar somente uma ferramenta, use seu nome como subcomando. Um
diretório opcional pode vir depois dele:

```bash
tuiminal banco
tuiminal git ../outro-projeto
tuiminal runner
tuiminal http
tuiminal terminal
```

Nesse modo isolado, as outras ferramentas não são montadas nem inicializadas.

Use `tuiminal --help` para ver todas as opções. Se o shell não encontrar o
comando, confira se `~/.bun/bin` está no `PATH`. Para removê-lo, execute
`bun remove --global tuiminal`.

## Navegação

- `@`: abrir Banco
- `#`: abrir Git
- `$`: abrir Runner
- `%`: abrir HTTP
- `^`: abrir Free Terminal
- `,`: abrir as configurações de aparência
- `q`, `Esc` ou `Ctrl+C`: sair

Toda a interface também pode ser operada com o mouse. Clique nas tabs, botões,
campos, projetos, arquivos e commits; use a roda do mouse nas listas, diffs e
respostas HTTP. Os atalhos de teclado continuam disponíveis em paralelo.

Os atalhos entre colchetes, como `[Ctrl+S]` e `[H/←]`, usam o azul `#4B75FF`,
a mesma cor do nome **TUIMINAL** no topo, em todas as paletas. O restante dos
rótulos conserva suas cores; logs, código e dados não recebem esse destaque.

## Configurações

O botão `Config` e o atalho `[,]` abrem o modal contextual de configurações.
Paleta, layout, idioma e tutorial ficam sob **Configurações globais** em qualquer
ferramenta. **Configurações do banco** aparece primeiro somente quando a aba Banco
está ativa e contém Dados sensíveis e Histórico SQL; essas opções não aparecem nas
demais ferramentas. O modal permite trocar entre as paletas Prime, Midnight, Nord
e Gruvbox e alternar o layout entre:

- **Moldurado**: mantém o espaçamento e as bordas arredondadas entre os painéis.
- **Compacto**: remove padding, gaps e bordas dos painéis principais; fundos
  levemente alternados continuam separando cada área, e seleções usam um tom
  escuro do acento para permanecerem legíveis também em terminais de 256 cores.

As alterações são aplicadas imediatamente em todas as ferramentas e ficam
salvas em `~/.config/tuiminal/settings.json`. No modal, use `[↑/↓]` para
escolher a seção, `[←/→]` para mudar a opção, `[R]` para restaurar o padrão e
`[Enter]` ou `[Esc]` para fechar. Todas as opções também aceitam clique.

O tour guiado permanece focado na ferramenta atual. No Banco ele abre uma
demonstração inteiramente fictícia, mesmo sem conexão configurada, e percorre
catálogo, tabelas abertas, filtros, estrutura, seleção e exportação em lote,
escrita preparada, revisão transacional, inspetor e paginação. Use `[←/↑]` para
voltar, `[→/↓/Enter]` para avançar e `[Esc]` para encerrar; os controles do card
também aceitam clique e nenhum banco real é acessado durante o tour.
No Git, o tour usa PRs, checks e diffs fictícios para explicar Base/PR, seções,
lista, prévia, ações e diff sem consultar uma conta GitHub.

## Banco

- `[C]`: abrir o gerenciador de conexões
- `[1]` / `[2]` / `[3]` / `[4]`: alternar entre dados, colunas, índices e schema
- `[↑/↓]`: navegar pelas tabelas ou registros
- `[Enter]`: abrir a tabela ou editar a célula selecionada
- `[/]`: focar a busca de tabelas
- `[H/←]` / `[L/→]`: navegar no conteúdo; quando a direção não tem outra ação, focar o bloco vizinho
- `[<]` / `[>]`: navegar pelo histórico de tabelas abertas
- `[F]`: alternar a coluna selecionada entre ordem normal, crescente e decrescente
- `[S]`: buscar um valor semelhante em todas as colunas da tabela
- `[Space]`: marcar ou desmarcar a linha atual para ações em lote
- `[Ctrl+Space]`: marcar ou desmarcar todas as linhas da página atual
- `[X]`: exportar as linhas marcadas como CSV, TSV ou JSON
- `[N]` / `[P]`: próxima página ou página anterior
- `[A]`: abrir ou retornar ao workspace SQL; `[Ctrl+A]` executa somente o comando sob o cursor
- `[Ctrl+X]`: cancelar a consulta SQL em execução
- `[Ctrl+N]` / `[Ctrl+W]`: criar ou fechar uma aba SQL
- `[Alt+←]` / `[Alt+→]`: navegar entre abas SQL e seus resultados independentes
- `[Ctrl+↑]` / `[Ctrl+↓]`: aumentar ou diminuir o espaço do editor
- `[F10]`: maximizar o editor/resultado focado ou restaurar a divisão
- `[R]`: atualizar a página e o catálogo

Ao abrir a ferramenta sem um banco configurado, o Tuiminal mostra o cadastro de
conexão dentro da própria interface. É possível manter vários perfis e trocar
entre MySQL, PostgreSQL, SQLite e um servidor MCP compatível. O catálogo agrupa
tabelas e views por schema; cada tabela possui visões separadas de registros,
colunas, índices e schema. A visão `[4] Schema` reúne o DDL, constraints,
foreign keys de entrada e saída, regras de atualização/exclusão, índices e os
relacionamentos com outras tabelas.

O histórico de tabelas fica em uma faixa própria: os tabs `[<] ... [>]` aparecem
sobre uma linha e um divisor horizontal completo os separa das visões `[1]`
Dados, `[2]` Colunas e `[3]` Índices.

Em Dados, `[F]` ordena a coluna selecionada. Pressionar novamente alterna entre
crescente, decrescente e a ordem normal da tabela. `[S]` abre uma busca compacta
que procura o texto em todas as colunas, sem diferenciar maiúsculas, usando a
correspondência `%texto%`. `[Enter]` aplica, `[Ctrl+L]` limpa e `[Esc]` cancela.
A busca e a ordenação permanecem separadas por conexão e tabela durante a sessão.
Linhas podem ser marcadas pelo indicador `○`/`●`, por `[Space]` ou pelo mouse;
`[Ctrl+Space]` alterna a página visível e a seleção continua disponível ao mudar
de página. Com linhas marcadas, `[E]` aplica o novo valor da coluna atual a
todas elas, `[dd]` prepara uma exclusão por chave primária e `[U]` desfaz as
alterações preparadas daquele conjunto. Cada linha continua aparecendo como um
comando independente na revisão de `[Ctrl+S]`, e o lote aprovado é executado em
uma única transação. Tabelas ou resultados sem chave primária ainda podem ser
selecionados e exportados, mas não alterados em lote.

`[X]` abre a prévia de exportação das linhas marcadas. `[1]`, `[2]` e `[3]`
escolhem CSV, TSV e JSON; `[C/Enter]` copia pelo protocolo do terminal e `[S]`
salva em `tuiminal-exports/` dentro do diretório em que o Tuiminal foi aberto.
O mesmo fluxo está disponível em resultados SQL editáveis.

O editor SQL mostra números de linha em um gutter sincronizado com a rolagem e
mantém syntax highlight e autocomplete enquanto o conteúdo é editado. Um
arquivo pode conter várias consultas separadas por `;`: `[Ctrl+A]` identifica a
posição do cursor e executa somente o comando atual, mostrando, por exemplo,
`SQL 2/3` no cabeçalho. Strings, comentários e blocos dollar-quoted não quebram
essa identificação.

O workspace aceita até seis abas SQL simultâneas. Cada aba preserva seu próprio
texto, seleção, resultado, erro e estado de layout. `[Ctrl+↑]` e `[Ctrl+↓]`
ajustam a proporção entre editor e resultado; `[F10]` maximiza o painel focado e
o mesmo atalho restaura a divisão. Durante uma consulta, a ação principal muda
para `[Ctrl+X] Cancelar`. PostgreSQL e MySQL usam o cancelamento do driver; no
SQLite a execução fica em um processo isolado para que uma consulta pesada não
congele a interface e possa ser interrompida de verdade. Esse processo é
reutilizado por consultas próximas e liberado após ficar ocioso, reduzindo a
latência normal sem manter recursos desnecessários. A inspeção de schema também
carrega metadados independentes em paralelo e evita consultas repetidas por
índice ou relacionamento.
Depois de executar um `SELECT` simples sobre uma única tabela, o resultado usa
os mesmos controles da grade principal: `[Ctrl+A]` prepara uma linha nova,
`[Enter]`/`[E]` edita a célula, `[dd]` prepara a exclusão, `[U]` desfaz e
`[Ctrl+S]` abre a revisão. O inspetor lateral mostra todos os valores da linha
selecionada e também permite editá-los. Alterações continuam locais até a
segunda confirmação da revisão. Consultas com `JOIN`, CTE, união, subquery ou
sem a chave primária necessária permanecem somente leitura.

No formulário de conexão, `[Tab]` e `[Shift+Tab]` passam por drivers, inputs,
TLS, keychain, acesso e ações. `[Ctrl+D]` troca o driver, `[Ctrl+T]` alterna
TLS, `[Ctrl+K]` alterna o keychain, `[Ctrl+W]` alterna leitura/escrita,
`[Ctrl+R]` testa e `[Ctrl+S]` salva. Em um input, o primeiro `[Esc]` apenas
remove o foco; o seguinte volta para a lista de conexões.

Os metadados dos perfis ficam em
`~/.config/tuiminal/databases.json`, com permissão restrita. Senhas nunca são
gravadas nesse arquivo: quando solicitado, o Bun as salva no Keychain do macOS,
libsecret no Linux ou Credential Manager no Windows. `DATABASE_URL`,
`MYSQL_URL` e `POSTGRES_URL` também são detectadas automaticamente.

O MCP é uma integração opcional e nunca é conectado silenciosamente. Ele pode
ser adicionado pelo gerenciador de conexões. Para descobri-lo explicitamente ao
iniciar o Tuiminal, informe o executável em `TUIMINAL_MYSQL_MCP_COMMAND`:

```bash
TUIMINAL_MYSQL_MCP_COMMAND=/caminho/para/mysql-mcp bun run start
```

A aplicação não contém credenciais. Perfis começam em somente leitura e a
escrita precisa ser habilitada explicitamente. A interface adapta a quantidade
de registros e as barras de ação ao espaço disponível no terminal. Campos como
senhas, tokens, chaves, documentos, e-mails e telefones começam visíveis na
grade e nos resultados do editor SQL. `[V]` ativa o mascaramento; para voltar a
revelá-los, pressione `[V]` novamente para confirmar. O controle aparece em
vermelho somente enquanto os dados estão mascarados.

Em **Configurações → Dados sensíveis**, escolha os fragmentos de nomes de
colunas que serão mascarados. Eles podem ser separados por vírgula ou linha;
maiúsculas e separadores como `_`, `-`, ponto e espaço são ignorados na
comparação. `[Ctrl+L]` limpa, `[Ctrl+R]` restaura os termos padrão e `[Ctrl+S]`
salva. Uma lista vazia desativa explicitamente o mascaramento automático.

Cada consulta acionada pelo usuário entra em **Configurações → Histórico SQL**:
SQL do editor, leitura ao abrir/paginar/pesquisar uma tabela e cada `INSERT`,
`UPDATE` ou `DELETE` aprovado na revisão. Consultas internas de catálogo e schema
não poluem essa lista. Cada item mostra data e hora, duração, conexão, comando,
quantidade de linhas retornadas ou afetadas e status de sucesso/erro. O histórico
mantém as 100 leituras mais recentes e preserva `INSERT`, `UPDATE`, `DELETE`, DDL e
demais alterações por 184 dias — pelo menos seis meses — em
`~/.config/tuiminal/databases.json`. Use `[↑/↓]` ou `[J/K]` para navegar e
`[Enter]` para reexecutar o item selecionado. `[S]` oculta ou restaura todas as
leituras `SELECT` sem removê-las do histórico, deixando somente alterações e DDL
visíveis quando você estiver auditando mudanças. Consultas de
escrita feitas pela grade também mostram uma prévia rotulada dos valores de cada
parâmetro, como `$1 name = "Ana"` e `$2 id = 42`. Valores de colunas sensíveis são
persistidos somente como `<mascarado>` e os parâmetros executáveis originais não
são armazenados. Para operações executadas na sessão atual, `<mascarada [V]>`
indica que `[V]` pode revelar temporariamente o valor após uma segunda confirmação;
ao reiniciar o Tuiminal, somente a versão mascarada permanece. Essas alterações
continuam exigindo uma nova revisão e não podem ser reexecutadas diretamente; a
reexecução também fica desabilitada se a conexão original não existir mais ou
apontar para outro destino.

Edições de células são convertidas de acordo com o tipo da coluna. `[Ctrl+A]`
prepara uma linha nova, `[dd]` prepara uma exclusão, `[U]` desfaz e `[Ctrl+S]`
abre a revisão. Os comandos aprovados de uma conexão são executados em uma
única transação: se qualquer comando falhar, todos são revertidos. Favoritas
mostram um indicador quando o SQL foi alterado desde o último salvamento e
usam o idioma configurado para formatar data e hora.

## Git

A aba Git detecta automaticamente o repositório e o branch a partir do
diretório onde o Tuiminal foi iniciado. `[1] Base` abre o workspace local atual;
`[2] PR` abre o dashboard de Pull Requests. Base continua funcionando offline e
não inicia o GitHub CLI enquanto PR não for visitado.

PR requer GitHub CLI 2.40.0 ou mais recente e uma sessão autenticada. O Tuiminal
reutiliza a identidade do `gh`, não lê nem salva o token. Prepare uma vez com:

```bash
gh auth login --hostname github.com
tuiminal git /caminho/do/projeto
```

No primeiro acesso a `[2] PR`, o dashboard já consulta a conta autenticada: inclui
os repositórios de `@você`, das organizações às quais você pertence, colaborações
diretas externas e pesquisas pessoais como `author:@me` ou `review-requested:@me`
em qualquer repositório. Uma query ampla, como um texto livre, é limitada
automaticamente a esse escopo; ela não pesquisa o GitHub inteiro.

O perfil é salvo pela raiz canônica do projeto em
`~/.config/tuiminal/git-pr.yaml`: abrir outro projeto cria seções, filtros e
posição de prévia independentes. `[+]` cria uma seção e `[Ctrl+E]` gerencia as
seções. A lista de repositórios em `[Ctrl+E]` é opcional: vazia significa todos os
projetos da conta; ao adicionar `owner/repo`, todas as buscas daquele perfil ficam
restritas aos repositórios listados. Cada seção pode definir query, colunas, ordem
e limite.

- `[1]` / `[2]`: alternar entre Base e PR
- `[J/K]` ou `[↑/↓]`: navegar pelos PRs
- `[G/Home]` / `[Shift+G/End]`: ir ao primeiro / último PR carregado
- `[H/L]` ou `[←/→]`: mover o foco entre lista e prévia
- `[<]` / `[>]`: mudar a seção de PRs
- `[` / `]`: mudar a aba interna da prévia; no diff, mudar de hunk
- `[P]`: mostrar ou ocultar a prévia
- `[Shift+P]`: alternar a posição automática, direita ou abaixo, salva por projeto
- `[/]`: editar a query; `[Enter]` aplica temporariamente e `[Ctrl+S]` salva
- `[R]`: atualizar; `[N]`: carregar a próxima página disponível
- `[O]`: abrir no navegador; `[Y]` copia o número e `[Shift+Y]` copia a URL
- `[D]`: abrir diff de PR, arquivo ou commit; `[?]` mostra ações e indisponibilidades
- `[C]` / `[V]`: comentar / aprovar com comentário opcional
- `[A]` / `[Shift+A]`: adicionar / remover responsável
- `[W]`: iniciar ou parar o acompanhamento de CI
- `[Shift+C]`: preparar checkout no clone escolhido
- `[U]` / `[Shift+W]`: atualizar com a base / marcar draft como pronto
- `[M]` / `[X]` / `[Shift+X]`: preparar merge / fechar / reabrir
- `[Ctrl+A]` em Checks: revisar e autorizar uma execução elegível de fork

A prévia tem Visão geral, Checks, Atividade, Commits e Arquivos. Descrições em
Markdown são apresentadas como texto terminal seguro; imagens não são baixadas e
HTML não é executado. Commits permitem copiar o SHA completo, conexões paginadas
indicam quando há mais dados e o diff remoto é preso aos SHAs exibidos.

Toda escrita abre uma preparação com host, repositório, PR e commit. Nada é enviado
até `[Ctrl+S]`; a identidade e o head são revalidados e um timeout após o envio é
tratado como resultado incerto, sem repetição automática. Checkout bloqueia clone
errado, worktree suja e operações Git em andamento. Merge nunca acrescenta bypass
administrativo nem apaga branch. O acompanhamento de CI só começa por `[W]`, tem
limite de dez PRs e termina ao fechar o Tuiminal.

No diff remoto, `[H/L]` muda entre arquivos e documento, `[J/K]` navega, `[`/`]`
salta entre hunks, `[V]` alterna unificado/duas colunas/intralinha, `[Y]` copia o
caminho e `[Esc]` volta à prévia. Diffs acima de 2 MiB e descrições acima de
256 KiB são limitados com sinalização. Os números medidos localmente ficam em
[docs/benchmarks/git-pr.md](./docs/benchmarks/git-pr.md).

- `↑` / `↓`: navegar pelos arquivos alterados
- `Enter` sobre uma pasta: recolher ou expandir a pasta
- `Espaço`: adicionar ao stage ou remover do stage
- `a`: adicionar todos ao stage ou remover todos do stage
- `d`: voltar ao diff do arquivo selecionado
- `g`: expandir ou fechar a árvore de commits e branches
- `l`: visualizar o histórico com autor, data e estatísticas
- `n` / `p`: navegar pelos commits no histórico ou na árvore expandida
- `Enter`: abrir o diff completo do commit selecionado
- `v`: alternar o diff entre unificado, duas colunas e intralinha
- `←` / `→` ou `[` / `]`: rolar o diff
- `r`: atualizar o status do repositório

O preview usa números das linhas antigas e novas, fundos diferentes para
adições e remoções e contadores por diff. A lista de alterações é agrupada em
pastas e uma miniárvore Git permanece visível abaixo dela. O status também é
atualizado automaticamente enquanto a tab estiver ativa.

Para testar outro diretório sem mudar o local de execução:

```bash
TUIMINAL_WORKDIR=/caminho/do/projeto bun run start
```

## Runner

A aba Runner detecta comandos de JavaScript, Composer/PHP, Laravel, Symfony,
Python, Django, Go, Rust, Ruby/Rails, Maven, Gradle, .NET, Deno, Taskfile,
`Makefile`, `justfile` e Docker Compose no diretório aberto pelo Tuiminal. Cada
execução possui saída ao vivo, PID, duração e estado próprio, então é possível
manter mais de um processo rodando ao mesmo tempo. O Runner também importa os
processos de `mprocs.yaml`, `Procfile` e `Procfile.dev`.

Ao iniciar, o Runner sempre usa o diretório atual ou o caminho fornecido em
`tuiminal runner /caminho/do/projeto`; ele nunca troca silenciosamente para o
último projeto da sessão. Se o comando for executado dentro de uma subpasta de
um repositório Git, o Runner encontra sua raiz. Fora de um projeto, a tela pede
para entrar em um projeto ou escolher uma pasta antes de liberar os comandos.

O campo no topo aceita qualquer comando manual sem sintaxe especial. Depois de
digitar, a ação destacada `Salvar comando [Ctrl+S]` aparece logo abaixo do
campo. Ela abre um modal para informar o nome e escolher se o processo precisa
de PTY. PTY cria um terminal interativo e deve ser ativado para shells, REPLs,
menus e programas que pedem entrada; scripts e servidores que apenas mostram
logs normalmente devem deixá-lo desativado. Comandos salvos,
projetos abertos, modo de visualização, perfil de ambiente e histórico concluído
ficam em `~/.config/tuiminal/runner.json`. As abas e preferências de sessão são
isoladas pela raiz do projeto em que o Tuiminal foi iniciado: abrir outro
projeto começa com uma sessão própria, sem herdar as abas do anterior. Logs só
são persistidos quando
`persistLogs: true` for escolhido; a exportação manual cria um arquivo protegido
em `tuiminal-logs/` dentro do projeto.

Processos longos aparecem na aba `ATIVOS`, no mesmo espaço da lista de comandos.
Use `P` para alternar rapidamente entre as duas listas. Quando abrem servidores,
a mesma linha mostra a porta, como
`127.0.0.1:8000`; ela também aparece no respectivo painel do modo múltiplo. A
porta selecionada pode ser aberta no navegador, copiada ou enviada à aba HTTP.
Processos aceitam entrada por `stdin`; comandos marcados como interativos usam
um PTY real.

A última opção da lista, `[+] EXECUTAR EM OUTRO PROJETO…`, abre o seletor de
projetos. Pressione `+` para abrir essa mesma tela sem navegar até a opção;
enquanto um campo de texto estiver focado, `+` continua sendo texto. O seletor procura repositórios Git
no computador, permite filtrar por nome/caminho e inclui um navegador para
escolher manualmente qualquer pasta. Processos de projetos diferentes continuam
ativos ao trocar de diretório. Até quatro projetos abertos ficam disponíveis em
tabs no cabeçalho largo do Runner, alternadas pelos atalhos `1`, `2`, `3` e `4`.

O Runner sempre abre na visualização única. O modo múltiplo mantém a lista de
comandos visível e troca apenas o painel de log por processos ativos lado a lado,
com foco destacado e até três terminais visíveis. Em terminais estreitos o limite
é reduzido para manter os logs legíveis. Quando há mais processos, os controles
laterais mostram quantos estão ocultos em cada lado; cada clique ou uso de `<` e
`>` desliza a janela em apenas um terminal.

`Espaço` abre o modo explícito de seleção em grupo; nele, marque os comandos e
use a barra contextual para iniciar, interromper ou reiniciar todos juntos.
Esse grupo é apenas uma seleção de ações: os comandos podem
subir em paralelo e não existe uma ordem de dependências implícita. Para declarar
ambientes, autostart, reinício e health checks, crie
`.tuiminal/runner.yaml` no projeto:

```yaml
version: 1
profiles:
  desenvolvimento:
    envFile: .env.development
    env:
      LOG_LEVEL: debug

commands:
  api:
    command: bun run dev
    profile: desenvolvimento
    cwd: services/api
    interactive: true
    autostart: true
    restart: on-failure # never, on-failure ou always
    restartDelayMs: 1000
    maxRestarts: 5
    persistLogs: false
    health:
      type: http # http, port ou log
      url: http://127.0.0.1:3000/health
      timeoutMs: 30000
```

Um health check de porta usa `type: port`, `host` e `port`; um health check de
log usa `type: log` e `pattern` (expressão regular). O autostart só acontece
quando `autostart: true` aparece explicitamente no arquivo do Tuiminal. Arquivos
importados de outras ferramentas nunca ganham autostart implícito. Os perfis
declarados e arquivos `.env*` detectados podem ser alternados com `E`; as
variáveis do comando têm precedência sobre as do perfil.

- `/`: focar o campo de comando manual
- `Ctrl+S`: abrir o modal para nomear e salvar o comando manual
- `Delete`: remover o comando salvo selecionado
- `↑` / `↓`: selecionar um comando
- `Espaço`: entrar no modo de grupo e marcar ou desmarcar o comando
- `Esc`: sair do modo de grupo e limpar a seleção
- `Enter`: abrir o processo ativo ou executar quando ainda não estiver rodando
- `r`: iniciar uma nova execução, mesmo se o comando já estiver ativo
- `g` / `Shift+G` / `Shift+R`: iniciar, parar ou reiniciar o grupo
- `e`: alternar o perfil de ambiente
- `1` / `2` / `3` / `4`: alternar entre os projetos abertos no Runner
- `+`: abrir o seletor “Executar em outro projeto”, fora dos campos de texto
- `Ctrl+X`: fechar a aba do projeto atual; o botão `[Ctrl+X]` em cada aba fecha
  aquela aba com o mouse sem encerrar seus processos
- `p`: alternar entre as listas de comandos e processos ativos
- `m`: alternar entre visualização única e múltipla
- `a`: abrir ou recolher o menu de ações avançadas
- `j` / `k` ou `↑` / `↓`: navegar na lista e no histórico; quando o log está
  focado, rolar sua saída
- `l` ou `→`: passar da lista para o log
- `h` ou `←`: voltar do log ou histórico para a lista
- `k` ou `↑` no primeiro item do histórico: focar o log acima
- `j` ou `↓` no fim do log: focar o histórico aberto abaixo
- `s`: abrir o histórico já focado ou recolhê-lo
- `←` / `→`: mudar o terminal em foco no modo múltiplo
- `<` / `>`: deslizar os terminais visíveis uma posição no modo múltiplo
- `Shift+K`: encerrar o processo exibido
- `[` / `]`: alternar saídas anteriores e seguintes no modo único
- `i`: focar a entrada do processo
- `f`: filtrar o log por texto
- `v`: alternar entre todos os logs, stdout, stderr e mensagens do Runner
- `t`: exibir ou ocultar horários
- `y` / `x`: copiar ou exportar o log
- `o` / `u` / `h`: abrir a porta, copiar sua URL ou enviá-la ao cliente HTTP
- `c`: limpar a saída exibida
- `d`: redetectar os comandos do projeto

O rodapé mostra somente as ações do contexto atual. Operações menos frequentes
— ambiente, salvar comando, filtros, exportação, entrada do processo e portas —
ficam no menu `[A] Mais…`. O histórico inicia recolhido em uma linha, é aberto
com `S` e mostra até oito execuções por vez, preservando o restante do espaço
para os logs.

Por padrão, projetos Git são procurados dentro da pasta pessoal. Para limitar a
busca, defina `TUIMINAL_PROJECT_ROOTS` com uma lista de diretórios separada pelo
separador de caminhos do sistema.

Ao fechar o Tuiminal, todos os processos iniciados pelo Runner são encerrados.
A restauração recupera os projetos secundários e as preferências da sessão
correspondente ao projeto atual — não substitui o diretório usado para iniciar o
Tuiminal e não recupera processos
órfãos ou destacados da sessão anterior.

## HTTP

A aba HTTP funciona como um cliente de API compacto. Ela aceita URLs HTTP/HTTPS,
headers no formato `Nome: valor` e body textual ou JSON. Respostas JSON são
formatadas automaticamente e a interface mostra status, duração, tamanho,
headers e até 30 requisições do histórico da sessão.

- `/`: focar a URL
- `Enter` no campo de URL ou `s`: enviar a requisição
- `m` / `Shift+M`: avançar ou voltar entre os métodos HTTP
- `h`: editar os headers da requisição
- `b`: editar o body
- `v`: alternar o body e os headers da resposta
- `y`: abrir ou fechar o histórico
- `x`: cancelar uma requisição em andamento
- `Esc`: sair do editor atual

URLs sem protocolo recebem `http://` automaticamente. JSON recebe
`Content-Type: application/json` quando esse header não foi informado. Cada
requisição possui limite de 30 segundos, e respostas maiores que 1,5 MB são
truncadas para manter o terminal responsivo.

## Free Terminal

A aba Free Terminal é um multiplexador genérico de terminais. Cada sessão roda
em um PTY real do Bun e usa o emulador de terminal do OpenTUI, então cores,
cursor, atalhos, prompts interativos e interfaces de tela cheia continuam
funcionando. As sessões permanecem vivas ao trocar de tab.

Cada seção aceita até quatro terminais em uma grade `2 × 2`: no máximo dois
lado a lado e uma divisão para baixo. `+ Nova seção` cria outro workspace, `│+`
divide a linha ativa para o lado e `─+` cria a linha inferior. Os terminais são
separados somente por linhas simples, preservando o máximo de área para os PTYs.

O campo `CMD` é opcional. Vazio, os três botões abrem o shell padrão; preenchido,
eles executam qualquer comando disponível no `PATH`, como `bash`, `zsh`,
`codex`, `claude`, um banco interativo ou uma ferramenta interna. O modo foco
maximiza o terminal ativo e as setas trocam de seção. É possível manter até 12
terminais na mesma execução do Tuiminal.

Como as teclas digitadas dentro de um painel precisam chegar ao processo, os
comandos do multiplexador usam `Ctrl+B` como prefixo:

- `Ctrl+B`, depois `C`: criar uma nova seção
- `Ctrl+B`, depois `V`: dividir a linha ativa para o lado
- `Ctrl+B`, depois `S`: dividir a seção para baixo
- `Ctrl+B`, depois `N` / `P`: próxima sessão ou sessão anterior
- `Ctrl+B`, depois `1` / `2` / `3` / `4`: focar um terminal visível
- `Ctrl+B`, depois `M` ou `F`: alternar entre foco e seção completa
- `Ctrl+B`, depois `[` / `]`: seção anterior ou seguinte
- `Ctrl+B`, depois `R`: reiniciar a sessão em foco
- `Ctrl+B`, depois `X`: encerrar e fechar a sessão em foco
- `Ctrl+B`, depois `G`: liberar o terminal; em seguida `! @ # $ % ^` troca de tab
- `Ctrl+B` duas vezes: enviar `Ctrl+B` ao CLI aberto

Todos os controles também aceitam mouse: clique para focar um painel, trocar de
seção, criar splits, reiniciar/fechar terminais ou mudar o layout. A roda do
mouse rola o histórico quando o programa aberto não estiver usando eventos de
mouse.

As sessões são iniciadas no mesmo projeto aberto pelo Tuiminal. Ao fechar o
aplicativo, todos os processos criados pelo Free Terminal são encerrados.

## Validação

`bun run check` executa typecheck, formatação, lint, verificações de arquitetura e
manutenibilidade, testes de lógica/integração local e testes nativos de TUI. Para a
matriz pesada de Banco, use `bun run test:database:drivers`; ela usa Docker para
subir instâncias efêmeras oficiais de MySQL, MariaDB e PostgreSQL em portas aleatórias,
executa os testes de catálogo, leitura, busca, ordenação, schema, transações e
cancelamento e remove somente esses containers ao terminar. SQLite continua
coberto pela suíte local com um arquivo descartável.
