import type { HttpRequestDefinition } from "../model/types"

type RequestSettings = Pick<HttpRequestDefinition, "options" | "assertions" | "chain">

export function liveRequestOptions({ options }: Pick<RequestSettings, "options">) {
  return {
    timeoutMs: options.timeoutMs,
    followRedirects: options.followRedirects,
    cookieJar: options.cookieJar ?? true,
    tlsVerification: options.tlsVerification ?? "strict",
    noLog: options.noLog ?? false,
    timeoutExplicit: options.timeoutExplicit ?? false,
    followRedirectsExplicit: options.followRedirectsExplicit ?? false,
    proxy: options.proxy?.trim() || undefined,
  }
}

function liveRequestChain({ chain }: RequestSettings) {
  return { dependsOn: chain?.dependsOn || undefined, extract: chain?.extract ?? [] }
}

function equal(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right)
}

export function assertLivePostmanSettingsUnchanged(
  request: RequestSettings,
  saved: RequestSettings,
) {
  if (!equal(liveRequestOptions(saved), liveRequestOptions(request)))
    throw new Error(
      "Opções alteradas não podem ser salvas no Postman. Restaure os valores originais em Opções e tente novamente.",
    )
  if (!equal(saved.assertions ?? [], request.assertions ?? []))
    throw new Error(
      "Assertions do Tuiminal não podem ser salvas no Postman. Remova-as em Assertions e tente novamente.",
    )
  if (!equal(liveRequestChain(saved), liveRequestChain(request)))
    throw new Error(
      "Chaining do Tuiminal não pode ser salvo no Postman. Remova a dependência e as extrações em Chaining e tente novamente.",
    )
}
