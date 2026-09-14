export type HttpInsecureTlsApproval = {
  key: string
  target: string
  environmentName: string | null
}

export type HttpInsecureTlsAuthorizer = boolean | ((url: string) => boolean)

function targetOrigin(url: string) {
  try {
    return new URL(url).origin
  } catch {
    return "destino inválido"
  }
}

export function httpInsecureTlsApproval(
  url: string,
  environmentName: string | null,
): HttpInsecureTlsApproval {
  const target = targetOrigin(url)
  return {
    key: `${environmentName ?? "__no_environment__"}\n${target}`,
    target,
    environmentName,
  }
}

export function allowsInsecureTls(authorizer: HttpInsecureTlsAuthorizer, url: string) {
  return typeof authorizer === "function" ? authorizer(url) : authorizer
}

export class HttpInsecureTlsApprovalError extends Error {
  readonly kind = "tls" as const
  readonly target: string

  constructor(readonly url: string) {
    const target = targetOrigin(url)
    super(`TLS inseguro para ${target} exige confirmação nesta sessão.`)
    this.name = "HttpInsecureTlsApprovalError"
    this.target = target
  }
}
