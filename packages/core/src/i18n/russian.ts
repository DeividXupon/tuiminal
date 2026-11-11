import messages from "./ru.json"

// Extend the existing tuples once, preserving their order and source precedence.
// English templates are keys only; user data never passes through this catalog.
const translations = new Map<string, string>(Object.entries(messages))

export function withRussianTranslation<T extends readonly [string | RegExp, string, ...string[]]>(
  message: T,
): readonly [...T, string] {
  return [...message, translations.get(message[1]) ?? message[1]]
}
