# Tuiminal

Um painel de trabalho extensível construído com OpenTUI, React e tuiparts.

Funcionalidades atuais:

- Pomodoro animado com ciclos de foco e pausa (continua rodando entre tabs)
- Navegação por tabs
- Explorador somente leitura do MySQL conectado ao MCP do Codex
- Workspace Git no estilo lazygit para o repositório de onde o app foi iniciado
- Runner de scripts com logs ao vivo, processos simultâneos e histórico da sessão
- Cliente HTTP com métodos, headers, body, resposta formatada e histórico
- Busca de tabelas, paginação adaptativa e navegação horizontal por colunas
- Mascaramento automático de colunas sensíveis

## Executar

```bash
bun install
bun run start
```

## Usar como comando

Instale o projeto local como um comando global uma vez:

```bash
bun add --global "$PWD"
```

Depois, execute o Tuiminal de qualquer diretório. Sem argumento, ele usa o
diretório atual; com um caminho, abre diretamente esse repositório na aba Git:

```bash
tuiminal
tuiminal ../outro-projeto
tuiminal /caminho/absoluto/do/repositorio
```

Use `tuiminal --help` para ver todas as opções. Se o shell não encontrar o
comando, confira se `~/.bun/bin` está no `PATH`. Para removê-lo, execute
`bun remove --global tuiminal`.

## Navegação

- `1`: abrir Pomodoro
- `2`: abrir Banco
- `3`: abrir Git
- `4`: abrir Runner
- `5`: abrir HTTP
- `q`, `Esc` ou `Ctrl+C`: sair

## Pomodoro

- `p`: iniciar ou pausar
- `r`: reiniciar o ciclo atual
- `s`: pular para foco/pausa
- `m`: alternar entre foco e pausa
- `+` / `-`: ajustar a duração enquanto estiver pausado
- `t`: preparar uma contagem de 10 segundos para testar o ciclo completo

Os botões também podem ser selecionados com `Tab` e acionados com `Enter` ou
`Espaço`.

## Banco

- `↑` / `↓`: navegar pelas tabelas
- `Enter`: abrir a tabela selecionada
- `/`: focar a busca de tabelas
- `Esc`: sair da busca
- `n` / `p`: próxima página ou página anterior
- `←` / `→`: navegar pelas colunas
- `r`: atualizar a página atual

O explorador usa por padrão o executável
`~/.codex/bin/mysql-rw-mcp`. Para apontar para outro MCP compatível:

```bash
TUIMINAL_MYSQL_MCP_COMMAND=/caminho/para/mysql-mcp bun run start
```

A aplicação não contém credenciais e não oferece editor SQL. As consultas são
limitadas a leitura. A interface exibe de 6 a 30 registros por página conforme
o espaço disponível no terminal. Campos como senhas,
tokens, chaves, documentos, e-mails e telefones são mascarados na própria
consulta antes de chegarem à interface.

## Git

A aba Git detecta automaticamente o repositório e o branch a partir do
diretório onde o Tuiminal foi iniciado.

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
manter mais de um processo rodando ao mesmo tempo.

O campo no topo aceita qualquer comando manual. Isso mantém o Runner útil mesmo
quando o projeto usa uma ferramenta que ainda não possui detecção automática.
Processos longos aparecem no painel `PROCESSOS ATIVOS`, logo abaixo dos comandos
detectados. Quando abrem servidores, a mesma linha mostra a porta, como
`127.0.0.1:8000`; ela também aparece no respectivo painel do modo múltiplo.

A última opção da lista abre o seletor de projetos. Ele procura repositórios Git
no computador, permite filtrar por nome/caminho e inclui um navegador para
escolher manualmente qualquer pasta. Processos de projetos diferentes continuam
ativos ao trocar de diretório. Até quatro projetos abertos ficam disponíveis em
tabs compactas sobre os comandos, alternadas pelos atalhos `!`, `@`, `#` e `$`.

O modo múltiplo exibe os processos ativos lado a lado, com foco destacado e até
três terminais por grupo. Em terminais estreitos o limite é reduzido para manter
os logs legíveis; grupos adicionais ficam disponíveis pela paginação.

- `/`: focar o campo de comando manual
- `↑` / `↓`: selecionar um comando
- `Enter`: abrir o processo ativo ou executar quando ainda não estiver rodando
- `r`: iniciar uma nova execução, mesmo se o comando já estiver ativo
- `!` / `@` / `#` / `$`: alternar entre os projetos abertos no Runner
- `p`: focar a lista de processos ativos
- `m`: alternar entre visualização única e múltipla
- `←` / `→`: mudar o terminal em foco no modo múltiplo
- `Shift+K`: encerrar o processo exibido
- `[` / `]`: alternar saídas no modo único ou grupos no modo múltiplo
- `c`: limpar a saída exibida
- `d`: redetectar os comandos do projeto

Por padrão, projetos Git são procurados dentro da pasta pessoal. Para limitar a
busca, defina `TUIMINAL_PROJECT_ROOTS` com uma lista de diretórios separada pelo
separador de caminhos do sistema.

Ao fechar o Tuiminal, todos os processos iniciados pelo Runner são encerrados.

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
