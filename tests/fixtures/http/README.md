# `.http` compatibility matrix

These fixtures record Tuiminal's parser compatibility boundary with the JetBrains
HTTP Client format. They are deterministic local data: tests must never access any
host listed in them.

| Fixture | Expected behavior |
| --- | --- |
| `jetbrains-compatible.http` | Editable names, comments, variables, short GET, multiline URLs, timeout, cookie jar, proxy, and custom methods |
| `jetbrains-bodies.http` | Editable JSON, URL-encoded forms, file bodies, and multipart |
| `jetbrains-opaque-directives.http` | Unimplemented directives and invalid timeout values remain opaque |
| `jetbrains-opaque-scripts.http` | Pre-request scripts, response handlers, and output redirects remain opaque |
| `jetbrains-opaque-protocols.rest` | Explicit HTTP versions and Phase 5 protocols remain opaque |
| `import/postman-v2.1.json` | Postman v2.1 inheritance, secrets, structured URLs, scripts, bodies, and conversion losses |
| `import/openapi-3.0.json` | OpenAPI 3.0 local refs, overrides, servers, security, and JSON |
| `import/openapi-3.1.yaml` | OpenAPI 3.1 referenced path items, forms, multipart, external refs, and webhooks |

Syntax references:

- https://www.jetbrains.com/help/idea/exploring-http-syntax.html
- https://www.jetbrains.com/help/idea/http-client-in-product-code-editor.html
- https://www.jetbrains.com/help/idea/http-client-variables.html

When expanding support, move a case from opaque to compatible only after parsing,
execution, and lossless serialization are covered. Never reduce the matrix to make
a partial parser appear compatible.

The `import/` fixtures never access the network either. They combine supported
features and known losses so the preview explains conversion before any project write.
