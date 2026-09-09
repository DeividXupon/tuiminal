import type { HttpPrivacyContext } from "../model/types"
import { combineHttpPrivacy } from "../model/secrets"

// Cookie Domain/Path matching is not an authorization to forward a credential
// learned at a different origin. Retain provenance for the entire redirect chain,
// including later same-origin hops that could otherwise reattach a stripped cookie.
export class HttpRedirectCookiePolicy {
  private origins = new Map<string, HttpPrivacyContext>()

  learn(origin: string, privacy: HttpPrivacyContext) {
    this.origins.set(origin, combineHttpPrivacy(this.origins.get(origin), privacy))
  }

  header(origin: string, cookies: string | undefined) {
    if (!cookies) return undefined
    const foreign = combineHttpPrivacy(
      ...[...this.origins].filter(([source]) => source !== origin).map(([, privacy]) => privacy),
    )
    return (
      cookies
        .split("; ")
        .filter((cookie) => foreign.redactText(cookie) === cookie)
        .join("; ") || undefined
    )
  }
}
