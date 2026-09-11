# Interface Git Inbox

Especificação do workspace `[4] Inbox`, inspirado na caixa de notificações do
gh-dash e ajustado às regras de foco, segurança e responsividade do Tuiminal.

## Anatomia

```text
┌ [1] [C] Diffs  [2] PR  [3] Issues  [4] Inbox ──────────────────────────┐
│ INBOX DO GITHUB                                                       │
│ Caixa 12  Revisão 3  Atribuídas 2  Menções 4  Salvas 1                 │
├──────────────────────────────────┬───────────────────────────────────────┤
│ ▶ ● owner/api                    │ Corrigir invalidação do cache        │
│   Corrigir invalidação · PR 09:10│ owner/api · PullRequest              │
│   ○ owner/web                    │ [O] Abrir [M] Lida [B] Salvar        │
│   Ajustar foco · Issue ontem     │ [D] Concluir [U] Parar de acompanhar │
│   ◷ Carregando mais notificações…│                                       │
└──────────────────────────────────┴───────────────────────────────────────┘
 [J/K] Navegar  [H/L] Foco  [A←] [F→] Seção  [R] Atualizar
```

## Comportamento

- Larga (`≥92 × 20`): lista e prévia lado a lado; abaixo disso, painel único com
  `[L/→/Enter]` para a prévia e `[H/←]` para a lista.
- `[A←]`/`[F→]` circula pelas seções; cada controle também aceita mouse.
- Ao selecionar o último item carregado, a próxima página começa uma única vez.
  O loader é filho do scrollbox e desaparece quando a página é incorporada.
- O refresh periódico relê da primeira até a última página já alcançada. Durante
  a chamada, a seleção e os dados visíveis permanecem estáveis.
- O cabeçalho só mostra o estado de atualização enquanto uma chamada está ativa;
  não exibe uma legenda permanente para um comportamento que não pode ser desligado.
- Notificações não lidas usam `●`; lidas usam `○`; salvas recebem `★`. O sentido
  não depende apenas de cor.

## Ações e camadas

- `[O]` abre PR/Issue com o comando específico do `gh`; outros assuntos usam
  `gh browse` preso ao repositório.
- `[M]` marca a thread como lida e mantém a linha.
- `[B]` alterna persistência local; não muda a inscrição no GitHub.
- `[D]` e `[U]` abrem uma confirmação com alvo e consequência. `[Ctrl+S]`
  confirma e `[Esc]` fecha somente esse modal.
- A aba não é montada antes do primeiro acesso e é descartada com os demais
  recursos Git no encerramento.

## Estados e limites

Carregando, vazio, requisito do `gh`, erro de configuração/API, paginação e
refresh são estados distintos. O tamanho de página e o intervalo reutilizam os
defaults do perfil de PR, evitando uma segunda configuração concorrente para o
mesmo host. O conteúdo remoto fica em memória; apenas IDs salvos vão para disco.
O host acompanha a opção GitHub aberta por `[,]` nas configurações da tela Git;
uma alteração invalida o cache quando o Inbox voltar a ficar ativo.
O carregamento inicial ocupa o painel com plasma ASCII e mensagem em primeiro
plano, dissolvendo rapidamente ao revelar a lista; paginação e refresh não cobrem
conteúdo já carregado.
Se `gh` estiver ausente, antigo ou sem login, Inbox usa a mesma explicação e mini
terminal guiado de PR/Issues. `[C]` copia o comando e `[Enter]`/mouse foca o shell;
o usuário cola e executa. Versão ou login válidos recarregam a tela automaticamente,
sem o Tuiminal ler tokens nem iniciar os comandos exibidos. O PTY recebe respostas
de protocolo do emulador e `[Enter]` reabre um shell encerrado.
