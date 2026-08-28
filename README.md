# Tuiminal

Um painel de trabalho extensível construído com OpenTUI, React e tuiparts.

Funcionalidades atuais:

- Pomodoro animado com ciclos de foco e pausa (continua rodando entre tabs)
- Navegação por tabs
- Explorador somente leitura do MySQL conectado ao MCP do Codex
- Workspace Git no estilo lazygit para o repositório de onde o app foi iniciado
- Busca de tabelas, paginação adaptativa e navegação horizontal por colunas
- Mascaramento automático de colunas sensíveis

## Executar

```bash
bun install
bun run start
```

## Navegação

- `1`: abrir Pomodoro
- `2`: abrir Banco
- `3`: abrir Git
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
- `Espaço`: adicionar ao stage ou remover do stage
- `d`: visualizar o diff do arquivo
- `l`: visualizar os commits recentes
- `←` / `→` ou `[` / `]`: rolar o diff
- `r`: atualizar o status do repositório

Para testar outro diretório sem mudar o local de execução:

```bash
TUIMINAL_WORKDIR=/caminho/do/projeto bun run start
```
