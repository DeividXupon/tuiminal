# Benchmark local do dashboard Git/PR

Medição de 2026-09-04 em Darwin x86_64, Bun 1.3.14, sem rede, conta ou repositório
GitHub real. O script aquece cada operação e registra sete amostras. Os números são
uma linha de base da máquina de desenvolvimento, não uma promessa universal.

Execute novamente com:

```bash
bun run benchmark:git-pr
```

| Cenário | p50 | p95 | Interpretação |
| --- | ---: | ---: | --- |
| 100 mil movimentos de seleção | 0,17 ms | 0,96 ms | A transição individual fica muito abaixo da meta p95 de 50 ms. |
| Reconciliar cache de 20 mil + 5 mil PRs | 66,77 ms | 116,17 ms | Carga sintética extrema; a página normal continua limitada a 20–100 itens. |
| Interpretar Markdown de 256 KiB | 33,61 ms | 52,73 ms | Executado somente ao carregar/alterar a descrição limitada. |
| Interpretar diff de 2 MiB | 144,30 ms | 155,60 ms | Custo de entrada no documento, fora da movimentação de seleção; 2 MiB é o teto. |

O benchmark usa dados Unicode gerados em memória. A reconciliação deduplica por
host + node ID e ordena o resultado; Markdown passa pelo mesmo parser seguro da
prévia; diff passa pelo mesmo parser usado pelo renderer. Rede e processos `gh`
foram excluídos porque sua latência depende do host, rate limit e conexão.
