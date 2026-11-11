import { createHttpMultipartPart } from "./key-value"
import type { HttpRequestDefinition } from "./types"

export function applyHttpFileSelection(request: HttpRequestDefinition, paths: string[]) {
  if (request.body.kind === "file" && paths.length <= 1) {
    return { body: { ...request.body, filePath: paths[0] ?? "" }, headers: request.headers }
  }
  const multipart = request.body.kind === "multipart" ? (request.body.multipart ?? []) : []
  return {
    body: {
      ...request.body,
      kind: "multipart" as const,
      multipart: [
        ...multipart,
        ...paths.map((value) => ({
          ...createHttpMultipartPart(request.id),
          kind: "file" as const,
          name: "file",
          value,
        })),
      ],
    },
    // Let the transport generate the boundary when converting a raw body to multipart.
    headers:
      request.body.kind === "multipart"
        ? request.headers
        : request.headers.filter(
            (header) => !header.enabled || header.name.trim().toLowerCase() !== "content-type",
          ),
  }
}
