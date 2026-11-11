import { expect, test } from "bun:test"
import { translateUi } from "../packages/core/src/i18n/index"
import { HTTP_OAUTH2_MESSAGES } from "../packages/core/src/i18n/http-oauth2-catalog"
import russian from "../packages/core/src/i18n/ru.json"

for (const [index, language] of (["pt-BR", "en", "es", "ja", "zh-CN", "ko"] as const).entries()) {
  test(`OAuth2 fixed messages are localized in ${language}`, () => {
    for (const row of HTTP_OAUTH2_MESSAGES) {
      const expected = row[index]
      if (!expected) throw new Error(`Missing OAuth2 translation for ${language}: ${row[0]}`)
      expect(translateUi(row[0], language)).toBe(expected)
    }
  })
}
test("OAuth2 has Russian translations", () => {
  for (const row of HTTP_OAUTH2_MESSAGES) {
    const expected = (russian as Record<string, string>)[row[1]]
    if (!expected) throw new Error(`Missing Russian OAuth2 translation: ${row[1]}`)
    expect(translateUi(row[0], "ru")).toBe(expected)
  }
})
