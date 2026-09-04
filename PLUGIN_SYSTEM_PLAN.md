# Plano evolutivo do sistema de plugins

> Status: rascunho para implementação futura.
>
> Este documento registra uma direção, não uma especificação definitiva. A ordem,
> os comandos, os nomes de pacotes, o formato do manifesto e as decisões de
> isolamento podem ser alterados conforme protótipos, testes, limitações do Bun e
> feedback de usuários e autores de plugins. Antes de implementar cada fase,
> devemos revisar este plano e registrar as decisões confirmadas.

## Objetivo

**Base implementada:** a organização atual usa um monólito modular com APIs internas
por ferramenta e regras de dependência. Consulte [a arquitetura atual](./docs/architecture.md)
e [a decisão de migração](./docs/adr/0001-modular-monolith.md). Isso prepara a separação
futura, mas não implementa instalação de plugins, isolamento, permissões ou um SDK público.

Transformar o Tuiminal em um núcleo extensível que possa começar sem ferramentas
instaladas e receber módulos oficiais ou comunitários posteriormente. Database,
Git, Runner, HTTP e Free Terminal devem usar a mesma API pública que
estará disponível para terceiros.

Experiência desejada:

```text
tuiminal -i db
tuiminal -i npm:@autor/tuiminal-redis
tuiminal -i github:autor/tuiminal-redis
tuiminal -i ./meu-plugin
```

O objetivo não é somente carregar componentes externos. O sistema também deve
oferecer compatibilidade de versões, permissões compreensíveis, recuperação de
falhas, armazenamento isolado e ferramentas para criar e testar plugins.

## Princípios

- Plugins oficiais e comunitários usam o mesmo contrato público.
- O núcleo não conhece regras específicas de Database, Git ou qualquer outra
  ferramenta.
- Instalar um plugin nunca altera o projeto aberto pelo usuário.
- Um plugin não deve importar arquivos internos de `src/`.
- Permissões são declaradas antes da execução e novas permissões exigem nova
  aprovação.
- Um plugin com erro não pode impedir o Tuiminal de abrir.
- Processos, conexões e listeners registrados pelo plugin devem ser encerrados ao
  desativá-lo.
- Tema, idioma, mouse, teclado, layout compacto e acessibilidade continuam sendo
  contratos de primeira classe.
- A migração deve ser incremental: o aplicativo atual continua funcionando
  enquanto as ferramentas são extraídas.
- Toda nova API pública precisa de testes de contrato e documentação.

## Estado atual e primeiro limite arquitetural

Atualmente, `src/index.tsx` importa e renderiza diretamente as ferramentas. O CLI
também mantém uma lista fixa de comandos em `bin/tuiminal.ts`. Antes de instalar
plugins externos, essas duas listas precisam ser substituídas por um registro
dinâmico de contribuições.

O primeiro marco deve ser pequeno: um plugin de exemplo com uma tab simples,
instalado por `tuiminal -i ./examples/hello`, sem import direto no núcleo. Esse
protótipo validará o contrato antes da migração das ferramentas mais complexas.

## Arquitetura proposta

Esta estrutura é uma hipótese inicial e pode mudar:

```text
tuiminal/
├── apps/
│   └── cli/
├── packages/
│   ├── core/
│   ├── plugin-sdk/
│   ├── plugin-test/
│   └── create-plugin/
├── plugins/
│   ├── http/
│   ├── git/
│   ├── runner/
│   ├── terminal/
│   └── database/
└── package.json
```

Responsabilidades propostas:

- `core`: renderer, navegação, temas, idiomas, configurações globais, atalhos,
  ciclo de vida, permissões e tratamento de falhas.
- `plugin-sdk`: tipos e APIs estáveis usadas por todos os plugins.
- `plugin-test`: host simulado e utilitários de testes de contrato.
- `create-plugin`: scaffold de um plugin comunitário.
- `plugins/*`: ferramentas oficiais implementadas sem acesso privilegiado aos
  arquivos internos do núcleo.

## Contrato inicial do plugin

O manifesto pode começar com um formato semelhante a este:

```json
{
  "schemaVersion": 1,
  "id": "com.exemplo.redis",
  "name": "Redis",
  "version": "1.0.0",
  "description": "Cliente Redis para o Tuiminal",
  "publisher": "exemplo",
  "main": "./dist/index.js",
  "tuiminal": ">=1.0.0 <2.0.0",
  "permissions": ["network", "workspace:read"],
  "contributes": {
    "tabs": [
      {
        "id": "redis",
        "title": "Redis",
        "symbol": "&"
      }
    ]
  }
}
```

Possível entrada pelo SDK:

```tsx
import { definePlugin } from "@tuiminal/plugin-sdk"
import { RedisWorkspace } from "./RedisWorkspace"

export default definePlugin({
  activate(context) {
    context.tabs.register({
      id: "redis",
      title: "Redis",
      component: RedisWorkspace,
    })

    context.commands.register({
      id: "redis.connect",
      title: "Conectar ao Redis",
      run: () => {},
    })
  },

  deactivate() {},
})
```

O contrato final só deve ser congelado após o protótipo do plugin de exemplo. Até lá,
esses nomes são exemplos, não APIs garantidas.

## APIs que o SDK deverá avaliar

- Registro de tabs, comandos, atalhos e configurações.
- Tema, idioma e traduções do plugin.
- Modais, confirmações, notificações e barra de status.
- Armazenamento isolado por plugin.
- Acesso controlado ao diretório de trabalho.
- Clipboard e abertura de arquivos/URLs.
- Criação e encerramento rastreável de processos.
- Registro e descarte de listeners, timers e conexões.
- Sinal de ativação, desativação e encerramento do host.
- Informações do terminal e mudanças de dimensões.
- Controles acessíveis por teclado e mouse.

O SDK deve expor capacidades, não objetos internos do React/OpenTUI. Quando um
plugin precisar renderizar React em processo, as dependências compartilhadas e
suas versões deverão ser definidas explicitamente para evitar duas cópias
incompatíveis do React.

## Permissões candidatas

```text
workspace:read
workspace:write
filesystem:read
filesystem:write
network
process:spawn
clipboard:read
clipboard:write
credentials
notifications
```

Ainda precisamos validar a granularidade adequada. Uma permissão declarada não é
isolamento por si só quando o código roda no mesmo processo. Na primeira versão,
plugins com interface React provavelmente serão código local confiável executado
em processo, e a instalação deve comunicar isso de maneira explícita.

Para uma versão posterior, devemos avaliar um host separado para lógica e
processos. Isolamento total da interface exigiria uma API visual declarativa ou
outro protocolo, pois elementos React não atravessam processos diretamente.

## Persistência proposta

Plugins devem ser instalados fora do repositório e fora do projeto atualmente
aberto. Os caminhos exatos precisam respeitar as convenções de cada sistema
operacional. Uma disposição inicial seria:

```text
<diretório de dados do usuário>/tuiminal/
├── plugins/
│   ├── package.json
│   ├── node_modules/
│   └── tuiminal.lock
├── plugin-state/
├── plugin-storage/
└── logs/

<diretório de configuração do usuário>/tuiminal/
├── settings.json
├── plugins.json
└── permissions.json
```

O lockfile deve registrar origem, versão, integridade, compatibilidade e
permissões aprovadas. Segredos continuam pertencendo ao gerenciador de
credenciais do sistema operacional.

## Comandos candidatos

Instalação:

```text
tuiminal -i db
tuiminal -i npm:@autor/tuiminal-redis
tuiminal -i github:autor/tuiminal-redis
tuiminal -i ./meu-plugin
```

Gerenciamento:

```text
tuiminal plugin list
tuiminal plugin info <plugin>
tuiminal plugin enable <plugin>
tuiminal plugin disable <plugin>
tuiminal plugin remove <plugin>
tuiminal plugin update <plugin>
tuiminal plugin update --all
tuiminal plugin doctor [plugin]
```

Criação e desenvolvimento:

```text
tuiminal plugin create meu-plugin
tuiminal plugin dev ./meu-plugin
```

Aliases oficiais candidatos:

```text
db       -> @tuiminal/plugin-database
git      -> @tuiminal/plugin-git
runner   -> @tuiminal/plugin-runner
http     -> @tuiminal/plugin-http
terminal -> @tuiminal/plugin-terminal
```

Os comandos e aliases podem mudar depois de testes de UX e conflitos reais de
CLI.

## Roadmap por fases

### Fase 0 — Descoberta e decisões técnicas

- [ ] Inventariar tudo que cada ferramenta usa do núcleo atual.
- [ ] Prototipar import dinâmico de JavaScript compilado com Bun.
- [ ] Validar resolução de React/OpenTUI compartilhados.
- [ ] Comparar plugin em processo, processo separado e modelo híbrido.
- [ ] Definir diretórios portáveis para macOS, Linux e Windows.
- [ ] Escrever decisões confirmadas como ADRs curtas.

Critério de saída: um protótipo descartável comprova carregamento, renderização,
desativação e tratamento de erro sem modificar uma ferramenta real.

### Fase 1 — Contratos e testes

- [ ] Definir manifesto versão 1 e seu schema de validação.
- [ ] Criar os tipos mínimos do `plugin-sdk`.
- [ ] Definir identificadores, versões e regras de compatibilidade.
- [ ] Criar registro de contribuições para tabs e comandos.
- [ ] Criar um host de testes para plugins.
- [ ] Cobrir manifesto inválido, IDs duplicados e versão incompatível.

Critério de saída: um plugin de teste registra e remove uma tab sem import do
núcleo para o plugin ou do plugin para arquivos internos.

### Fase 2 — Primeiro plugin de exemplo local

- [ ] Criar um pacote de exemplo com uma tab simples.
- [ ] Validar estado, tema, idioma, tutorial, mouse e teclado.
- [ ] Implementar instalação local com `tuiminal -i ./caminho`.
- [ ] Implementar ativação, desativação e limpeza de recursos.
- [ ] Adicionar testes de contrato e regressão do plugin de exemplo.

Critério de saída: uma cópia limpa do Tuiminal instala e abre o plugin de exemplo local;
remover o plugin remove a ferramenta sem quebrar o núcleo.

### Fase 3 — Gerenciador local de plugins

- [ ] Persistir lista de plugins habilitados e desabilitados.
- [ ] Implementar `list`, `info`, `enable`, `disable` e `remove`.
- [ ] Criar carregamento determinístico e detecção de conflitos.
- [ ] Adicionar logs por plugin e uma tela de erro recuperável.
- [ ] Implementar `--safe-mode` e `plugin doctor`.
- [ ] Garantir que um plugin defeituoso não impeça a inicialização.

Critério de saída: o usuário recupera a aplicação pela CLI mesmo quando um
plugin falha durante `activate`.

### Fase 4 — Armazenamento e permissões

- [ ] Criar storage isolado e versionado por plugin.
- [ ] Definir fluxo de solicitação, aprovação e revogação de permissões.
- [ ] Exibir diferenças de permissões antes de uma atualização.
- [ ] Centralizar processos, timers, listeners e conexões descartáveis.
- [ ] Impedir persistência de segredos em manifestos, logs ou storage comum.
- [ ] Documentar claramente o nível real de confiança do modelo em processo.

Critério de saída: instalar ou atualizar nunca executa o plugin antes de mostrar
metadados e permissões; todos os recursos registrados são limpos na desativação.

### Fase 5 — Instalação por pacote

- [ ] Implementar resolução dos aliases oficiais.
- [ ] Instalar pacotes npm em um diretório privado do Tuiminal.
- [ ] Verificar integridade, compatibilidade e manifesto antes de ativar.
- [ ] Avaliar scripts de instalação e mantê-los bloqueados por padrão, se viável.
- [ ] Implementar atualização, rollback e lockfile.
- [ ] Avaliar instalação por GitHub sem tornar URLs arbitrárias o padrão.

Critério de saída: duas máquinas limpas conseguem instalar a mesma versão e
obter o mesmo conjunto verificado de arquivos e permissões.

### Fase 6 — Experiência para autores

- [ ] Criar `@tuiminal/plugin-sdk` documentado.
- [ ] Criar `@tuiminal/plugin-test`.
- [ ] Criar `tuiminal plugin create` ou `create-tuiminal-plugin`.
- [ ] Fornecer template com TypeScript, React, lint e testes.
- [ ] Criar modo de desenvolvimento com recarga segura.
- [ ] Escrever guias de tabs, comandos, configurações, traduções e permissões.
- [ ] Publicar exemplos pequenos e um plugin completo de referência.

Critério de saída: um desenvolvedor novo cria, testa e instala localmente uma tab
simples seguindo apenas a documentação pública.

### Fase 7 — Migração das ferramentas oficiais

Ordem inicial sugerida, sujeita a revisão:

1. HTTP.
2. Git.
3. Runner.
4. Free Terminal.
5. Database.

- [ ] Executar os mesmos testes de produto antes e depois de cada extração.
- [ ] Remover imports e branches específicos do núcleo após cada migração.
- [ ] Manter comandos isolados existentes compatíveis durante a transição.
- [ ] Garantir que plugins ocultos não inicializem processos ou conexões.
- [ ] Medir tempo de inicialização, memória e tamanho instalado por fase.

Critério de saída: todas as ferramentas oficiais usam somente o SDK público e
podem ser instaladas, desativadas e atualizadas separadamente.

### Fase 8 — Catálogo comunitário

- [ ] Definir requisitos mínimos de publicação e metadados.
- [ ] Descobrir inicialmente pacotes por nome/keyword sem exigir servidor próprio.
- [ ] Criar catálogo curado para plugins oficiais e verificados.
- [ ] Mostrar origem, mantenedor, versão, permissões e verificação na interface.
- [ ] Definir canal de denúncia, remoção e resposta a pacote comprometido.
- [ ] Avaliar assinatura de releases e transparência de checksums.

Critério de saída: o usuário distingue claramente plugins oficiais, verificados
e comunitários antes de instalar qualquer código.

### Fase 9 — Distribuição mínima

- [ ] Fazer o pacote principal iniciar sem plugins.
- [ ] Criar onboarding para instalação mínima, recomendada ou personalizada.
- [ ] Avaliar um pacote opcional com todas as ferramentas oficiais.
- [ ] Manter migração automática para instalações existentes.
- [ ] Documentar backup, restauração e remoção completa.

Critério de saída: uma instalação nova contém somente o núcleo e consegue montar
um workspace completo através do gerenciador de plugins.

## Validação obrigatória em cada fase

- `bun run check` continua sendo a barreira mínima.
- Toda API pública nova recebe testes de contrato.
- Toda correção de carregamento, foco, teardown ou permissão recebe regressão.
- Testar instalação em diretórios temporários, nunca na configuração real do
  usuário.
- Testar plugin válido, inválido, incompatível, desabilitado, removido e quebrado.
- Testar inicialização sem plugins e com múltiplos plugins.
- Testar colisão de IDs, atalhos e símbolos de tab.
- Testar atualização que adiciona ou remove permissões.
- Testar falha durante ativação e desativação.
- Medir cold start, uso de memória e tamanho antes e depois de cada migração.
- Validar macOS e Linux primeiro; definir o compromisso de Windows antes de
  congelar caminhos e processos da API versão 1.

## Decisões ainda abertas

- Plugins poderão renderizar React diretamente ou usarão componentes fornecidos
  pelo SDK?
- Qual parte da lógica será isolada em processos separados?
- NPM será a única origem pública inicialmente?
- Instalação via GitHub aceitará commit/tag fixo apenas?
- Como dividir atalhos globais entre uma quantidade variável de tabs?
- Haverá assinatura própria ou somente integridade do registry na primeira
  versão?
- O plugin poderá contribuir para uma ferramenta existente ou apenas criar tabs?
- Como será feito rollback de storage durante downgrade?
- Qual será a política de estabilidade e depreciação do SDK?
- O pacote mínimo e o pacote completo terão nomes diferentes?

Essas perguntas devem permanecer abertas até existirem protótipos e evidências.
Não escolher silenciosamente uma resposta apenas para manter este documento
inalterado.

## Itens fora do primeiro MVP

- Marketplace pago.
- Execução remota de plugins.
- Sincronização de plugins entre máquinas.
- Isolamento completo de interfaces arbitrárias de terceiros.
- Dependências compartilhadas livremente entre plugins.
- Atualizações automáticas sem revisão do usuário.

## Regra para manter este plano útil

Ao começar uma fase:

1. Revisar as hipóteses e decisões abertas relacionadas.
2. Atualizar o documento antes de implementar mudanças incompatíveis.
3. Marcar somente itens realmente concluídos.
4. Registrar decisões duráveis no `AGENTS.md`.
5. Atualizar o `README.md` apenas quando o comportamento já estiver disponível.

Alterar este plano faz parte do processo. A prioridade é manter uma direção clara
e verificável, não preservar decisões antigas que os testes ou o uso real
mostrarem inadequadas.
