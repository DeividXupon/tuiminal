import { afterEach, describe, expect, test } from "bun:test"
import {
  displayWidth,
  formatUiDateTime,
  getLanguage,
  isLanguage,
  padDisplayEnd,
  setLanguage,
  translateUi,
  truncateDisplay,
} from "../src/shared/i18n/index"

afterEach(() => setLanguage("pt-BR"))

describe("internationalization", () => {
  test("validates and changes supported languages", () => {
    expect(isLanguage("zh-CN")).toBe(true)
    expect(isLanguage("fr")).toBe(false)

    setLanguage("es")
    expect(getLanguage()).toBe("es")
    expect(translateUi("Registros")).toBe("Registros")
  })

  test("translates exact and dynamic UI text while preserving whitespace", () => {
    expect(translateUi("[Esc] Fechar", "en")).toBe("[Esc] Close")
    expect(translateUi("CONFIGURAÇÕES DO BANCO", "en")).toBe("DATABASE SETTINGS")
    expect(translateUi("CONFIGURAÇÕES GLOBAIS", "zh-CN")).toBe("全局设置")
    expect(translateUi("[Ctrl+F] Favoritas 3", "zh-CN")).toBe("[Ctrl+F] 收藏 3")
    expect(translateUi("  Célula  ", "ja")).toBe("  セル  ")
    expect(translateUi("[H/←] [L/→] navegação contextual · GRADE", "en")).toBe(
      "[H/←] [L/→] contextual navigation · GRID",
    )
    expect(translateUi("HISTÓRICO SQL", "es")).toBe("HISTORIAL SQL")
    expect(translateUi("100 leituras recentes · alterações por 6 meses.", "en")).toBe(
      "100 recent reads · changes for 6 months.",
    )
    expect(translateUi("[S] Ocultar SELECT", "zh-CN")).toBe("[S] 隐藏 SELECT")
    expect(translateUi("[S] Mostrar SELECT", "ja")).toBe("[S] SELECTを表示")
    expect(translateUi("Leituras", "en")).toBe("Reads")
    expect(translateUi("Leituras recentes", "es")).toBe("Lecturas recientes")
    expect(translateUi("Alterações em 6 meses", "ko")).toBe("6개월간 변경")
    expect(translateUi("Alterações nos últimos 6 meses", "zh-CN")).toBe("最近 6 个月的更改")
    expect(translateUi("[Enter] Reexecutar", "zh-CN")).toBe("[Enter] 重新执行")
    expect(translateUi("◆ BUSCAR NA TABELA", "en")).toBe("◆ SEARCH TABLE")
    expect(translateUi("[Enter] Buscar", "zh-CN")).toBe("[Enter] 搜索")
    expect(translateUi("DADOS SENSÍVEIS", "en")).toBe("SENSITIVE DATA")
    expect(translateUi("16/64 termos", "es")).toBe("16/64 términos")
    expect(translateUi("[Ctrl+R] Restaurar padrão", "ko")).toBe("[Ctrl+R] 기본값 복원")
    expect(translateUi("⚠ SENSÍVEIS MASCARADOS  ·  ", "en")).toBe("⚠ SENSITIVE DATA MASKED  ·  ")
    expect(translateUi("⚠ [V] confirmar  ·  ", "es")).toBe("⚠ [V] confirmar visualización  ·  ")
    expect(translateUi("[Ctrl+X] Cancelar", "en")).toBe("[Ctrl+X] Cancel")
    expect(translateUi("[Ctrl+X]", "en")).toBe("[Ctrl+X]")
    expect(translateUi("[Ctrl+S] Salvar comando", "en")).toBe("[Ctrl+S] Save command")
    expect(translateUi("◆ Salvar comando [Ctrl+S]", "en")).toBe("◆ Save command [Ctrl+S]")
    expect(translateUi("PTY cria um terminal interativo ligado ao comando.", "es")).toBe(
      "PTY crea un terminal interactivo conectado al comando.",
    )
    expect(translateUi("8 COMANDOS  ·  2 ATIVOS  ·  3 GRUPO", "en")).toBe(
      "8 COMMANDS  ·  2 ACTIVE  ·  3 GROUP",
    )
    expect(translateUi("16 CMD  ·  6 ATIV", "en")).toBe("16 CMD  ·  6 ACT")
    expect(translateUi("6 ATIVOS  ·  2–4/6", "es")).toBe("6 ACTIVOS  ·  2–4/6")
    expect(translateUi("Escolher outra pasta", "en")).toBe("Choose another folder")
    expect(translateUi("[+] EXECUTAR EM OUTRO PROJETO…", "en")).toBe("[+] RUN IN ANOTHER PROJECT…")
    expect(translateUi("[+] Escolher projeto", "es")).toBe("[+] Elegir proyecto")
    expect(translateUi("Pressione [M] para voltar ao modo único.", "en")).toBe(
      "Press [M] to return to single view.",
    )
    expect(translateUi("[G] Rodar 3", "es")).toBe("[G] Ejecutar 3")
    expect(translateUi("[S] Histórico", "en")).toBe("[S] History")
    expect(translateUi("[H/←] Lista", "en")).toBe("[H/←] List")
    expect(translateUi("[J/K] Rolar", "en")).toBe("[J/K] Scroll")
    expect(translateUi("COMANDOS 8", "en")).toBe("COMMANDS 8")
    expect(translateUi("[P] ATIVOS 2", "es")).toBe("[P] ACTIVOS 2")
    expect(translateUi("SELEÇÃO EM GRUPO  ·  3 MARCADOS", "en")).toBe(
      "GROUP SELECTION  ·  3 MARKED",
    )
    expect(translateUi("3 execuções", "zh-CN")).toBe("3 次执行")
    expect(translateUi("● RODANDO · api", "en")).toBe("● RUNNING · api")
    expect(translateUi("Schema completo", "zh-CN")).toBe("完整架构")
    expect(translateUi("Nenhum relacionamento encontrado.", "ja")).toBe(
      "リレーションがありません。",
    )
    expect(translateUi("[Ctrl+Space] Selecionar página", "en")).toBe("[Ctrl+Space] Select page")
    expect(translateUi("[Ctrl+Space] Pg", "zh-CN")).toBe("[Ctrl+Space] 本页")
    expect(translateUi("[E] Editar 4", "zh-CN")).toBe("[E] 编辑 4 行")
    expect(translateUi("◆ EDITAR 3 LINHA(S)", "ja")).toBe("◆ 3行を編集")
    expect(translateUi("2 linha(s) copiadas como CSV.", "ko")).toBe(
      "2개 행을 CSV 형식으로 복사했습니다.",
    )
    expect(translateUi("Arquivo salvo em /tmp/users.csv", "es")).toBe(
      "Archivo guardado en /tmp/users.csv",
    )
    expect(translateUi("PARÂMETROS", "zh-CN")).toBe("参数")
    expect(translateUi("<mascarado>", "en")).toBe("<masked>")
    expect(translateUi("<mascarada [V]>", "es")).toBe("<oculta [V]>")
    expect(translateUi("<confirmar [V]>", "ko")).toBe("<확인 [V]>")
    expect(translateUi("TODOS OS PROJETOS DA CONTA", "en")).toBe("ALL ACCOUNT PROJECTS")
    expect(translateUi("DESCOBRINDO PROJETOS DA CONTA…", "es")).toBe(
      "DESCUBRIENDO PROYECTOS DE LA CUENTA…",
    )
    expect(translateUi("Sem filtros: buscando em todos os projetos da conta.", "zh-CN")).toBe(
      "无筛选器：搜索账户中的所有项目。",
    )
    expect(translateUi("… +3 parâmetro(s)", "ja")).toBe("… ほか3件")
    expect(
      translateUi("Reexecução desativada: alterações da grade exigem nova revisão.", "es"),
    ).toContain("requieren una nueva revisión")
  })

  test("measures, truncates, and pads wide characters", () => {
    expect(displayWidth("数据")).toBe(4)
    expect(truncateDisplay("数据表", 5)).toBe("数据…")
    expect(displayWidth(padDisplayEnd("数据", 6))).toBe(6)
  })

  test("formats dates with the configured UI locale", () => {
    const value = "2026-09-01T19:15:00"
    const options = {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    } as const
    expect(formatUiDateTime(value, options, "pt-BR")).toContain("01/09")
    expect(formatUiDateTime(value, options, "pt-BR")).not.toMatch(/AM|PM/)
    expect(formatUiDateTime(value, options, "en")).toContain("09/01")
    expect(formatUiDateTime(value, options, "en")).toMatch(/PM/)
    expect(formatUiDateTime("invalid", options, "pt-BR")).toBe("")
  })

  test("translates GitHub PR actions, safety reasons and diff navigation", () => {
    expect(translateUi("Aprovar com comentário", "en")).toBe("Approve with comment")
    expect(translateUi("cannot-approve-own-pr", "es")).toContain("propio PR")
    expect(translateUi("[W] Acompanhar CI", "ja")).toContain("CI を監視")
    expect(
      translateUi("Resultado remoto incerto. Verifique o PR antes de tentar novamente.", "zh-CN"),
    ).toContain("远程结果")
    expect(translateUi("[Ctrl+S] Confirmar", "ko")).toBe("[Ctrl+S] 확인")
    expect(
      translateUi("  ESTADO · REPOSITÓRIO / PR / TÍTULO · REVISÃO · CI · ALTERAÇÕES", "en"),
    ).toBe("  STATE · REPOSITORY / PR / TITLE · REVIEW · CI · CHANGES")
    expect(translateUi("Posição da prévia salva para este projeto.", "en")).toContain(
      "saved for this project",
    )
    expect(translateUi("right", "ja")).toBe("右")
    expect(translateUi("Workflow de fork aguarda autorização explícita.", "en")).toContain(
      "explicit approval",
    )
  })
})
