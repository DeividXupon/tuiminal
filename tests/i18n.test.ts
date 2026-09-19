import { afterEach, describe, expect, spyOn, test } from "bun:test"
import { DATABASE_PRIVACY_MESSAGES } from "../packages/core/src/i18n/database-privacy-catalog"
import { GIT_COMPARE_TUTORIAL_MESSAGES } from "../packages/core/src/i18n/git-compare-tutorial-catalog"
import { GIT_CONFIGURATION_MESSAGES } from "../packages/core/src/i18n/git-configuration-catalog"
import { GIT_COMPARE_MESSAGES } from "../packages/core/src/i18n/git-compare-catalog"
import { GIT_BROWSER_MESSAGES } from "../packages/core/src/i18n/git-browser-catalog"
import { GIT_DIFFS_MESSAGES } from "../packages/core/src/i18n/git-diffs-catalog"
import { GIT_PR_MESSAGES } from "../packages/core/src/i18n/git-pr-catalog"
import { HTTP_WORKSPACE_SETTINGS_MESSAGES } from "../packages/core/src/i18n/http-workspace-settings-catalog"
import {
  displayWidth,
  formatUiDateTime,
  getLanguage,
  isLanguage,
  padDisplayEnd,
  setLanguage,
  translateUi,
  truncateDisplay,
} from "../packages/core/src/i18n/index"

afterEach(() => setLanguage("pt-BR"))

describe("internationalization", () => {
  test.each(["pt-BR", "en", "es", "ja", "zh-CN", "ko"] as const)(
    "translates grouped Git navigation in %s",
    (language) => {
      const index = ["pt-BR", "en", "es", "ja", "zh-CN", "ko"].indexOf(language)
      for (const message of GIT_COMPARE_MESSAGES.filter(([key]) =>
        ["LOCAL", "[C] DIFFS", "[C] COMPARAR"].includes(key),
      )) {
        const expected = message[index]
        if (!expected) throw new Error(`Missing Git navigation translation for ${language}`)
        expect(translateUi(message[0], language)).toBe(expected)
      }
    },
  )
  test.each([
    ["pt-BR", "Texto selecionado copiado."],
    ["en", "Selected text copied."],
    ["es", "Texto seleccionado copiado."],
    ["ja", "選択したテキストをコピーしました。"],
    ["zh-CN", "已复制所选文本。"],
    ["ko", "선택한 텍스트를 복사했습니다."],
  ] as const)("translates mouse selection copy feedback into %s", (language, expected) => {
    expect(translateUi("Texto selecionado copiado.", language)).toBe(expected)
  })
  test("translates the Postman source chooser and save destination", () => {
    expect(translateUi("ESCOLHA A ORIGEM HTTP", "en")).toBe("CHOOSE HTTP SOURCE")
    expect(translateUi("[L] Abrir local", "ja")).toBe("[L] ローカルを開く")
    expect(translateUi("SALVAR NO POSTMAN", "es")).toBe("GUARDAR EN POSTMAN")
    expect(translateUi("WORKSPACES POSTMAN", "en")).toBe("POSTMAN WORKSPACES")
    expect(translateUi("Coleções 2/5…", "en")).toBe("Collections 2/5…")
    expect(translateUi("2 coleções não puderam ser carregadas.", "en")).toBe(
      "2 collections could not be loaded.",
    )
  })
  test.each([
    ["pt-BR", "Não foi possível gravar o download completo."],
    ["en", "Could not write the complete download."],
    ["es", "No se pudo escribir la descarga completa."],
    ["ja", "ダウンロード全体を書き込めませんでした。"],
    ["zh-CN", "无法写入完整下载内容。"],
    ["ko", "전체 다운로드를 기록할 수 없습니다."],
  ] as const)("translates an incomplete HTTP download write into %s", (language, expected) => {
    expect(translateUi("Não foi possível gravar o download completo.", language)).toBe(expected)
  })
  test.each([
    ["pt-BR", "Feche as aspas na query do GitHub."],
    ["en", "Close the quoted text in the GitHub query."],
    ["es", "Cierra las comillas en la consulta de GitHub."],
    ["ja", "GitHub クエリの引用符を閉じてください。"],
    ["zh-CN", "请闭合 GitHub 查询中的引号。"],
    ["ko", "GitHub 쿼리의 따옴표를 닫으세요."],
  ] as const)("translates incomplete GitHub query feedback into %s", (language, expected) => {
    expect(translateUi("Feche as aspas na query do GitHub.", language)).toBe(expected)
  })
  test.each(["pt-BR", "en", "es", "ja", "zh-CN", "ko"] as const)(
    "translates incomplete GitHub CLI input into %s",
    (language) => {
      const message = "O GitHub CLI encerrou antes de receber toda a entrada."
      const catalog = GIT_PR_MESSAGES.find(([key]) => key === message)
      const index = ["pt-BR", "en", "es", "ja", "zh-CN", "ko"].indexOf(language)
      const expected = catalog?.[index]
      if (!expected) throw new Error(`Missing GitHub input translation for ${language}`)
      expect(translateUi(message, language)).toBe(expected)
    },
  )
  test.each(["pt-BR", "en", "es", "ja", "zh-CN", "ko"] as const)(
    "translates the HTTP body policy and preparation failure into %s",
    (language) => {
      const messages = HTTP_WORKSPACE_SETTINGS_MESSAGES.filter(
        ([message]) =>
          message.startsWith("Com segredos conhecidos,") ||
          message.startsWith("Não foi possível preparar a requisição"),
      )
      expect(messages).toHaveLength(2)
      const index = ["pt-BR", "en", "es", "ja", "zh-CN", "ko"].indexOf(language)
      for (const catalog of messages) {
        const expected = catalog[index]
        if (!expected) throw new Error(`Missing HTTP privacy translation for ${language}`)
        expect(translateUi(catalog[0], language)).toBe(expected)
      }
    },
  )
  test.each(["en", "es", "ja", "zh-CN", "ko"] as const)(
    "translates every Git configuration message into %s",
    (language) => {
      const index = ["pt-BR", "en", "es", "ja", "zh-CN", "ko"].indexOf(language)
      for (const catalog of [...GIT_CONFIGURATION_MESSAGES, ...GIT_BROWSER_MESSAGES]) {
        const source = catalog[0]
        const expected = catalog[index]
        if (!source || !expected)
          throw new Error(`Missing Git configuration translation for ${language}`)
        expect(translateUi(source, language)).toBe(expected)
      }
    },
  )
  test.each(["en", "es", "ja", "zh-CN", "ko"] as const)(
    "translates every database privacy message into %s",
    (language) => {
      for (const [message] of DATABASE_PRIVACY_MESSAGES)
        expect(translateUi(message, language)).not.toBe(message)
    },
  )
  test.each(["en", "es", "ja", "zh-CN", "ko"] as const)(
    "translates every Git Diffs command message into %s",
    (language) => {
      const index = ["pt-BR", "en", "es", "ja", "zh-CN", "ko"].indexOf(language)
      for (const catalog of GIT_DIFFS_MESSAGES) {
        const expected = catalog[index]
        if (!expected) throw new Error(`Missing Git Diffs translation for ${language}`)
        expect(translateUi(catalog[0], language)).toBe(expected)
      }
    },
  )
  test.each(["en", "es", "ja", "zh-CN", "ko"] as const)(
    "translates every Git Compare tutorial message into %s",
    (language) => {
      const index = ["pt-BR", "en", "es", "ja", "zh-CN", "ko"].indexOf(language)
      for (const catalog of GIT_COMPARE_TUTORIAL_MESSAGES) {
        const expected = catalog[index]
        if (!expected) throw new Error(`Missing Git Compare tutorial translation for ${language}`)
        expect(translateUi(catalog[0], language)).toBe(expected)
      }
    },
  )
  test.each(["en", "es", "ja", "zh-CN", "ko"] as const)(
    "translates the conservative SQL safety explanation into %s",
    (language) => {
      const message =
        "Esta conexão está em somente leitura. Comandos com efeitos, SELECT INTO e rotinas não reconhecidas exigem escrita habilitada."
      expect(translateUi(message, language)).not.toBe(message)
      expect(translateUi(message, language)).toContain("SELECT INTO")
    },
  )
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
    expect(translateUi("CONFIGURAÇÕES DO GIT", "en")).toBe("GIT SETTINGS")
    expect(translateUi("APARÊNCIA", "en")).toBe("APPEARANCE")
    expect(translateUi("SALVAMENTO AUTOMÁTICO", "es")).toBe("GUARDADO AUTOMÁTICO")
    expect(translateUi("[H/L/←/→] alterar", "en")).toBe("[H/L/←/→] change")
    expect(translateUi("[J/K/↑/↓] categoria · [H/L/←/→] opção · [Enter] abrir", "en")).toBe(
      "[J/K/↑/↓] category · [H/L/←/→] option · [Enter] open",
    )
    expect(translateUi("[1] Diffs", "ja")).toBe("[1] Diff")
    expect(translateUi("[4] Repositórios", "ja")).toBe("[4] リポジトリ")
    expect(translateUi("[Ctrl+P] Alterar projeto/branch", "en")).toBe(
      "[Ctrl+P] Change project/branch",
    )
    expect(translateUi("PROJETO LOCAL", "ko")).toBe("로컬 프로젝트")
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
    expect(translateUi("SUCESSO", "ja")).toBe("成功")
    expect(translateUi("Banco · Escrita", "zh-CN")).toBe("数据库 · 写入")
    expect(translateUi("api iniciado em projeto.", "en")).toBe("api started in projeto.")
    expect(translateUi("build: processo concluído.", "ko")).toBe(
      "build: 프로세스가 완료되었습니다.",
    )
    expect(translateUi("GET health: request cancelado.", "es")).toBe(
      "GET health: solicitud cancelada.",
    )
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
    expect(translateUi("[N] EXECUTAR EM OUTRO PROJETO…", "en")).toBe("[N] RUN IN ANOTHER PROJECT…")
    expect(translateUi("[N] Escolher projeto", "es")).toBe("[N] Elegir proyecto")
    expect(translateUi("O download foi recusado pelo servidor com status HTTP 404.", "en")).toBe(
      "The server refused the download with HTTP status 404.",
    )
    expect(translateUi("O download excede o limite de 256 MB.", "ja")).toBe(
      "ダウンロードが256 MBの上限を超えています。",
    )
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
    expect(translateUi("[Alt+Space] Selecionar intervalo", "en")).toBe("[Alt+Space] Select range")
    expect(translateUi("[Alt+Space] Sel", "zh-CN")).toBe("[Alt+Space] 选择")
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
    expect(translateUi("Copiar linha", "en")).toBe("Copy line")
    expect(translateUi("Assertions 4 ×1", "ja")).toBe("アサーション 4 ×1")
    expect(translateUi("Nenhuma assertion definida para este request.", "zh-CN")).toBe(
      "此请求未定义断言。",
    )
    expect(translateUi("SELEÇÃO COPIADA", "ko")).toBe("선택 영역 복사됨")
    expect(translateUi("[I] Importar cURL", "en")).toBe("[I] Import cURL")
    expect(translateUi("MULTIPART", "es")).toBe("MULTIPART")
    expect(translateUi("CAMINHO DO ARQUIVO", "ja")).toBe("ファイルパス")
    expect(translateUi("cURL IMPORTADO EM UMA NOVA TAB", "zh-CN")).toBe("已将 cURL 导入新标签页")
    expect(translateUi("A variável token não foi definida.", "en")).toBe(
      "Variable token is not defined.",
    )
    expect(
      translateUi("O arquivo api.http mudou fora do Tuiminal; revise antes de salvar.", "ko"),
    ).toBe("api.http 파일이 Tuiminal 외부에서 변경되었습니다. 저장하기 전에 검토하세요.")
    expect(translateUi("IMPORTAR COLEÇÃO", "en")).toBe("IMPORT COLLECTION")
    expect(translateUi("FORMATO DETECTADO", "ja")).toBe("検出した形式")
    expect(translateUi("IMPORTADOS 4 · IGNORADOS 1 · AVISOS 2 · CONFLITOS 0", "zh-CN")).toBe(
      "已导入 4 · 已忽略 1 · 警告 2 · 冲突 0",
    )
    expect(translateUi("COLEÇÃO IMPORTADA · api/imported.http", "ko")).toBe(
      "컬렉션 가져옴 · api/imported.http",
    )
    expect(translateUi("EXECUTAR COLEÇÃO", "en")).toBe("RUN COLLECTION")
    expect(translateUi("[T] Alvo: TODOS", "ja")).toBe("[T] 対象: すべて")
    expect(translateUi("[C] Concorrência: 4", "zh-CN")).toBe("[C] 并发数：4")
    expect(translateUi("Dataset não encontrado: cases.json.", "ko")).toBe(
      "데이터셋을 찾을 수 없습니다: cases.json.",
    )
    expect(translateUi("Assertions", "zh-CN")).toBe("断言")
    expect(translateUi("CHAINING DO REQUEST", "ja")).toBe("リクエストチェーン")
    expect(translateUi("Nenhuma extração configurada.", "en")).toBe("No extractions configured.")
    expect(translateUi("Assertion inválida: expect magic.", "es")).toBe(
      "Assertion no válida: expect magic.",
    )
    expect(translateUi("CHAIN EXECUTADO · 2 REQUESTS", "ko")).toBe("체인 실행됨 · 요청 2개")
    expect(translateUi("Aceita métodos personalizados, como PROPFIND.", "en")).toBe(
      "Accepts custom methods such as PROPFIND.",
    )
    expect(translateUi("[T] Timeout: 30s", "zh-CN")).toBe("[T] 超时：30s")
    expect(translateUi("O tempo limite de 250 ms foi excedido.", "en")).toBe(
      "The 250 ms timeout was exceeded.",
    )
    expect(translateUi("[L] Histórico: não registrar", "en")).toBe("[L] History: do not record")
    expect(translateUi("Preview", "zh-CN")).toBe("预览")
    expect(translateUi("REQUISIÇÃO PREPARADA", "ja")).toBe("準備済みリクエスト")
    expect(translateUi("Valores privados permanecem mascarados neste preview.", "ko")).toBe(
      "비공개 값은 이 미리보기에서도 가려집니다.",
    )
    expect(translateUi("[Q] Sair sem salvar", "en")).toBe("[Q] Exit without saving")
    expect(translateUi("CONFLITO EXTERNO", "en")).toBe("EXTERNAL CONFLICT")
    expect(translateUi("[L] Aplicar versão local", "zh-CN")).toBe("[L] 应用本地版本")
    expect(translateUi("VERSÃO LOCAL SALVA COMO CÓPIA", "ko")).toBe(
      "로컬 버전을 사본으로 저장했습니다",
    )
    expect(translateUi("[N] Novo ambiente privado", "en")).toBe("[N] New private environment")
    expect(translateUi("2 privado(s)", "zh-CN")).toBe("2 个私密值")
    expect(translateUi("A variável token já existe no ambiente privado local.", "es")).toBe(
      "La variable token ya existe en el ambiente privado local.",
    )
    expect(translateUi("[Ctrl+K] ◆ Guardar no keychain", "en")).toBe(
      "[Ctrl+K] ◆ Store in credential manager",
    )
    expect(translateUi("[W] Defaults do workspace", "en")).toBe("[W] Workspace defaults")
    expect(translateUi("[E] Ambiente padrão: nenhum", "zh-CN")).toBe("[E] 默认环境：无")
    expect(translateUi("[E] Ambiente padrão: local", "ja")).toBe("[E] 既定の環境: local")
    expect(translateUi("[T] Timeout: padrão do request", "ko")).toBe("[T] 시간 제한: 요청 기본값")
    expect(translateUi("[R] Redirects: seguir", "es")).toBe("[R] Redirecciones: seguir")
    expect(translateUi("[T] Timeout: herdar", "en")).toBe("[T] Timeout: inherit")
    expect(translateUi("[R] Redirects: herdar", "ko")).toBe("[R] 리디렉션: 상속")
    expect(
      translateUi(
        "Este request usa recursos .http que o Tuiminal ainda não executa com segurança.",
        "en",
      ),
    ).toBe("This request uses .http features that Tuiminal cannot execute safely yet.")
    expect(translateUi("[M] ◆ Histórico persistente", "en")).toBe("[M] ◆ Persistent history")
    expect(
      translateUi(
        "O header Authorization contém credenciais e não pode ser salvo no workspace.",
        "zh-CN",
      ),
    ).toBe("请求头 Authorization 包含凭据，无法保存到工作区。")
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
    expect(translateUi("Responder comentário", "en")).toBe("Reply to comment")
    expect(translateUi("[E] Reagir", "ko")).toBe("[E] 반응")
    expect(translateUi("[E] Nova reação", "en")).toBe("[E] New reaction")
    expect(translateUi("ESCOLHA UMA REAÇÃO", "zh-CN")).toBe("选择回应")
  })

  test("translates GitHub Issues layout, actions and safety reasons", () => {
    expect(translateUi("Criadas por mim", "en")).toBe("Created by me")
    expect(translateUi("Atribuídas a mim", "es")).toBe("Asignadas a mí")
    expect(translateUi("[E] Expandir descrição", "ja")).toContain("説明")
    expect(translateUi("◆ AÇÕES DA ISSUE", "zh-CN")).toBe("◆ ISSUE 操作")
    expect(translateUi("cannot-update-issue", "ko")).toContain("업데이트")
    expect(
      translateUi(
        "[J/K] Navegar  [H/L] Foco  [A←] [F→] Seção  [Z←] [V→] Aba  [P] Prévia  [?] Ações",
        "en",
      ),
    ).toContain("[P] Preview")
  })

  test("measures, truncates, and pads wide characters", () => {
    expect(displayWidth("数据")).toBe(4)
    expect(truncateDisplay("数据表", 5)).toBe("数据…")
    expect(displayWidth(padDisplayEnd("数据", 6))).toBe(6)
  })

  test("truncates long text without materializing the unused grapheme suffix", () => {
    const value = "👩🏽‍💻e\u0301界".repeat(2_000)
    const original = Intl.Segmenter.prototype.segment
    const passes: Array<{ visited: number }> = []
    const spy = spyOn(Intl.Segmenter.prototype, "segment").mockImplementation(function (
      this: Intl.Segmenter,
      input: string,
    ) {
      const segments = original.call(this, input)
      if (input !== value) return segments
      const pass = { visited: 0 }
      passes.push(pass)
      return {
        containing: segments.containing.bind(segments),
        *[Symbol.iterator]() {
          for (const part of segments) {
            pass.visited += 1
            yield part
          }
          return undefined
        },
      }
    })
    try {
      expect(truncateDisplay(value, 10)).toBe("👩🏽‍💻e\u0301界👩🏽‍💻e\u0301…")
      expect(passes.length).toBeGreaterThanOrEqual(2)
      expect(passes.at(-1)?.visited ?? Infinity).toBeLessThanOrEqual(10)
    } finally {
      spy.mockRestore()
    }
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
})
