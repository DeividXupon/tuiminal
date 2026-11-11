import { afterEach, expect, test } from "bun:test"
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import ts from "typescript"
import {
  displayWidth,
  formatUiDateTime,
  getLanguage,
  isLanguage,
  LANGUAGE_OPTIONS,
  setLanguage,
  translateUi,
  truncateDisplay,
} from "../packages/core/src/i18n/index"
import messages from "../packages/core/src/i18n/ru.json"
import {
  getUiSettings,
  initializeUiSettings,
  UI_SETTINGS_PATH,
  updateUiSettings,
} from "../packages/core/src/settings/theme"

const initialSettings = getUiSettings()
afterEach(() => {
  updateUiSettings(initialSettings)
  setLanguage(initialSettings.language)
})

test("offers Russian and persists it across settings initialization", () => {
  expect(LANGUAGE_OPTIONS.find(({ id }) => id === "ru")).toEqual({
    id: "ru",
    nativeName: "Русский",
    shortName: "RU",
  })
  expect(isLanguage("ru")).toBe(true)
  updateUiSettings({ language: "ru" })
  expect(JSON.parse(readFileSync(UI_SETTINGS_PATH, "utf8")).language).toBe("ru")
  setLanguage("en")
  initializeUiSettings()
  expect(getUiSettings().language).toBe("ru")
  expect(getLanguage()).toBe("ru")
  expect(translateUi("Configurações")).toBe("Настройки")
})

test("covers every message and pattern template without losing shortcuts or data placeholders", () => {
  const directory = join(import.meta.dir, "../packages/core/src/i18n")
  const englishTemplates = new Set<string>()
  const catalog: Readonly<Record<string, string>> = messages
  for (const file of readdirSync(directory).filter((name) => name.endsWith(".ts"))) {
    const source = ts.createSourceFile(
      file,
      readFileSync(join(directory, file), "utf8"),
      ts.ScriptTarget.Latest,
      true,
    )
    const visit = (node: ts.Node) => {
      if (
        ts.isArrayLiteralExpression(node) &&
        node.elements.length >= 6 &&
        node.elements.slice(1).every(ts.isStringLiteral)
      ) {
        const english = node.elements[1]
        if (!english || !ts.isStringLiteral(english)) throw new Error("Missing English template")
        englishTemplates.add(english.text)
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
  }
  expect(englishTemplates.size).toBeGreaterThan(3500)
  expect(Object.keys(catalog).sort()).toEqual([...englishTemplates].sort())
  for (const english of englishTemplates) {
    const russian = catalog[english]
    expect(russian, english).toBeString()
    expect(russian?.trim().length, english).toBeGreaterThan(0)
    const shortcuts = (text: string) =>
      [...text.matchAll(/\[[^\]\n]*\]/g)].map(([key]) => key).sort()
    expect(shortcuts(russian ?? ""), english).toEqual(shortcuts(english))
    const placeholders = (text: string) =>
      [...text.matchAll(/\$\d+|\{\{?\w+\}?\}/g)].map(([key]) => key).sort()
    // The second capture is the Portuguese plural suffix, not user data.
    const expected = placeholders(english === "$1 field$2" ? "$1" : english)
    expect(placeholders(russian ?? ""), english).toEqual(expected)
  }
})

test.each([
  ["CONFIGURAÇÕES GLOBAIS", "ГЛОБАЛЬНЫЕ НАСТРОЙКИ"],
  ["BANCO", "БАЗА ДАННЫХ"],
  ["◆ REVISAR ALTERAÇÕES SQL", "◆ ПРОВЕРКА ИЗМЕНЕНИЙ SQL"],
  ["Feche as aspas na query do GitHub.", "Закройте кавычки в запросе GitHub."],
  ["Texto selecionado copiado.", "Выделенный текст скопирован."],
  ["Coleções 2/5…", "Коллекции 2/5…"],
  ["Terminal 42", "Терминал 42"],
  ["1 campo", "полей: 1"],
  ["5 campos", "полей: 5"],
  ["Arquivo salvo em /tmp/Configurações.csv", "Файл сохранён в /tmp/Configurações.csv"],
  ["A variável customer_token não foi definida.", "Переменная customer_token не определена."],
] as const)("translates %s into Russian", (source, expected) => {
  expect(translateUi(source, "ru")).toBe(expected)
})

test("preserves whitespace, nested prefixes, unknown text and data in Russian", () => {
  expect(translateUi(" \tErro: ⚠ ERRO: Configurações \r\n", "ru")).toBe(
    " \tОшибка: ⚠ ОШИБКА: Настройки \r\n",
  )
  expect(translateUi("⚠ ⚠ 3 aplicado(s) antes da falha", "ru")).toBe("⚠ ⚠ Применено до сбоя: 3")
  for (const text of ["SELECT имя FROM users", "customer-token-123", "  ", "", "◆ unknown-value"])
    expect(translateUi(text, "ru")).toBe(text)
})

test("formats Russian dates and measures Cyrillic without splitting graphemes", () => {
  setLanguage("ru")
  const date = new Date("2026-10-22T14:05:00Z")
  const options: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }
  expect(formatUiDateTime(date, options)).toBe(date.toLocaleString("ru-RU", options))
  expect(formatUiDateTime(date, options)).toContain("октября")
  expect(displayWidth("Русский")).toBe(7)
  expect(truncateDisplay("Русский", 5)).toBe("Русс…")
  expect(truncateDisplay("и\u0306ога", 2)).toBe("и\u0306…")
})
