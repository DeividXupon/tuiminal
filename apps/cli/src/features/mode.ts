declare const TUIMINAL_MINIMAL_BUILD: boolean

export const MINIMAL_BUILD = typeof TUIMINAL_MINIMAL_BUILD !== "undefined" && TUIMINAL_MINIMAL_BUILD

export function sourceFeaturesEnabled() {
  return !MINIMAL_BUILD && process.env.TUIMINAL_SOURCE_FEATURES === "1"
}
