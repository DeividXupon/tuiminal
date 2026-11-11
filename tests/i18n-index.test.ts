import { expect, test } from "bun:test"

test("indexes translation sources once and switches languages without rebuilding the index", () => {
  const moduleUrl = new URL("../packages/core/src/i18n/index.ts", import.meta.url).href
  const script = `
    const NativeMap = globalThis.Map;
    const maps = [];
    globalThis.Map = class extends NativeMap {
      constructor(entries) { super(entries); maps.push(this); }
    };
    try {
      const ui = await import(${JSON.stringify(moduleUrl)});
      const translations = [];
      for (const language of ["pt-BR", "en", "es", "ja", "zh-CN", "ko", "ru", "en"]) {
        ui.setLanguage(language);
        translations.push(ui.translateUi("  CONFIGURAÇÕES GLOBAIS  "));
      }
      const indexes = maps.filter((map) => map.has("CONFIGURAÇÕES GLOBAIS"));
      console.log(JSON.stringify({
        indexes: indexes.length,
        sizes: indexes.map((map) => map.size),
        translations,
        marked: ui.translateUi("◆ CONFIGURAÇÕES GLOBAIS"),
        unknown: ui.translateUi("arbitrary-untranslated-fixture"),
        dynamic: ui.translateUi("Terminal 42", "ja"),
      }));
    } finally {
      globalThis.Map = NativeMap;
    }
  `
  const child = Bun.spawnSync([process.execPath, "-e", script], {
    env: process.env,
    stdout: "pipe",
    stderr: "pipe",
  })
  expect(child.exitCode).toBe(0)
  expect(child.stderr.toString()).toBe("")
  const result = JSON.parse(child.stdout.toString()) as {
    indexes: number
    sizes: number[]
    translations: string[]
    marked: string
    unknown: string
    dynamic: string
  }
  expect(result.translations).toEqual([
    "  CONFIGURAÇÕES GLOBAIS  ",
    "  GLOBAL SETTINGS  ",
    "  CONFIGURACIÓN GLOBAL  ",
    "  グローバル設定  ",
    "  全局设置  ",
    "  전역 설정  ",
    "  ГЛОБАЛЬНЫЕ НАСТРОЙКИ  ",
    "  GLOBAL SETTINGS  ",
  ])
  expect(result.marked).toBe("◆ GLOBAL SETTINGS")
  expect(result.unknown).toBe("arbitrary-untranslated-fixture")
  expect(result.dynamic).toBe("ターミナル 42")
  expect(result.indexes).toBe(1)
  expect(result.sizes[0]).toBeGreaterThan(1000)
})

test("indexes only trimmed sources because translateUi looks up trimmed text", () => {
  const moduleUrl = new URL("../packages/core/src/i18n/index.ts", import.meta.url).href
  const script = `
    const NativeMap = globalThis.Map;
    const maps = [];
    globalThis.Map = class extends NativeMap {
      constructor(entries) { super(entries); maps.push(this); }
    };
    try {
      const ui = await import(${JSON.stringify(moduleUrl)});
      ui.translateUi("CONFIGURAÇÕES GLOBAIS", "en");
      const index = maps.find((map) => map.has("CONFIGURAÇÕES GLOBAIS"));
      console.log(JSON.stringify([...index.keys()].filter((key) => key !== key.trim())));
    } finally {
      globalThis.Map = NativeMap;
    }
  `
  const child = Bun.spawnSync([process.execPath, "-e", script], {
    env: process.env,
    stdout: "pipe",
    stderr: "pipe",
  })
  expect(child.stderr.toString()).toBe("")
  expect(JSON.parse(child.stdout.toString())).toEqual([])
})
