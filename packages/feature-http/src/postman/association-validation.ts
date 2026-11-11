import type { ParsedHttpFile } from "../model/http-file"
import type { PostmanProvenance } from "./provenance"

export function hasLegacyIncompletePostmanLinks(file: ParsedHttpFile, metadata: PostmanProvenance) {
  return metadata.requestMappingVersion !== 2 && metadata.entries.length < file.requests.length
}

export function assertPostmanRequestLinks(file: ParsedHttpFile, metadata: PostmanProvenance) {
  if (hasLegacyIncompletePostmanLinks(file, metadata))
    throw new Error("Associação Postman inválida. Importe a coleção novamente.")
}
