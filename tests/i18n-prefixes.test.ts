import { describe, expect, test } from "bun:test"
import { translateUi } from "../src/shared/i18n/index"

describe("translation prefixes", () => {
  test.each([
    ["pt-BR", "Erro", "ERRO", "Configurações"],
    ["en", "Error", "ERROR", "Settings"],
    ["es", "Error", "ERROR", "Configuración"],
    ["ja", "エラー", "エラー", "設定"],
    ["zh-CN", "错误", "错误", "设置"],
    ["ko", "오류", "오류", "설정"],
  ] as const)("preserves nested prefixes and whitespace in %s", (language, error, upper, label) => {
    expect(translateUi(" \tErro: \t⚠  ERRO: Configurações \r\n", language)).toBe(
      ` \t${error}: \t⚠  ${upper}: ${label} \r\n`,
    )
  })

  test("retains warning fallback patterns and catalog priority", () => {
    expect(translateUi("⚠ ⚠ 3 aplicado(s) antes da falha", "en")).toBe(
      "⚠ ⚠ 3 applied before failure",
    )
    expect(translateUi("Erro: ⚠ [V] confirmar  ·  ", "en")).toBe("Error: ⚠ [V] confirm reveal  ·  ")
    expect(translateUi("⚠ Lista vazia: mascaramento automático desativado.", "en")).toBe(
      "⚠ Empty list: automatic masking disabled.",
    )
    expect(translateUi("⚠ ⚠ sem-correspondencia-de-fixture", "en")).toBe(
      "⚠ ⚠ sem-correspondencia-de-fixture",
    )
  })

  test("does not unwrap other markers, incomplete prefixes, or multiline messages", () => {
    for (const source of [
      "◆ Erro: Configurações",
      "Erro:Configurações",
      "Erro: ",
      "⚠ ",
      "Erro: Configurações\nsegundo trecho",
      "⚠ Configurações\u2028segundo trecho",
    ]) {
      expect(translateUi(source, "en")).toBe(source)
    }
  })

  test.each([
    ["Erro: ", "Error: "],
    ["⚠ ", "⚠ "],
    ["Erro: ⚠ ", "Error: ⚠ "],
  ])(
    "translates deep %s chains without consuming the call stack",
    (source, expected) => {
      const depth = 50_000
      expect(translateUi(`${source.repeat(depth)}Configurações`, "en")).toBe(
        `${expected.repeat(depth)}Settings`,
      )
    },
    20_000,
  )
})
