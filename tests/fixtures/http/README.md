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

Tuiminal also preserves explicitly named drafts: a `# @name` block whose first
content line contains only an HTTP method has an empty, editable URL. This keeps
URL-less Postman requests visible with distinct block IDs even when their names
repeat. Sending a draft fails URL validation before transport. Unsupported
protocols, scripts, and directives still make these blocks opaque. Parser and
Postman draft regressions cover this extension outside the JetBrains fixtures.

File and multipart bodies accept absolute paths, home-relative paths and local
file URLs from any directory, including symlinks to regular files. Ordinary
relative paths retain their execution-root base. Body file tests use owned
temporary files and local servers, retaining missing-file, directory and size checks.
Multiple file parts may share a field name. Postman `formdata.src` arrays expand
to one part per file. Serialization preserves their order and paths; transport
regenerates the multipart boundary to match the encoded body after reopening.

The `# @description` extension stores a JSON string before the request line.
Postman imports and the Docs editor use it for request documentation, including multiline
Markdown. Escaped newlines cannot create request blocks or executable directives.
Invalid JSON, non-string values, and descriptions after the request line remain
opaque. Missing documentation differs from an explicitly empty description so
older linked Postman requests can fetch documentation without rewriting the copy.

The Chaining extension keeps `# @extract name = $.path` and `# @extract-secret`
compatible. `# @extract-value` stores a JSON object with `name`, `jsonPath` and
`secret`, plus optional `source` (`jsonpath`, `header`, `status`) and `enabled`.
Header names use `jsonPath`; status ignores it. Disabled extractions remain editable
but do not validate or execute. Invalid JSON/schema and unknown fields stay opaque.
Explicit options and paths containing spaces survive serialization. `# @depends`
accepts stable request IDs; legacy names resolve within the same file first and
ambiguous names fail before transport. Chaining model and runner tests cover these
extensions with owned local fixtures and servers.
