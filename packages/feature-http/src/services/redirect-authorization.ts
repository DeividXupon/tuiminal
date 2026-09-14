import {
  HttpRedirectError,
  HTTP_REDIRECT_DENIED,
  HTTP_REDIRECT_REQUIRED,
  type HttpRedirectApproval,
  type HttpRedirectAuthorizer,
} from "../model/redirect-policy"

export async function authorizeHttpRedirect(
  approval: HttpRedirectApproval,
  signal: AbortSignal,
  authorize?: HttpRedirectAuthorizer,
) {
  signal.throwIfAborted()
  if (!approval.risks.length) return
  if (!authorize) throw new HttpRedirectError(HTTP_REDIRECT_REQUIRED)
  const allowed = await new Promise<boolean>((resolve, reject) => {
    const aborted = () => reject(signal.reason)
    signal.addEventListener("abort", aborted, { once: true })
    Promise.resolve()
      .then(() => {
        signal.throwIfAborted()
        return authorize(approval, signal)
      })
      .then((value) => resolve(value === true), reject)
      .finally(() => signal.removeEventListener("abort", aborted))
  })
  signal.throwIfAborted()
  if (!allowed)
    throw new HttpRedirectError(
      approval.hop === 0
        ? "Requisição não autorizada. Nenhum envio foi feito para este request."
        : HTTP_REDIRECT_DENIED,
    )
}
