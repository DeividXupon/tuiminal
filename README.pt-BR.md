<div align="center">

# Tuiminal

[English](./README.md) · **Português (Brasil)**

### Um workspace completo de desenvolvimento dentro do terminal.

Banco de dados, GitHub, processos, APIs e terminais reais em uma única interface rápida e responsiva.

[![npm](https://img.shields.io/npm/v/tuiminal?label=npm&color=4B75FF)](https://www.npmjs.com/package/tuiminal)
[![status](https://img.shields.io/badge/status-pre--alpha-F7C873)](https://github.com/DeividXupon/tuiminal/releases)
[![license](https://img.shields.io/github/license/DeividXupon/tuiminal?color=72D5A3)](./LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-22%2B-5FA04E)](#instalação)

[Instalação](#instalação) · [Banco](#banco) · [Git](#git) · [Runner](#runner) · [HTTP](#http) · [Free Terminal](#free-terminal) · [Contribuir](#desenvolvimento)

</div>

> [!WARNING]
> O Tuiminal está em **alfa**. Já pode ser instalado e testado, mas atalhos, formatos e APIs ainda podem mudar entre versões.

O Tuiminal foi feito para manter o fluxo de trabalho no mesmo lugar. Em vez de alternar entre um cliente de banco, uma interface Git, vários terminais e um cliente HTTP, você abre o projeto uma vez e troca de ferramenta com `[Alt+1–5]`.

- Interface densa construída com Bun, OpenTUI, React e tuiparts.
- Funciona em qualquer diretório; Git, Runner e terminais usam o projeto informado ao CLI.
- Teclado e mouse são cidadãos de primeira classe.
- Layout moldurado com uma superfície contínua entre os painéis, ou layout compacto
  com seu canvas mais denso; sete paletas e seis idiomas.
- Processos e PTYs permanecem vivos enquanto você troca de tab.
- Dados sensíveis, escritas e operações remotas recebem proteções explícitas.

## Instalação

Instale a alfa pelo npm:

```bash
npm install --global tuiminal@alpha
tuiminal
```

Você **não precisa instalar o Bun** para usar o pacote publicado. O npm baixa o binário compatível com macOS, Linux glibc ou Windows, nas arquiteturas x64 e ARM64. Node.js 22 ou superior é usado pelo pequeno launcher do pacote.

Uma instalação nova abre **Instalar ferramentas oficiais**. Escolha Database, Git,
Runner, HTTP ou Free Terminal com `[↑/↓]` / `[J/K]` ou o mouse; pressione `[Enter]`
para instalar e novamente para abrir. Use `[Space]` e `[I]` para instalar várias.
Reabra a tela em `[,]` → **Ferramentas oficiais → Gerenciar ferramentas** ou com
`tuiminal features`. Só as ferramentas instaladas aparecem nas abas; Runner é o
padrão quando disponível. Os downloads têm versão e integridade verificadas e ficam
na pasta de dados do Tuiminal, fora dos seus projetos.

Ferramentas instaladas têm o botão **[D] Desinstalar**. Confirme com `[Y]` ou cancele
com `[Esc]`. A desinstalação encerra as sessões da ferramenta e descarta trabalho
não salvo, preservando projetos e configurações salvas. Você pode instalá-la novamente na mesma tela.

Para automatizar: `tuiminal features install git runner` ou `tuiminal features install all`.

Cada ferramenta tem uma descrição detalhada. Passe o mouse sobre uma linha ou
navegue com `[↑/↓/J/K]` para ver um ícone animado da ferramenta. Database preenche
um cilindro com dados; Runner inicia, avança e conclui uma execução; HTTP envia
uma requisição e recebe a resposta entre cliente e servidor. Git mostra uma
ramificação e Free Terminal exibe uma janela com cursor piscando. Os ícones se
adaptam a terminais menores. Durante o download, o fundo da linha se preenche
da esquerda para a direita conforme o progresso real.

![Instalação de ferramentas oficiais](./docs/media/installation.gif)


Para atualizar ou remover:

```bash
npm install --global tuiminal@alpha
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
tuiminal http
tuiminal terminal ./meu-projeto
```

Os aliases `database`/`db`, `run` e `term`/`tty` também são aceitos. No modo isolado, ferramentas ocultas não são inicializadas.

Somente esses comandos e aliases são tratados como ferramentas; outros nomes são caminhos de diretório.

`tuiminal --version` mostra a versão sem carregar configurações ou a interface. `tuiminal --help` mostra a ajuda no idioma configurado.

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

As ferramentas compartilham notificações compactas no canto superior direito: no máximo três ficam visíveis, sem tirar o foco do teclado. Cada cartão tem uma linha fina e colorida de tempo e uma animação curta para entrar e sair. Informações são azuis, sucessos são verdes e erros são vermelhos e permanecem um pouco mais. Passar o mouse sobre qualquer cartão pausa todas as notificações visíveis; os tempos continuam quando o ponteiro sai.

Para copiar texto, selecione arrastando com o botão esquerdo e clique com o botão
direito sobre a seleção. Isso também funciona nas ferramentas isoladas e nos modais.
A cópia usa o suporte OSC52 do terminal; se houver uma falha local, a seleção fica
disponível para tentar novamente. Campos de senha mascarados copiam apenas a máscara.

## Cinco ferramentas, um único fluxo

| Tab | Para quê serve |
| --- | --- |
| `[Alt+1]` Banco | Explorar dados e schema, escrever SQL e preparar alterações transacionais. |
| `[Alt+2]` Git | Revisar diffs locais, PRs, Issues e notificações do GitHub. |
| `[Alt+3]` Runner | Detectar comandos, executar serviços e acompanhar vários logs. |
| `[Alt+4]` HTTP | Criar, salvar, executar e automatizar requisições de API. |
| `[Alt+5]` Free Terminal | Abrir shells e qualquer CLI em seções compactas com até dois terminais. |

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
- **Editar grandes seleções:** preparação em lote com busca indexada das alterações existentes, preservando snapshots e chaves `BigInt` exatas antes da revisão.
- **Preservar decimais:** valores de `DECIMAL`, `NUMERIC` e `MONEY` mantêm os dígitos digitados até o envio ao banco, inclusive em notação científica. A precisão e a escala definidas no banco continuam valendo.
- **Escrever SQL:** manter até seis abas independentes, executar somente o comando sob o cursor, cancelar consultas e ajustar a divisão editor/resultado. Trocar o layout ou maximizar o resultado preserva o editor e seu rascunho.
- **Inspecionar e exportar:** visualizar todos os campos da linha e exportar as linhas marcadas em CSV, TSV ou JSON.
- **Proteger informações:** mascarar colunas sensíveis sob demanda e personalizar os termos usados para reconhecê-las.

### Fluxo de escrita

1. Abra uma tabela ou execute um `SELECT` simples editável.
2. Use `[Enter]`/`[E]` para editar, `[Ctrl+A]` para preparar uma linha ou `[dd]` para preparar exclusão.
3. Confira os indicadores de alterações locais na grade.
4. Pressione `[Ctrl+S]`, revise cada comando e confirme novamente.
5. O Tuiminal executa tudo em uma transação; se um comando falhar, o lote inteiro é revertido.

Confirmações rápidas repetidas não duplicam uma execução em andamento. Durante a transação, os comandos aprovados ficam bloqueados para alteração. A paginação acompanha a altura do terminal sem pular registros quando cabem mais de 50 linhas.

Resultados SQL só permitem edição quando selecionam diretamente colunas ou `*` de uma única tabela. Expressões, colunas renomeadas, agrupamentos e `DISTINCT` permanecem somente leitura; editar ou excluir também exige todas as colunas da chave primária no resultado.

No MySQL, campos não qualificados entre aspas duplas ficam somente leitura, pois podem ser textos literais; prefira identificadores entre crases. Colunas entre aspas duplas continuam editáveis no PostgreSQL e SQLite.

Perfis começam em **somente leitura**. Senhas não são gravadas no JSON de configuração: quando solicitado, são enviadas ao Keychain do macOS, libsecret no Linux ou Credential Manager no Windows. `DATABASE_URL`, `MYSQL_URL` e `POSTGRES_URL` podem ser descobertas sem virar perfis editáveis silenciosamente.

O campo de senha mantém a máscara também durante edição e redimensionamento com caracteres largos, como ideogramas e emojis.

Testes de conexão liberam o cliente temporário também quando falham. Nas URLs de ambiente, a senha codificada é decodificada uma única vez e uma URL sem senha não herda a anterior.

A edição de resultados SQL exige colunas diretas, sem renomeações ou duplicações, de uma única tabela identificável; expressões, agregações e consultas ambíguas ficam somente leitura. Alterar/excluir registros exige a chave primária completa no resultado.

Leituras nativas usam transações `READ ONLY` em PostgreSQL, proteção de transação e sessão em MySQL/MariaDB e um arquivo aberto em modo readonly no editor SQLite, inclusive quando o perfil permite escrita. Rotinas não reconhecidas, PRAGMAs de alteração e comandos com efeitos exigem escrita habilitada e confirmação. Use também credenciais com privilégios mínimos no servidor: o modo do aplicativo não é um sandbox para rotinas do banco. No MCP opcional, a restrição de escrita precisa ser aplicada pelo servidor MCP e pelas credenciais dele.

O histórico SQL salva apenas metadados das novas execuções. SQL completo, parâmetros e mensagens de erro detalhadas ficam na sessão, em um cache limitado a 200 entradas e 2 MB. Após encerrar o app ou atingir esse limite, ficam os metadados sem reexecução. Nas configurações do Banco, `[D]` abre a limpeza do conteúdo antigo e `[Y]` confirma: preserva metadados e favoritos, mas não pode ser desfeito e não remove backups. **Favoritos salvos explicitamente continuam gravando o SQL completo em disco**; evite salvar segredos neles.

A prévia de exportação processa só as primeiras linhas visíveis e mantém os valores no idioma original. Copiar ou salvar continua incluindo toda a seleção em CSV, TSV ou JSON.

### Atalhos essenciais do Banco

| Ação | Atalho |
| --- | --- |
| Gerenciar conexões | `[C]` |
| Dados, colunas, índices e schema | `[1]`, `[2]`, `[3]`, `[4]` |
| Navegar por linhas | `[J/K]` ou `[↑/↓]` |
| Abrir tabela ou editar célula | `[Enter]` |
| Buscar tabela / buscar nos dados | `[/]` / `[S]` |
| Ordenar coluna | `[O]` |
| Marcar linha / selecionar intervalo | `[Space]` / `[Alt+Space]` |
| Exportar seleção | `[X]` |
| Página anterior / seguinte | `[P]` / `[N]` |
| Tabela anterior / seguinte | `[A←]` / `[F→]` |
| Abrir workspace SQL | `[W]` |
| Executar comando SQL atual | `[Ctrl+A]` |
| Cancelar consulta | `[Ctrl+X]` |
| Nova aba / fechar aba SQL | `[Ctrl+N]` / `[Ctrl+W]` |
| Alternar abas SQL | `[Alt+←/→]` |
| Ajustar divisão / maximizar painel | `[Ctrl+↑/↓]` / `[F10]` |
| Revisar escritas preparadas | `[Ctrl+S]` |
| Atualizar dados e catálogo | `[R]` |

Configurações de conexões e metadados do histórico ficam em `~/.config/tuiminal/databases.json`, com até 100 leituras recentes e 184 dias de escritas. Novas entradas não persistem SQL, parâmetros ou diagnósticos; termos sensíveis ficam nas configurações globais.

<a id="git"></a>

## Git

<p align="center">
  <img src="https://github.com/DeividXupon/tuiminal/raw/refs/heads/main/docs/media/git.gif" alt="Demonstração da tab Git do Tuiminal" width="100%">
</p>

Uma área local no estilo lazygit e três dashboards remotos inspirados no gh-dash. Diffs funciona offline; PR, Issues e Inbox são carregados separadamente somente quando você os abre.

A navegação separa o projeto local da conta do GitHub:

```text
LOCAL · …/tuiminal      │ GITHUB · @conta
[1] [C] DIFFS           │ [2] PR  [3] ISSUES  [4] INBOX
```

O rótulo local acompanha o projeto selecionado. GitHub mostra a conta já carregada
pela aba remota ativa, ou `—` enquanto ela não estiver disponível; o cabeçalho não
faz consultas adicionais ao GitHub. Em terminais estreitos, os grupos ficam um abaixo
do outro. `[C]` alterna a área local entre Diffs e Comparar.

### `[1] Diffs`

- Agrupa arquivos modificados em uma árvore real. Cadeias sem ramificações mostram cada pasta em sua própria linha, sem recuo artificial entre elas, mas `[J/K]` trata toda a cadeia como um único bloco navegável.
- Distingue staged, unstaged e untracked com o status de dois caracteres do Git.
- Exibe preview unificado, lado a lado ou intralinha com syntax highlight e números antigos/novos. A comparação por caractere só é calculada ao usar a visualização intralinha e é reutilizada enquanto o documento não muda.
- Mantém um pequeno grafo de commits sob a árvore; `[G]` expande o grafo e `[O]` abre um histórico no formato do `git log`, com o grafo colorido atravessando todo o bloco do commit. Cada bloco mostra hash, branches/tags, pais de merge, autor e e-mail, data relativa, quantidade de arquivos, estatísticas `+/-`, assunto e corpo da mensagem.
- `[Space]` aplica ou remove stage do arquivo selecionado ou de todos os descendentes da pasta selecionada, inclusive nomes com `*`, `?`, colchetes ou `:`. `[A]` adiciona em cadeia os arquivos da pasta selecionada ou alterna todos quando um arquivo está selecionado; a cor muda imediatamente, novas ações de stage podem ser feitas em sequência e a confirmação consulta somente o status. O preview permanece montado e é reconciliado silenciosamente, sem loader nem reiniciar a rolagem; o grafo é atualizado em segundo plano apenas quando as refs mudam.
- `[Enter]` em um arquivo da árvore abre e foca seu diff. Com um arquivo rastreado e textual em foco, `[S]` abre o stage parcial e força a visualização unificada. “FORA DO STAGE” e “NO STAGE” ficam lado a lado e incluem também os hunks já adicionados ao index, permitindo retirá-los. `[S]` alterna hunk/linha sem perder transferências pendentes nem o syntax highlight, `[H/L/←/→]` atravessa os painéis, `[J/K]` navega e `[Space]` transfere o item; a rolagem mantém o alvo inteiro acima das ações mesmo quando os hunks têm alturas diferentes. Enquanto esse modo está aberto, o terminal Git fica oculto para ceder espaço ao código, `[Tab]` alterna apenas entre os dois painéis e os atalhos não levam à árvore ou ao terminal; `[Enter]` e `[Esc]` aplicam o estado exibido e saem. O hunk ativo recebe uma linha azul em toda a lateral esquerda, e uma alteração do arquivo durante a seleção faz a operação ser recusada com segurança.
- No diff focado, `[Shift+H/L]` ou `[Shift+←/→]` rolam lateralmente até o último caractere, com controles clicáveis no canto inferior direito. Números, sinais e fundos das alterações permanecem fixos; em duas colunas, o código antigo e o novo rolam juntos sem esconder nenhum painel. A navegação vertical preserva a posição horizontal; sair do diff volta à esquerda.
- O cabeçalho de projeto/branch mantém seu espaço ao percorrer a árvore com as setas, sem ser encoberto quando um diff maior termina de carregar.
- `[D]` descarta o arquivo ou toda a pasta selecionada depois de uma confirmação explícita; alterações rastreadas são restauradas e arquivos novos são removidos.
- Um terminal Git sob o diff mantém sete linhas visíveis e até 2.000 linhas de histórico, preservando a saída real dos comandos em vez de resumi-la. `[T]` leva o foco a ele para executar comandos manuais, `[↑/↓]` e o mouse rolam a saída, e `[F10]` maximiza/restaura o terminal dentro do painel de preview; o prefixo `git` é fixo e não há composição de comando por shell. Enquanto você digita, o autocomplete sugere comandos, opções, branches locais/remotas já conhecidas, tags, remotes e arquivos alterados; use `[Ctrl+N/P]` para navegar, `[Ctrl+Y]` para aplicar e `[Esc]` para fechar as sugestões.
- `[C]` alterna para **Comparar**, onde duas refs conhecidas são comparadas por `base...comparada` sem checkout e sem incluir mudanças locais.
- `[Ctrl+P]` escolhe outro repositório e branch local sem alterar o escopo de PR, Issues ou Inbox. No terminal, a tecla pertence ao autocomplete; em modais ou no stage parcial, ela não abre a configuração por cima do contexto atual.
- O tutorial do Git percorre os dois modos locais da aba `[1]` com dados inteiramente simulados. Primeiro ensina Diffs — cabeçalho, árvore de alterações, mini árvore de commits, diff, ações, terminal, navegação, `[Ctrl+P]`, `[Space]`, `[G]`, `[O]`, `[V]`, `[S]` e `[D]`. Depois entra visualmente em `[C] Comparar`, abre a configuração local e os seletores fictícios de branch base e comparada, explica o intervalo `base...comparada`, mostra o resumo somente de commits, a árvore agrupada, o diff selecionado, as três visualizações e a volta por `[C]` ou `[Esc]`. Cada etapa que muda a tela mostra o próprio resultado; o tutorial não procura projetos, não executa Git, não busca refs e não acessa GitHub.

Os três dashboards remotos removem linhas vazias no modo moldurado. Em telas largas,
PR e Issues colocam seções e ações na mesma linha; telas menores empilham esses
controles. O modo compacto mantém sua geometria atual.

### `[2] PR`

- `[Ctrl+N]` abre o formulário de criação com seletores pesquisáveis de repositório e das branches remotas base e comparada, título, descrição em Markdown e opção draft. A base começa com a branch padrão do repositório selecionado e pode ser trocada. O título começa com a primeira linha do último commit da branch comparada e continua editável. O Tuiminal verifica as duas branches escolhidas antes de um único envio à API do GitHub; ele não faz push da branch local.
- Começa com **My PRs**, **Review requested**, **All**, **Open** e **Closed**; os três últimos mostram todos os PRs não arquivados, somente os abertos ou somente os fechados dentro do escopo atual.
- Lista estado, repositório, revisão, CI, autor, responsáveis, comentários, labels e tamanho do diff.
- O símbolo do estado fica verde para aberto, roxo para mesclado, cinza para draft e vermelho para fechado.
- A prévia alterna entre visão geral, checks, atividade, commits e arquivos.
- Parar o acompanhamento de CI ou fechar sua tela cancela a consulta ativa; respostas antigas não notificam nem interrompem um novo acompanhamento.
- Na Atividade, `[J/K]` seleciona comentários, `[E]` abre as cinco reações rápidas (👍 ❤️ 🎉 😄 👀) e `[Enter]` responde com referência ao comentário original; respostas aparecem agrupadas sob o comentário-pai, e um comentário que já possui reação mostra `[E] Nova reação`. `[Shift+E]` reage ao próprio PR.
- O diff remoto abre dentro do Tuiminal e mantém a fila preservada ao voltar.
- Busca e seções usam qualifiers do GitHub com autocomplete para `repo:`, `author:`, `review-requested:` e outros filtros.
- Comentários, review, merge e demais escritas usam preparação, reautenticação, releitura do estado remoto e confirmação antes da execução.

### `[3] Issues`

- `[Ctrl+N]` abre o formulário de criação com seletor pesquisável de repositório, título e descrição em Markdown. Os dois formulários preservam o rascunho em memória até o envio e exigem `[Ctrl+S]` para criar.
- Começa com **My Issues**, **All**, **Open** e **Closed**; os três últimos mostram todas as issues não arquivadas, somente as abertas ou somente as fechadas dentro do escopo atual.
- Combina uma lista densa de duas linhas com visão geral e atividade da issue.
- O símbolo do estado fica verde para aberta e vermelho para fechada.
- Na Atividade, `[J/K]` seleciona comentários, `[E]` reage com 👍 ❤️ 🎉 😄 ou 👀 e `[Enter]` responde; respostas aparecem agrupadas sob o comentário-pai, e um comentário que já possui reação mostra `[E] Nova reação`. `[Shift+E]` reage à própria issue.
- Permite comentar, atribuir/remover responsáveis, editar labels, criar branch com checkout, fechar e reabrir.
- A busca sempre fica limitada a issues não arquivadas e nunca vira acidentalmente uma pesquisa global do GitHub.

### `[4] Inbox`

- Reúne Inbox, revisões solicitadas, itens atribuídos, menções e itens salvos localmente.
- As bolinhas preenchida e vazia continuam indicando não lida e lida. Em PRs e issues, elas também recebem a cor do estado, mostrado em texto; outros assuntos ou estados indisponíveis ficam neutros.
- Marcar como lida é explícito; concluir e cancelar inscrição sempre pedem confirmação.
- A atualização automática preserva os dados visíveis quando a rede falha.

PR e Issues usam o repositório do `origin` quando ele é reconhecido. Fora de um repositório, o escopo padrão é a conta autenticada — organizações e repositórios externos incluídos de forma explícita — em vez de uma busca aberta em todo o GitHub. As áreas remotas exigem o [GitHub CLI](https://cli.github.com/) 2.40.0 ou mais recente. Quando `gh` não está disponível ou precisa ser atualizado, PR, Issues e Inbox explicam sua função, mostram o comando oficial detectado, oferecem `[C]` para copiá-lo e um mini terminal interativo focado com `[Enter]` ou mouse. O Tuiminal abre somente o shell: o usuário cola e executa o comando, e a versão é detectada automaticamente; se o shell encerrar, `[Enter]` abre outro. A falta de autenticação abre o mesmo passo a passo para `gh auth login --hostname <host> --web`; o login e o token permanecem sob responsabilidade do `gh`/GitHub, e a tela recarrega ao detectar a conta.

Com a aba PR ou Issues ativa, a lista visível e os detalhes selecionados são atualizados aproximadamente a cada 30 segundos. Assim, issues e comentários criados no GitHub aparecem sem reabrir a aba. `[R]` consulta ambos imediatamente. O intervalo configurado mais longo continua atualizando todas as seções até a profundidade de páginas já carregada.

As chamadas automáticas ao `gh` têm limite de tempo e aguardam o encerramento do
processo ao cancelar. Se uma escrita em PR/Issue ficar sem confirmação — por
timeout, cancelamento, limite de saída ou entrada incompleta — ela não é reenviada
automaticamente. Confira o estado remoto antes de tentar novamente.

Nos detalhes de PRs e Issues, trocar de item libera a paginação imediatamente;
respostas antigas não substituem uma atualização mais recente. Carregar mais
repetidamente no mesmo lote de eventos inicia uma única consulta. Alterações em
comentários de um PR invalidam seus detalhes em cache mesmo sem um commit novo.
Na aba Checks, execuções e erros de outro PR desaparecem assim que a seleção
muda; respostas atrasadas não reaparecem no PR atual. PR, Issues e Inbox reutilizam o
texto das linhas ao navegar, preservando atualizações de idioma, cores e dados.

As configurações Git aparecem como cinco itens abertos por `[,]`: Diffs fica em
**GIT**, enquanto Pull Requests, Issues, Repositórios e Navegador ficam em
**GITHUB**. O item focado é renderizado imediatamente no painel de detalhes, e `[Enter]` leva
o foco do teclado para esse painel. Projetos locais e repositórios remotos aparecem
assim que cada busca termina, sem
esperar a outra. Sair ou recarregar o contexto Git cancela a consulta remota anterior.
Os seletores de projeto/branch e os editores de seções de PR/Issues substituem o
conteúdo desse mesmo painel e voltam com `[Esc]`; nenhum segundo modal de
configuração é aberto. O autocomplete de queries processa só os candidatos
necessários para preencher as sugestões visíveis.

No Git, abra `[,]` → Contexto → Navegador para escolher onde `[O]` abre PRs,
Issues, notificações do Inbox e execuções de workflow. O padrão usa o navegador
do sistema. Browsh e Carbonyl abrem em um terminal integrado ao Git, que pode
ser fechado com `[Ctrl+Q]`. `terminal-browser` abre um painel separado do terminal.
Instale o comando escolhido no `PATH` antes de abrir um link. A escolha vale para
todo o Git e fica em `~/.config/tuiminal/git-browser.json`.

Nos seletores de projeto e branch local, pressionar `[Enter]` repetidamente não
repete uma seleção em andamento. Sair do seletor por `[Esc]` ou pelo botão impede
que sua resposta atrasada feche outro seletor aberto depois. Sair não cancela nem
desfaz um comando Git que já foi iniciado.

Na busca de PRs e Issues, texto entre aspas permanece literal: mencionar `repo:`
ou `author:@me` dentro de uma frase não remove o filtro da conta. Valores como
`label:"help wanted"` preservam os espaços, e aspas abertas precisam ser fechadas
antes de enviar a consulta. Aplicar ou salvar uma busca incompleta mostra o aviso
no próprio painel de contexto, mantendo o texto e o foco para você corrigir.

### Atalhos essenciais do Git

| Ação | Atalho |
| --- | --- |
| Abrir Diffs, PR, Issues ou Inbox | `[1]`, `[2]`, `[3]`, `[4]` |
| Alternar Diffs / Comparar | `[C]` |
| Navegar na lista | `[J/K]` ou `[↑/↓]` |
| Alternar foco entre árvore, preview e terminal Git | `[Tab]`; `[H/L]` ou `[←/→]` entre árvore e preview |
| Rolar lateralmente no diff focado | `[Shift+H/L]` ou `[Shift+←/→]` |
| Mudar seção | `[A←]` / `[F→]` |
| Mudar aba interna do preview | `[Z←]` / `[V→]` |
| Abrir diff remoto | `[D]` |
| Abrir ações remotas | `[?]` |
| Abrir PR, Issue ou notificação selecionada | `[O]` |
| Criar PR ou issue na respectiva aba | `[Ctrl+N]`, depois `[Ctrl+S]` |
| Stage do arquivo / pasta ou todos | `[Space]` / `[A]` |
| Stage parcial por hunk ou linha no diff focado | `[S]`; depois `[S]`, `[H/L/←/→]`, `[J/K]`, `[Space]` e `[Enter]` |
| Descartar arquivo/pasta com confirmação | `[D]` |
| Focar terminal Git | `[T]` |
| Abrir histórico / grafo local | `[O]` / `[G]` |
| Mudar visualização do diff | `[V]` |
| Alterar projeto/branch de Diffs | `[Ctrl+P]` |
| Editar query remota | `[/]` |

O escopo remoto é salvo nos perfis de Git. A escolha local de Diffs fica separada em `~/.config/tuiminal/git-diffs.json`; o navegador fica em `~/.config/tuiminal/git-browser.json`; itens salvos do Inbox ficam em `~/.config/tuiminal/git-inbox.json` com permissão `0600`.

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
- **Agir em grupo:** marcar comandos e iniciar, parar ou reiniciar todos juntos; grupos simples executam em paralelo.
- **Ordenar comandos e serviços:** dependências aguardam conclusão com sucesso ou início com health check. Ciclos e referências inexistentes são rejeitados antes de executar; falha ou cancelamento bloqueia dependentes pendentes.
- **Salvar fluxos por projeto:** `[Ctrl+Y]` abre o arquivo YAML de configuração dentro do terminal. Crie fluxos nomeados com etapas sequenciais e paralelas e execute, pare ou reinicie pela TUI.
- **Editar comandos localmente:** configure comando literal, diretório, ambiente/perfil, PTY, reinício e health check, inclusive para comandos detectados. O editor mostra documentação, validação e sugestões por teclado e mouse sem alterar arquivos do projeto.
- **Trocar de projeto:** `[N]` abre outro repositório ou diretório sem interromper processos atuais. Até quatro projetos ficam em tabs locais `[1]–[4]`.
- **Usar portas detectadas:** abrir a URL, copiá-la ou enviar a requisição diretamente para a tab HTTP.

Os logs são atualizados em lotes e retêm até 1.200 entradas, com limites de tamanho por entrada e por processo. Limpar o log também descarta a saída pendente de exibição; ao encerrar, as últimas linhas são preservadas na tela.

Single e Multi preservam o idioma original da saída dos programas; somente mensagens do Tuiminal são traduzidas. A detecção de portas aguarda cada sondagem terminar antes de iniciar a seguinte e cancela apenas seu próprio auxiliar ao sair do contexto.

A busca de projetos evita repetir pastas sobrepostas e faz até 16 leituras simultâneas, respeitando o limite de 300 projetos e sete níveis. Os comandos detectados usam os caminhos do projeto selecionado, e arquivos Deno JSONC preservam o texto das tarefas mesmo quando contêm marcadores de comentário.

Arquivos `.tuiminal/runner.yaml`, `mprocs.yaml`, `Procfile`, `Procfile.dev`, `Taskfile`, `Makefile` e outros formatos reconhecidos alimentam a descoberta. Somente `autostart: true` explícito na configuração do Tuiminal, incluindo comandos e fluxos salvos localmente, pode solicitar início automático. Na primeira vez, o Runner mostra o projeto, os comandos, diretórios, perfil e nomes das variáveis para aprovação; a confiança é local e uma mudança material na configuração exige nova confirmação. `mprocs` e `Procfile` nunca recebem início implícito.

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

Edite `commands`, `flows` e `profiles` em YAML, com cores de sintaxe e ajuda contextual. Uma lista de recomendações somente para consulta acompanha o cursor durante a digitação ou ao usar as setas, mostra opções do bloco YAML atual e descreve a opção selecionada ao lado da lista. Depois de `flows:` e `[Enter]`, ela mostra um exemplo de ID de fluxo (`dev:`); ao digitar outro ID, indica os dois-pontos necessários e, dentro do fluxo, oferece campos como `label` e `stages`. A mesma orientação aparece para IDs de comandos e perfis e nomes de variáveis de ambiente. Erros de digitação próximos mostram alternativas prováveis desse bloco; textos sem relação fecham a lista de recomendações. Use `[Ctrl+J/K]` ou um clique para consultar as opções; digite a chave ou o valor desejado. `[Enter]` recua a próxima linha conforme mapas, listas e blocos literais de comando; `[Tab]` insere dois espaços. `[Esc]` fecha as recomendações e depois volta ao gerenciamento de comandos e fluxos. Dependências usam `dependsOn` com `commandId` e `condition`; etapas usam `commandIds` e `waitFor`. `started` aguarda o health check configurado. `[Ctrl+S]` valida e salva. Veja exemplos completos na [especificação do Runner](docs/design/runner.md).

### Atalhos essenciais do Runner

| Ação | Atalho |
| --- | --- |
| Executar ou abrir processo existente | `[Enter]` |
| Iniciar outra instância | `[R]` |
| Focar comando manual / salvar | `[/]` / `[Ctrl+S]` |
| Editor YAML | `[Ctrl+Y]` |
| Novo comando / fluxo (lista de gerenciamento) | `[Ctrl+N]` / `[Ctrl+F]` |
| Executar / parar / reiniciar fluxo selecionado | `[Ctrl+R]` / `[Ctrl+K]` / `[Ctrl+T]` |
| Nova linha e recuo YAML / sugestões / salvar | `[Enter]` e `[Tab]` / `[Ctrl+Space]` / `[Ctrl+S]` |
| Consultar recomendações YAML | `[Ctrl+J/K]` |
| Comandos / processos ativos | `[P]` |
| Visualização única / múltipla | `[M]` |
| Grupo anterior / seguinte no modo múltiplo | `[A←]` / `[F→]` |
| Selecionar grupo | `[Space]` |
| Iniciar / parar / reiniciar grupo | `[G]` / `[Shift+G]` / `[Shift+R]` |
| Lista → log / log → lista | `[L/→]` / `[H/←]` |
| Abrir ou recolher histórico | `[S]` |
| Parar processo atual | `[Shift+K]` |
| Abrir menu de ações | `[A]` (único) / `[Shift+A]` (múltiplo) |
| Abrir outro projeto | `[N]` |
| Alternar projetos do Runner | `[1]`–`[4]` |
| Fechar tab de projeto sem parar processos | `[Ctrl+X]` |

O editor YAML salva em `~/.config/tuiminal/runner/<hash-do-projeto>/runner.yaml`, sem alterar arquivos do projeto. Comandos e fluxos existentes são incluídos no primeiro salvamento. `runner.json` mantém sessões, histórico e definições antigas dos projetos que ainda não têm YAML. Logs só são persistidos por opt-in ou exportação para `tuiminal-logs/`. Ao sair do Tuiminal, ele encerra somente os processos que iniciou.

<a id="http"></a>

## HTTP

<p align="center">
  <img src="https://github.com/DeividXupon/tuiminal/raw/refs/heads/main/docs/media/http.gif" alt="Demonstração da tab HTTP do Tuiminal" width="100%">
</p>

Um cliente de API compacto com documentos, coleção, builder, resposta e automação. Os dados da interface HTTP ficam em um único diretório global (`$XDG_DATA_HOME/tuiminal/http` ou `~/.local/share/tuiminal/http`), independentemente do projeto aberto. O layout passa de três colunas para split ou painel único conforme o espaço, sem perder drafts, cursor, resposta ou foco.

### O que você pode fazer

- **Montar requests:** método, URL, query params, headers, JSON/texto/XML, form URL encoded, multipart, arquivo e autenticação Bearer, Basic ou API Key.
- **Inspecionar respostas:** status, duração, tamanho, headers, timing, Pretty/Raw, busca, JSONPath, cópia, salvamento e comparação. JSON válido recebe formatação e cores, com controles da árvore em uma coluna separada e destaque na linha inteira do bloco selecionado. No response focado, `[↑/↓]` ou `[J/K]` percorrem blocos, `[←/→]` recolhem/expandem e `[Enter]` alterna o bloco atual. O Pretty JSON navegável mantém uma linha por entrada para posicionar a seleção corretamente; Wrap continua disponível em Raw e nas outras visualizações da resposta.
- **Controlar o espaço:** request e response começam em `50/50`; `[Ctrl+↑/↓]` e o drag handle usam a mesma proporção por documento, limitada entre 25% e 70%.
- **Salvar coleções:** importar e salvar `.http`/`.rest` interoperáveis no diretório global do HTTP sem regravar silenciosamente blocos que o Tuiminal não entende.
- **Organizar coleções com teclado ou mouse:** percorrer a árvore com `[↑/↓]` ou `[J/K]`, recolher e expandir com `[←/→]` e abrir requests com `[Enter]`. Criar pastas, coleções `.http` e requests; renomear ou excluir os itens selecionados. Pastas e coleções vazias continuam visíveis. A exclusão exige confirmação; requests abertos com alterações ou em execução precisam ser resolvidos antes.
- **Importar:** informe um caminho completo ou iniciado por `~/` para um arquivo Postman v2.0/v2.1 ou OpenAPI 3.0/3.1, use `[↑/↓]` e `[Tab]` para completá-lo, ou solte um arquivo na área de importação quando o terminal colar seu caminho. O Tuiminal identifica o formato pelo conteúdo e o mostra na prévia com os avisos de conversão; o `.http` resultante só é salvo na biblioteca global do HTTP após a confirmação, independentemente do projeto aberto.
- **Conectar uma conta Postman:** execute `tuiminal postman login` para informar a chave de API sem eco no terminal, ou envie a chave para `tuiminal postman login --api-key-stdin`; acrescente `--region eu` para uma conta da região europeia. Com a conta conectada, o HTTP abre com dois cartões, Local e Postman; `[Ctrl+G]` permite trocar de origem. No modo Postman, escolha um workspace para carregar todas as coleções, inicialmente com todas as coleções e pastas fechadas; `[E]` seleciona um ambiente opcional. A árvore à esquerda mostra o nome do workspace sobre as coleções, omite a pasta interna `postman/` e usa as cores dos métodos do Postman. `[?]` mostra as ações e os atalhos da coleção. A chave e os valores das variáveis importadas ficam no gerenciador de credenciais do sistema. O Tuiminal cria arquivos `.http` vinculados para as novas coleções no diretório global do HTTP e ambientes privados selecionáveis quando há variáveis; não altera o projeto aberto. `[Shift+N]` cria uma coleção na origem escolhida; o Postman usa o workspace ativo ou pede um antes da seleção. Criar, renomear, duplicar e excluir requests vinculadas; criar, renomear e excluir coleções e pastas aninhadas; essas ações atualizam o Postman e a cópia local. `[Ctrl+S]` envia alterações de uma request vinculada; para uma request nova, permite escolher coleção ou pasta de destino e a cria no Postman. `[Ctrl+P] Postman` tenta novamente um envio pendente. Conflitos e falhas remotas são informados. Mover requests entre arquivos ainda não está disponível no Postman. Edições dos ambientes importados permanecem locais. Valores do Vault indisponíveis pela API, scripts, respostas salvas e autenticação não suportada são avisados ou omitidos. Veja [acesso à conta Postman](./docs/design/postman-account.md) para os limites exatos.
- **Automatizar:** assertions de status/header/body/JSONPath, dependências entre requests e extração de variáveis públicas ou voláteis.
- **Executar coleções:** resolver dependências em ordem topológica, usar dataset JSON/CSV, limitar concorrência e emitir relatórios text, JSON ou JUnit. Selecionar um request funciona também quando há nomes iguais. Reabrir o executor ou mudar seu alvo cancela a execução anterior; resultados atrasados não substituem a nova execução.
- **Trabalhar com ambientes:** `[E]` lista os ambientes selecionáveis; `[N]` cria um, `[E]` edita ou renomeia o selecionado, e `[D]` o exclui após confirmação. `[G]` abre `Globals`, sempre ativo e com nome fixo. Cada formulário tem nome e tabela de variável/valor; `[/]` escolhe um bloco, `[↑/↓]` move a barra de foco e `[Enter]` abre o bloco. As linhas alternam o fundo, e a célula selecionada tem destaque próprio. `[Tab]` avança pelos campos; tabelas preenchidas aceitam setas ou `[H/J/K/L]`, `[Enter]` para editar e `[Esc]` em camadas para sair. Os valores ficam visíveis durante a edição e são sempre salvos no gerenciador de credenciais do sistema; o arquivo privado de ambientes contém somente referências opacas para valores novos ou editados. O modal com borda assume o foco enquanto está aberto. Os defaults do workspace não são mais aplicados.
- **Editar tabelas da requisição:** em Query/Path Params, `[J/K]` ou `[↑/↓]` escolhe o bloco. `[Enter]` abre a primeira célula de uma tabela vazia ou a navegação pelas linhas existentes. Setas ou `[H/J/K/L]` alcançam a bolinha de ativação, os campos Nome/Valor e o `[×]`; `[Enter]` aciona o controle selecionado, inclusive excluindo pelo `[×]`. `[Space]` ativa ou desativa a linha, e `[Tab]` avança pelos inputs até uma linha de rascunho, criada de fato quando você digita. `[Esc]` volta do input para a tabela e depois para o bloco. Headers, form URL encoded e Multipart seguem o mesmo fluxo; Multipart também permite selecionar o controle texto/arquivo. `[N]` não adiciona mais linhas nessas tabelas.
- **Escrever URLs rapidamente:** digite `{` na URL para ver os nomes das variáveis disponíveis e use `[Tab]` para completar `{{nome}}`. Pares de query como `?manga=2` aparecem em Params e podem ser editados ali sem envio duplicado.
- **Controlar transporte:** timeout, redirects, cookie jar, proxy HTTP/HTTPS e TLS. O jar valida domínios pela Public Suffix List, impõe limites e fica isolado por ambiente e diretório da coleção; `[C]` pode desativar tanto leitura quanto escrita de cookies por request. Desabilitar verificação TLS é explícito, visível em vermelho e exige aprovação por destino.
- **Revisar redirects sensíveis:** antes de enviar um corpo ou URL com valores privados para outra origem, ou trocar HTTPS por HTTP, o envio pausa para sua autorização. `[Y]` continua somente aquele salto; `[Esc]` recusa. O destino e os riscos aparecem na confirmação, com valores privados conhecidos mascarados. Cancelar não desfaz uma requisição que o servidor anterior já recebeu.
- **Tratar respostas externas com cautela:** `[O]` abre somente imagens raster allowlisted quando MIME e assinatura conferem. SVG, PDF, binários genéricos e conteúdo disfarçado ficam bloqueados no handler do sistema, mas ainda podem ser salvos explicitamente. O download completo reenvia apenas GET, tem teto de 256 MB e remove arquivos parciais em falhas. Acionamentos repetidos não duplicam o download; fechar o documento que o iniciou cancela a operação. O arquivo só é publicado depois da gravação completa, sem substituir um destino existente.

### Atalhos essenciais do HTTP

| Ação | Atalho |
| --- | --- |
| Alternar rota, coleção, requisição e resposta | `[Tab]` / `[Shift+Tab]` ou `[H/L]` |
| Focar URL / enviar / cancelar | `[/]` / `[S]` ou `[Enter]` / `[X]` |
| Método anterior / seguinte | `[Shift+M]` / `[M]` |
| Ciclar Params, headers, body, auth e mais com a requisição focada | `[A←]` / `[F→]` |
| Ciclar opções internas de Body, Auth ou Mais | `[Z←]` / `[V→]` |
| Alternar Query Params / Path Params | `[J/K]` ou `[↑/↓]` |
| Entrar numa tabela da requisição / editar a célula selecionada | `[Enter]` |
| Percorrer controles / inputs da tabela | `[H/J/K/L]` ou setas / `[Tab]` |
| Ativar/desativar a linha / excluir pelo `[×]` selecionado | `[Space]` / `[Enter]` |
| Navegar / recolher / expandir JSON | `[↑/↓]` ou `[J/K]` / `[←/→]` / `[Enter]` |
| Abrir ambientes | `[E]` |
| Alternar visualização principal / aba interna da resposta | `[A←]` / `[F→]` · `[Z←]` / `[V→]` |
| Abrir coleção / histórico | `[C]` / `[Y]` |
| Navegar entre itens da coleção / primeiro ou último | `[↑/↓]` ou `[J/K]` / `[Home/End]` |
| Recolher ou expandir / abrir request selecionado | `[←/→]` / `[Enter]` |
| Novo request / coleção / pasta no painel da coleção | `[N]` / `[Shift+N]` / `[P]` |
| Renomear / excluir item selecionado | `[E]` / `[D]`, depois `[Enter]` para confirmar a exclusão |
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
tuiminal postman workspaces
tuiminal postman collections <workspace-id>
tuiminal postman environments <workspace-id>
tuiminal postman pull <workspace-id> <collection-id> --environment <environment-id>
tuiminal postman push postman/<file>.http "<nome-da-request>"
```

No modo sem interface, redirects que transportam corpo/URL privada exigem
`--allow-private-redirect-to https://destino.example`; downgrade exige
`--allow-http-redirect-to http://destino.example`. As flags aceitam somente uma
origem exata (protocolo, host e porta), podem ser repetidas para outros destinos e
valem apenas para o comando atual. Quando os dois riscos existem, as duas
autorizações são necessárias. `--allow-insecure-tls` é uma autorização separada.
Mesmo com aprovação, headers privados/autenticação da origem não são encaminhados.
A continuação não repete o envio anterior nem as dependências da coleção. Timeout
e cancelamento descartam confirmações pendentes; autorizações atrasadas não enviam
requests. TLS inseguro na interface mantém `[I]`, por destino, ambiente e sessão.

Respostas são capturadas até cerca de 1,5 MB e renderizadas de forma limitada para manter a interface responsiva. A captura libera o leitor ao terminar ou falhar e só marca truncamento quando encontra bytes além do limite. A busca acompanha linhas e colunas sem reprocessar todo o texto anterior a cada ocorrência. Valores identificados como secretos são mascarados em preview, cURL, conflitos, relatórios e erros; variáveis extraídas como secretas ficam somente em memória.

O histórico HTTP fica somente na sessão atual e não persiste corpos de requests ou responses. A resposta original continua disponível na memória para inspeção e exportação explícita. Preview, cURL, relatórios e erros mascaram segredos conhecidos; arquivos exportados explicitamente e arquivos antigos de versões anteriores ficam separados do histórico da sessão.

Redirects que mudam o host, a porta ou o protocolo removem headers de autenticação e outros headers sensíveis, incluindo API keys com nomes personalizados e valores privados resolvidos. Esses headers são preservados em redirects dentro da mesma origem.

Em Params → Path, use segmentos `:id` ou tokens explícitos `{id}` (por exemplo, `/users/:id` ou `/reports/{id}.json`). A substituição ocorre apenas no caminho, preserva nomes como `id` e `id2` e usa a primeira linha ativa quando o nome se repete. Query, host e porta continuam independentes desses parâmetros.

Valores de Path marcados como sensíveis seguem essa proteção, inclusive em URLs codificadas e linhas desativadas. Para salvar esses parâmetros em `.http`, use referências a variáveis privadas; valores secretos literais são recusados sem alterar o arquivo.

<a id="free-terminal"></a>

## Free Terminal

<p align="center">
  <img src="https://github.com/DeividXupon/tuiminal/raw/refs/heads/main/docs/media/terminal.gif" alt="Demonstração da tab Free Terminal do Tuiminal" width="100%">
</p>

Um multiplexador genérico, não um terminal restrito a uma ferramenta. Novos terminais usam PTYs reais e podem executar shells, REPLs, bancos interativos, Codex, Claude ou qualquer CLI disponível no `PATH`.

Comandos personalizados aceitam expressões completas do shell, incluindo `&&`, `||`, `;`, pipes, variáveis e laços. Por exemplo, `npm install && npm run dev` executa a segunda etapa se a primeira terminar com sucesso.

O tmux é opcional. Novos terminais usam tmux 3.2+ automaticamente quando disponível
no Linux, macOS ou WSL; caso contrário, usam o terminal nativo, inclusive no Windows.
Nos dois modos, os terminais ficam dentro desta aba: trocar para Git oculta os
painéis enquanto os comandos continuam executando. Nada é instalado automaticamente.
Defina `TUIMINAL_TERMINAL_BACKEND=native` antes de iniciar o Tuiminal para usar sempre
terminais nativos (`auto` é o padrão; `tmux` exige explicitamente o tmux).

Ao abrir o Terminal, as janelas da sessão tmux persistente `tuiminal` voltam para
**Tuiminais**, enquanto painéis comuns encontrados em outros servidores são espelhados
na pasta **tmux**. Agentes reconhecidos de qualquer origem aparecem
exclusivamente em **Agentes**, inclusive quando estão em painéis da mesma sessão.
Novos painéis são encontrados sem mudar o foco atual. Fechar um espelho externo mantém
seu processo executando e dispensa o painel durante esta execução. A descoberta respeita o limite de 12 terminais.
Defina `TUIMINAL_TERMINAL_AUTO_MIRROR=0` antes de iniciar para desativá-la; os
painéis persistentes do Tuiminal ainda são restaurados.

Use a Master Key seguida de `[T]` para espelhar outro painel manualmente ou reabrir
um espelho dispensado no servidor tmux do Tuiminal, padrão ou herdado. Escolha a linha com a
sessão, janela, painel e comando do
seu agente, usando o mouse ou `[Enter]`. Painéis ao lado do Tuiminal na mesma sessão
tmux ficam disponíveis. O espelho carrega a tela que já existe e continua seguindo
esse painel mesmo quando outra janela é selecionada no terminal original.
O teclado é compartilhado; fechar o espelho apenas desconecta o Tuiminal.
As atualizações aceleram enquanto a saída muda e são solicitadas imediatamente
após a entrada. O texto inalterado permanece na tela, e painéis parados reduzem a
frequência de atualização.

Painéis externos não podem ser reiniciados pelo Tuiminal. Suas dimensões acompanham
temporariamente o espaço disponível ao lado da barra lateral, incluindo as divisões
locais. O agente se reorganiza nesse tamanho nos dois terminais. O tamanho e o layout
originais são restaurados ao desconectar o último espelho daquela janela. Quando você
volta à janela de origem, o Tuiminal libera o tamanho manual temporário e o tmux ajusta
imediatamente a janela ao cliente visível, mantendo os splits atuais, inclusive a
sidebar fixada. Depois que você sai da janela de origem, o Tuiminal adota o layout mais
recente antes de ajustar o espelho novamente. Alterações manuais não são sobrescritas.
Janelas que contêm o próprio Tuiminal mantêm o tamanho e usam recorte para evitar um
ciclo de redimensionamento.
O espelhamento atualiza
a tela atual do aplicativo; não importa o histórico de rolagem, a interface do modo
de cópia do tmux ou a entrada do mouse. Terminais já abertos fora do tmux aparecem
como metadados somente para leitura em **Outros**, mas ainda não podem ser espelhados;
ao selecionar um deles, o Tuiminal informa o TTY original sem substituir o painel ativo.
O seletor informa essa limitação. Sem tmux, crie terminais
dentro do Tuiminal para usar divisões, estados dos agentes e execução em segundo
plano com o backend nativo.

### O que você pode fazer

- Manter até 12 terminais, com no máximo dois por seção, lado a lado ou um acima do outro.
- **Novo terminal** sempre abre uma seção separada. Para dividir a seção atual, use a Master Key seguida de `[V]` (lado) ou `[S]` (abaixo).
- Usar um layout compacto inspirado no Herdr: sessões numeradas em duas linhas acima da lista de agentes. Um shell aguardando mostra `○ Ocioso`; `● Executando` aparece apenas enquanto há uma ferramenta ou comando em primeiro plano. A segunda linha mostra diretório, comando ou código de saída e o backend `native`/`tmux`; referências externas somente para leitura mostram seu TTY. A seção ativa recebe uma barra de destaque. Os terminais ocupam toda a área restante até os cantos, e divisões usam apenas um separador.
- Novos terminais e comandos personalizados abrem em **Tuiminais**. Crie outras pastas, renomeie terminais e mova seções quando precisar. As pastas personalizadas e a posição das sessões tmux são salvas por projeto fora da pasta do projeto e restauradas na próxima abertura. A pasta reservada **tmux** contém painéis externos que podem ser espelhados; **Outros** lista terminais POSIX fora do tmux com comando em primeiro plano, estado, diretório e TTY como referências somente para leitura. Agentes externos reconhecidos aparecem em **Agentes** com atividade desconhecida, pois o Tuiminal não consegue inspecionar sua tela. Sessões divididas mantêm os dois itens de terminal em duas linhas, cada um clicável ao lado de um separador vertical.
- Os nomes dos terminais acompanham a ferramenta em execução automaticamente: `zsh` → `lazygit` → `zsh`. Agentes reconhecidos mostram o nome do CLI, como `codex`, mesmo quando o runtime informa `MainThread` ou `node`. Isso também funciona nos espelhos tmux. Nomes definidos manualmente pela ação `[E]` da Master Key permanecem fixos, inclusive após reiniciar.
- Acompanhar agentes reconhecidos exclusivamente em **Agentes**, com um loader animado enquanto trabalham. **Sessões** mostra os demais terminais. As pastas e divisões originais são preservadas, e o terminal volta para Sessões quando o agente encerra.
- Fixar a sidebar ativa com a Master Key seguida de `[B]` para manter Sessões e Agentes visíveis ao navegar pelas ferramentas do Tuiminal. Use `[L]` no menu de ações para focá-la, percorra Sessões e Agentes continuamente com `[↑/↓]` ou `[J/K]` e pressione `[Enter]` para abrir o item destacado. Um light sweep rápido atravessa o fundo inteiro da barra quando ela recebe o foco. Dentro do tmux, o Tuiminal também mantém um split lateral esquerdo marcado em cada janela do servidor atual: depois de selecionar esse split pela navegação normal do tmux, seus controles diretos já funcionam, e ele continua clicável enquanto o terminal vizinho está focado. O split ao lado do Tuiminal abre o alvo no workspace Terminal, enquanto outra janela seleciona diretamente seu painel tmux existente quando possível. A Master Key desse split abre as mesmas ações e executa ações sem diálogo sem sair da janela. Soltar a barra remove apenas esses splits auxiliares e restaura a configuração anterior de mouse do tmux.
- Preservar cores, cursor, saída e processos ao redimensionar, trocar de seção ou de ferramenta. Reinícios aguardam o encerramento do processo anterior; ao sair, o Tuiminal desconecta terminais tmux persistentes e encerra apenas processos nativos próprios.

Em `[,]` → **Terminal**, escolha a **Master Key** (padrão `[Ctrl+B]`). Ao pressioná-la,
uma lista de ações aparece na parte inferior. Escolha uma tecla ou clique na ação;
`[Esc]` cancela e mantém o foco no terminal. Repetir a Master Key envia essa tecla ao processo.

| Após a Master Key | Ação |
| --- | --- |
| `[N]` / `[C]` | Novo terminal / nova seção |
| `[/]` | Comando personalizado em nova seção |
| `[T]` | Espelhar um painel tmux existente |
| `[V]` / `[S]` | Dividir para o lado / abaixo |
| `[Tab]` / `[P]` | Próximo terminal / anterior |
| `[A←]` / `[F→]` | Seção anterior / próxima |
| `[1]` / `[2]` | Focar um terminal da seção |
| `[M]` | Ampliar / restaurar |
| `[B]` | Fixar / soltar a sidebar |
| `[L]` | Focar a sidebar |
| `[E]` | Renomear terminal |
| `[D]` / `[O]` | Nova pasta / mover seção |
| `[R]` / `[X]` | Reiniciar / fechar terminal |
| `[G]` | Liberar atalhos globais, incluindo `[,]` |
| `[Esc]` | Cancelar a Master Key |

Os marcadores da sidebar mostram um loader animado enquanto o agente trabalha, `!` aguardando você, `✓`
concluído e ainda não visto, `○` ocioso e `?` desconhecido. A lista separada de
**Agentes** mostra todos os agentes em execução, com estado alinhado à direita e
título da tarefa abaixo, usando o nome do terminal quando indisponível.
O título da tarefa usa a cor de foco própria de cada paleta. Em telas baixas, linhas compactas mantêm os agentes
acessíveis. Clique em uma linha para focar aquele terminal. As
atividades incluem lendo, pesquisando, pensando, escrevendo ou executando quando
a interface do agente fornece esse sinal. O acompanhamento continua nas seções
ocultas; abrir o painel concluído marca o resultado como visto.

Os títulos de tarefa usam o texto que o agente publica no terminal, inclusive em
espelhos tmux já existentes. Os formatos abrangem Codex, Claude Code, OpenCode,
Qwen, Pi e o resumo dinâmico de atividade do Gemini, além de qualquer outro agente
reconhecido ou cadastrado que publique um título útil. Alguns títulos descrevem a
sessão inteira, em vez de cada prompt. Não são necessários hooks, chamadas extras
de modelo ou alterações na configuração dos agentes; quando o título não é
exposto, o item continua mostrando o nome do terminal.

O MVP local reconhece controles de tela de Codex, Claude Code, Gemini e OpenCode,
além de títulos de terminal suportados de Codex/Claude. Não instala hooks nem
altera configurações dos agentes. Identidade e atividade são heurísticas; agentes
sem perfil e telas não reconhecidas podem permanecer com estado desconhecido.
Para identificar um CLI privado ou renomeado, cadastre seu executável/módulo em
**Terminal → Comandos de agentes adicionais**; isso não adiciona um perfil de
estados. Veja o [contrato e estudo do Herdr](docs/design/terminal-agents.md).
Pastas criadas pelo usuário e a pasta atribuída a cada painel tmux são salvas por
projeto no diretório de dados do Tuiminal, sem modificar o projeto aberto. A Master Key e as regras
adicionais são salvas nas configurações. Quando o tmux está disponível, os terminais
criados pelo Tuiminal são janelas persistentes na sessão compartilhada `tuiminal` e
voltam para **Tuiminais** quando o aplicativo é reaberto. Fechar o Tuiminal desconecta
apenas seus clientes temporários; `[X]` encerra somente a janela selecionada.
Terminais nativos encerram junto com o aplicativo, e sessões tmux externas são apenas
desconectadas. A identificação de agentes acompanha cada painel espelhado, inclusive
em janelas com vários agentes.

## Interface e personalização

`[,]` abre a central de configurações contextuais. Em terminais largos, ela usa uma
barra lateral de categorias e um painel de detalhes; em terminais estreitos, mostra
uma categoria por vez. Use `[J/K]` ou `[↑/↓]` para navegar entre categorias e
`[H/L]` ou `[←/→]` para alterar a opção atual. As mudanças são salvas
automaticamente sem desmontar editores, perder foco ou apagar o estado das
ferramentas.

Quando o Git está ativo, aparecem cinco itens sem prefixos numéricos: Diffs no
grupo **GIT**, e Pull Requests, Issues, Repositórios e Navegador no grupo
**GITHUB**. `[J/K]` ou
`[↑/↓]` move o foco e renderiza imediatamente o detalhe da linha focada. Somente
essa linha mostra `[Enter]` em azul; `[Enter]` ou `[L]` transfere o foco do teclado
para o painel de detalhes. Uma linha azul à esquerda indica qual painel está em
foco. Dentro de um detalhe do Git, `[J/K]` navega nas linhas e `[Esc]` volta à lista
de categorias. `[Ctrl+P]` em Diffs abre essa mesma central diretamente nos
controles de projeto e branch local.

- **Modo de cor:** Dark ou Light.
- **Paletas:** Prime, Midnight, Nord, Gruvbox, Dracula, Catppuccin e Tokyo Night.
- **Layout:** Moldurado, com gaps e bordas completas; ou Compacto, com mais espaço e uma linha de foco por painel.
- **Idiomas:** português brasileiro, inglês, espanhol, japonês, chinês simplificado e coreano.
- **Tutorial:** um tour da ferramenta ativa com dados simulados e sem acesso a serviços reais.
- **Mouse:** tabs, listas, botões, campos, commits, diffs, scroll e splits continuam clicáveis.
- **Notificações:** informações, sucessos, avisos e erros aparecem sem roubar o foco.

As preferências ficam em `~/.config/tuiminal/settings.json`.

Se o arquivo contiver um nome de paleta inválido, a interface usa Prime e preserva as demais preferências válidas.

A tradução de mensagens com prefixos repetidos de erro ou aviso não corta o texto nem depende da profundidade da pilha de chamadas.

## Desenvolvimento

O pacote npm não exige Bun do usuário final. O checkout de desenvolvimento usa **Bun 1.4.2**, registrado em `.bun-version` e `package.json`:

```bash
git clone https://github.com/DeividXupon/tuiminal.git
cd tuiminal
bun install --frozen-lockfile
bun run dev
```

O desenvolvimento usa o mesmo instalador, com pacotes gerados localmente e cache
separado. Após editar uma ferramenta, reinicie `bun run dev` e instale o novo pacote.
Se gerar os pacotes separadamente com `bun run build:features`, reinicie a aplicação
antes de instalar. Não precisa publicar no npm.
Veja o [contrato de instalação](./docs/design/official-feature-installation.md).

Comandos principais:

| Comando | Finalidade |
| --- | --- |
| `bun run dev` | Gerar pacotes locais e abrir o fluxo de instalação |
| `bun run build:features` | Gerar os cinco pacotes oficiais instaláveis |
| `bun run test:unit` | Testar regras e integrações locais |
| `bun run test:tui` | Testar a interface nativa e o carregamento dos cinco pacotes de ferramentas |
| `bun run check` | Typecheck, formato, lint, workspaces, arquitetura, manutenção e testes |
| `bun run check:workspaces` | Conferir versões, exports e dependências de cada pacote |
| `bun run build:packages` | Gerar JavaScript, tipos e manifests dos seis módulos internos |
| `bun run test:packages` | Empacotar e instalar os módulos em um projeto temporário |
| `bun run check:licenses` | Conferir o inventário reproduzível de licenças de produção |
| `bun run docs:demos` | Recriar os GIFs do instalador e das cinco ferramentas |
| `bun run build:release` | Gerar os pacotes de distribuição por plataforma |
| `bun run test:release` | Validar hashes, tarballs e a instalação final sem Bun no `PATH` |

`bun run docs:demos` usa dados simulados ou um repositório temporário, nunca credenciais e serviços do usuário. A conversão final dos frames requer [ImageMagick](https://imagemagick.org/).

Antes de contribuir, leia:

- [Guia de contribuição](./CONTRIBUTING.md)
- [Política de segurança](./SECURITY.md)
- [Processo de release](./docs/release-process.md)
- [Arquitetura do projeto](./docs/architecture.md)
- [Decisão do monólito modular](./docs/adr/0001-modular-monolith.md)

## Arquitetura e próximos passos

O inglês é o idioma principal da documentação. Mantenha este arquivo e o
[README em inglês](./README.md) sincronizados quando o conteúdo compartilhado mudar.

O código usa um **monorepo com Bun workspaces**. `apps/cli` compõe a aplicação,
`packages/core` reúne infraestrutura e componentes compartilhados, e
`packages/feature-{git,database,runner,http,terminal}` contém as cinco ferramentas.
Cada pacote tem seu `package.json`; `bun install` conecta as dependências locais
declaradas com `workspace:*`, sem precisar de links manuais.

Os seis módulos gerados por `bun run build:packages` ficam em `dist/packages` e
apontam para suas respectivas pastas neste mesmo repositório. Seus contratos são
internos e suas versões acompanham o CLI. Os manifests de fonte permanecem privados;
o empacotamento prepara os artefatos, sem publicá-los. A distribuição atual pelo npm
usa o launcher `tuiminal` com um binário mínimo por plataforma e cinco ferramentas
oficiais instaladas separadamente.

O [checklist de prontidão para alfa](./ALPHA_READINESS_PLAN.md) resume o hardening
local e os aceites que ainda bloqueiam uma alfa. Ele não representa aprovação de
release nem uma nova versão publicada no npm.

Database, Git, Runner, HTTP e Free Terminal são funcionalidades oficiais mantidas internamente pelo Tuiminal. Não há plano de SDK público, marketplace ou carregamento de plugins comunitários. A instalação mínima baixa componentes oficiais compatíveis sob demanda, sempre gerenciados pelo próprio Tuiminal e sem modificar o projeto aberto pelo usuário.

O [plano do cliente HTTP](./HTTP_CLIENT_PLAN.md) registra os próximos passos dessa ferramenta.

As especificações mantidas da interface Git e de seus contratos estão em:

- [Git Diffs e Pull Requests](./docs/design/git-pr-interface.md)
- [Git Issues](./docs/design/git-issues-interface.md)
- [Git Inbox](./docs/design/git-inbox-interface.md)

## Licença

Copyright 2026 DeividXupon.

Distribuído sob a [Apache License 2.0](./LICENSE). Você pode usar, modificar e distribuir o Tuiminal, inclusive comercialmente, desde que preserve os termos e avisos exigidos pela licença. Os avisos dos componentes incorporados estão em [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).
