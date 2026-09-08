# Matriz de compatibilidade `.http`

Estas fixtures registram a fronteira de compatibilidade do parser do Tuiminal com
o formato do JetBrains HTTP Client. Elas são dados locais e determinísticos: nenhum
host listado aqui deve ser acessado pelos testes.

| Fixture | Expectativa |
| --- | --- |
| `jetbrains-compatible.http` | nomes, comentários, variáveis, GET curto, URL multilinha, timeout, cookie jar, proxy e método customizado editáveis |
| `jetbrains-bodies.http` | JSON, form URL encoded, body por arquivo e multipart editáveis |
| `jetbrains-opaque-directives.http` | diretivas ainda não implementadas e timeout inválido permanecem opacos |
| `jetbrains-opaque-scripts.http` | pre-request scripts, response handlers e redirects de saída permanecem opacos |
| `jetbrains-opaque-protocols.rest` | versão HTTP explícita e protocolos da Fase 5 permanecem opacos |
| `import/postman-v2.1.json` | herança, secrets, URL estruturada, scripts, bodies e perdas do Postman v2.1 |
| `import/openapi-3.0.json` | refs locais, overrides, servers, segurança e JSON do OpenAPI 3.0 |
| `import/openapi-3.1.yaml` | path item por ref, forms, multipart, refs externas e webhooks do OpenAPI 3.1 |

Referências de sintaxe:

- https://www.jetbrains.com/help/idea/exploring-http-syntax.html
- https://www.jetbrains.com/help/idea/http-client-in-product-code-editor.html
- https://www.jetbrains.com/help/idea/http-client-variables.html

Ao ampliar suporte, mova o caso correspondente da expectativa opaca para a
compatível somente depois que parse, execução e serialização lossless estiverem
cobertos. Nunca reduza a matriz para fazer um parser parcial parecer compatível.

As fixtures em `import/` também nunca fazem rede. Elas combinam recursos suportados
e perdas conhecidas para que a prévia explique o que será convertido antes de
qualquer escrita no projeto.
