# Processo de release

Tuiminal ainda está em pré-alfa. Construir um candidato não autoriza publicá-lo.
A publicação exige um commit imutável aprovado pelo mantenedor, o gate verde no
mesmo SHA e validação nativa dos seis pacotes anunciados.

## 1. Preparar o candidato

1. Escolher a versão e o canal npm com o mantenedor; não mover `latest` por
   inferência.
2. Instalar o lockfile com Bun 1.3.14 e confirmar que ele não mudou:

   ```sh
   bun install --frozen-lockfile
   bun audit --json
   bun run check
   git diff --check
   ```

3. Regenerar `THIRD_PARTY_NOTICES.md` com `bun run docs:licenses` quando a árvore
   de produção ou o runtime Bun mudar. `bun run check:licenses` recusa um
   inventário desatualizado. O inventário ajuda a preservar avisos, mas não
   substitui revisão jurídica, especialmente das obrigações transitivas do
   runtime compilado.
4. Regenerar os cinco demos com `bun run docs:demos` depois de mudanças materiais
   de layout ou fluxo e revisar visualmente os GIFs.
5. Disparar manualmente `Release candidate matrix`. Esse workflow tem somente
   `contents: read`, não recebe credencial npm e não contém etapa de publicação.
   Portanto, falha de build, teste ou empacotamento encerra o job sem publicar.

## 2. Matriz e artefatos

O workflow usa os runners nativos correspondentes a `linux-x64`, `linux-arm64`,
`darwin-x64`, `darwin-arm64`, `win32-x64` e `win32-arm64`. Em cada runner ele:

1. instala a árvore exata daquela plataforma sem executar scripts de pacotes;
2. executa o gate completo da fonte;
3. compila somente o alvo nativo;
4. valida o conteúdo exato dos tarballs npm;
5. instala o pacote principal e o pacote de plataforma em um caminho temporário
   com espaços e Unicode, sem Bun no `PATH`;
6. exercita `--version`, `--help` e um request HTTP em loopback;
7. remove a instalação temporária.

`bun run build:release [alvo]` grava `dist/npm/SHA256SUMS` para os executáveis,
helper e manifests do candidato. `bun run test:release [alvo]` verifica esses
hashes antes dos smokes. Compilação cruzada isolada não conta como validação
nativa; todos os jobs precisam passar no mesmo SHA.

Além do workflow automatizado, a aprovação deve registrar resultados por sistema
para PTY, encerramento de árvore de processos, helper SQLite, proxy/TLS e
gerenciador de credenciais. Qualquer plataforma não validada precisa ser removida
do suporte anunciado ou manter a release bloqueada.

## 3. Publicação autorizada

A primeira publicação continua deliberadamente fora do workflow de candidato.
Antes de adicioná-la ou executá-la:

- confirmar proteção da `main`, checks obrigatórios, bypasses e colaboradores no
  estado remoto efetivo;
- obter aprovação explícita do mantenedor para versão, SHA, tag, notas e canal;
- configurar npm Trusted Publishing para o workflow/repositório exatos, com
  permissões mínimas e sem armazenar token pessoal de longa duração;
- conferir que nomes, versões, LICENSE, avisos, `SHA256SUMS` e tag apontam para o
  mesmo conteúdo;
- publicar primeiro os seis pacotes de plataforma e por último o launcher, sem
  sobrescrever uma versão existente;
- instalar novamente do registry em ambiente limpo e repetir os smokes.

Falha ou resultado incerto interrompe a sequência. Não repetir automaticamente
uma publicação que possa ter sido aceita pelo registry. Reconciliar o estado no
npm e no GitHub antes de qualquer nova ação.

## 4. Incidente, retirada e comunicação

Relatos privados seguem [SECURITY.md](../SECURITY.md). Se um artefato distribuído
estiver incorreto ou vulnerável, preservar evidência, bloquear novas instalações
por dist-tag/deprecation conforme a decisão do mantenedor, preparar uma versão
corrigida imutável e publicar a orientação sem expor segredos. Não apagar ou
reescrever silenciosamente releases existentes.
