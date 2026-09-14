import type { HttpRedirectAuthorizer } from "../model/redirect-policy"
import { HttpInsecureTlsApprovalError } from "../model/tls-policy"

const PRIVATE_FLAG = "--allow-private-redirect-to"
const HTTP_FLAG = "--allow-http-redirect-to"

function permittedOrigin(value: string | undefined, httpOnly: boolean) {
  try {
    if (!value) throw new Error()
    const url = new URL(value)
    if (
      !["http:", "https:"].includes(url.protocol) ||
      (httpOnly && url.protocol !== "http:") ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    )
      throw new Error()
    return url.origin
  } catch {
    throw new Error(
      "Informe uma origem HTTP/HTTPS exata, sem caminho, credenciais, query ou fragmento; downgrade exige HTTP.",
    )
  }
}

export function parseHttpRedirectFlags(args: string[]) {
  const privateOrigins = new Set<string>()
  const httpOrigins = new Set<string>()
  const filtered: string[] = []
  for (let index = 0; index < args.length; index++) {
    const argument = args[index]
    if (argument === PRIVATE_FLAG || argument === HTTP_FLAG) {
      const target = permittedOrigin(args[++index], argument === HTTP_FLAG)
      ;(argument === PRIVATE_FLAG ? privateOrigins : httpOrigins).add(target)
    } else if (argument !== undefined) filtered.push(argument)
  }
  const authorize: HttpRedirectAuthorizer = (approval) => {
    if (approval.risks.includes("insecure-tls"))
      throw new HttpInsecureTlsApprovalError(approval.toOrigin)
    return approval.risks.every((risk) =>
      risk === "downgrade"
        ? httpOrigins.has(approval.toOrigin)
        : privateOrigins.has(approval.toOrigin),
    )
  }
  return { args: filtered, authorize }
}
