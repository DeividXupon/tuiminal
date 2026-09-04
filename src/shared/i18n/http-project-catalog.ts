export const HTTP_PROJECT_MESSAGES = [
  ["PROJETO", "PROJECT", "PROYECTO", "プロジェクト", "项目", "프로젝트"],
  [
    "Nenhum arquivo .http ou .rest no projeto.",
    "No .http or .rest files in the project.",
    "No hay archivos .http o .rest en el proyecto.",
    "プロジェクトに.httpまたは.restファイルがありません。",
    "项目中没有 .http 或 .rest 文件。",
    "프로젝트에 .http 또는 .rest 파일이 없습니다.",
  ],
  [
    "[E] Sem ambiente",
    "[E] No environment",
    "[E] Sin ambiente",
    "[E] 環境なし",
    "[E] 无环境",
    "[E] 환경 없음",
  ],
  [
    "Nenhum ambiente configurado no projeto.",
    "No environment is configured in the project.",
    "No hay ningún ambiente configurado en el proyecto.",
    "プロジェクトに環境が設定されていません。",
    "项目中未配置环境。",
    "프로젝트에 구성된 환경이 없습니다.",
  ],
  [
    "AMBIENTE DE PRODUÇÃO SELECIONADO",
    "PRODUCTION ENVIRONMENT SELECTED",
    "AMBIENTE DE PRODUCCIÓN SELECCIONADO",
    "本番環境を選択中",
    "已选择生产环境",
    "프로덕션 환경 선택됨",
  ],
  [
    "SALVANDO REQUEST…",
    "SAVING REQUEST…",
    "GUARDANDO SOLICITUD…",
    "リクエストを保存中…",
    "正在保存请求…",
    "요청 저장 중…",
  ],
] as const

export const HTTP_PROJECT_PATTERNS = [
  [
    /^(\d+) arquivo\(s\) não puderam ser lidos\.$/,
    "$1 file(s) could not be read.",
    "No se pudieron leer $1 archivo(s).",
    "$1個のファイルを読み込めませんでした。",
    "$1 个文件无法读取。",
    "$1개 파일을 읽을 수 없습니다.",
  ],
  [
    /^REQUEST SALVO · (.+)$/,
    "REQUEST SAVED · $1",
    "SOLICITUD GUARDADA · $1",
    "リクエスト保存済み・$1",
    "请求已保存 · $1",
    "요청 저장됨 · $1",
  ],
] as const
