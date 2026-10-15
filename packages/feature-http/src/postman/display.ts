export function postmanDisplayName(value: unknown) {
  if (typeof value !== "string") return ""
  return [...value]
    .map((character) => {
      const code = character.codePointAt(0) ?? 0
      return code < 32 || (code >= 127 && code <= 159) ? " " : character
    })
    .join("")
    .trim()
}
