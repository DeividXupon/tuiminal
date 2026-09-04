export const GIT_PR_MERGE_MESSAGES = [
  [
    "PR já está na fila de merge.",
    "The PR is already in the merge queue.",
    "El PR ya está en la cola de fusión.",
    "PR はすでにマージキューにあります。",
    "PR 已在合并队列中。",
    "PR이 이미 병합 대기열에 있습니다.",
  ],
  [
    "Auto-merge já está ativo; confirme somente para atualizar a intenção.",
    "Auto-merge is already enabled; confirm only to update the intent.",
    "El auto-merge ya está activo; confirma solo para actualizar la intención.",
    "自動マージはすでに有効です。意図を更新する場合のみ確認してください。",
    "自动合并已启用；仅在更新意图时确认。",
    "자동 병합이 이미 활성화됨; 의도를 업데이트할 때만 확인하세요.",
  ],
  [
    "A confirmação colocará o PR na fila ou ativará auto-merge até os checks terminarem.",
    "Confirmation will queue the PR or enable auto-merge until checks finish.",
    "La confirmación pondrá el PR en cola o activará auto-merge hasta que terminen los checks.",
    "確認すると PR がキューに入るか、チェック完了まで自動マージが有効になります。",
    "确认后会将 PR 加入队列，或在检查完成前启用自动合并。",
    "확인하면 PR이 대기열에 추가되거나 검사 완료까지 자동 병합이 활성화됩니다.",
  ],
  [
    "A confirmação tentará concluir o merge agora, respeitando as proteções do GitHub.",
    "Confirmation will try to merge now while respecting GitHub protections.",
    "La confirmación intentará fusionar ahora respetando las protecciones de GitHub.",
    "確認すると GitHub の保護を尊重して今すぐマージを試みます。",
    "确认后将尝试立即合并，并遵守 GitHub 保护规则。",
    "확인하면 GitHub 보호 규칙을 준수하며 지금 병합을 시도합니다.",
  ],
] as const
