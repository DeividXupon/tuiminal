import type { HttpResponseSnapshot } from "../model/types"
import {
  atomicWriteProjectFile,
  ProjectFileSafetyError,
} from "../../../shared/storage/project-files"

function safeStem(value: string) {
  return (
    value
      .normalize("NFKD")
      .replace(/[^\w.-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "response"
  )
}

function responseExtension(response: HttpResponseSnapshot) {
  if (response.bodyKind === "json") return "json"
  if (response.bodyKind === "xml") return "xml"
  if (response.bodyKind === "html") return "html"
  if (response.bodyKind === "text") return "txt"
  const subtype = response.contentType.split(";")[0]?.split("/")[1]?.trim().toLowerCase()
  return subtype && /^[a-z0-9.+-]{1,16}$/.test(subtype) ? subtype.replace(/^x-/, "") : "bin"
}

function timestampForFile(date: Date) {
  return date.toISOString().replace(/[:.]/g, "-")
}

export async function saveCapturedHttpResponse(
  root: string,
  requestName: string,
  response: HttpResponseSnapshot,
  now = new Date(),
) {
  const stem = `${safeStem(requestName)}-${timestampForFile(now)}`
  const extension = responseExtension(response)
  for (let suffix = 0; suffix < 1_000; suffix += 1) {
    const relativePath = `tuiminal-exports/http/${stem}${suffix ? `-${suffix + 1}` : ""}.${extension}`
    try {
      return await atomicWriteProjectFile(root, relativePath, response.body, {
        expectedHash: null,
        exclusive: true,
      })
    } catch (error) {
      if (
        (error as NodeJS.ErrnoException).code !== "EEXIST" &&
        !(error instanceof ProjectFileSafetyError && error.message.includes("existir"))
      ) {
        throw error
      }
    }
  }
  throw new Error("Não foi possível escolher um nome livre para salvar a resposta.")
}
