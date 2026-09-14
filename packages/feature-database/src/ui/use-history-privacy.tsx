import type { KeyEvent } from "@opentui/core"
import { useState } from "react"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { displayWidth, translateUi } from "@xupon/tuiminal-core/i18n/index"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import type { DatabaseQueryHistoryEntry } from "../model/types"
import { clearLegacyDatabaseQueryHistoryContent } from "../services/database"

export function useHistoryPrivacy(
  entries: readonly DatabaseQueryHistoryEntry[],
  onEntriesChanged: (entries: DatabaseQueryHistoryEntry[]) => void,
) {
  const [confirming, setConfirming] = useState(false)
  const [failed, setFailed] = useState(false)
  const legacyCount = entries.filter((entry) => entry.storage !== "metadata-only").length
  const clean = () => {
    if (!legacyCount) return
    if (!confirming) {
      setConfirming(true)
      return
    }
    try {
      onEntriesChanged(clearLegacyDatabaseQueryHistoryContent())
      setConfirming(false)
      setFailed(false)
    } catch {
      setFailed(true)
    }
  }
  return {
    confirming,
    failed,
    legacyCount,
    clean,
    cancel: () => {
      setConfirming(false)
      setFailed(false)
    },
    handleKey: (key: KeyEvent) => {
      if (confirming) {
        if (key.name === "escape") {
          setConfirming(false)
          setFailed(false)
        }
        if (key.name === "y" && !key.repeated && key.eventType === "press") clean()
        return true
      }
      if (key.name !== "d" || !legacyCount) return false
      clean()
      return true
    },
  }
}

export function historyPrivacyLayout(privacy: ReturnType<typeof useHistoryPrivacy>, width: number) {
  const message = translateUi(
    privacy.failed
      ? "Não foi possível limpar o histórico."
      : privacy.confirming
        ? "Limpar SQL, parâmetros e erros antigos? Metadados e favoritos serão mantidos."
        : "Histórico: só metadados em disco; SQL apenas nesta sessão.",
  )
  const warning = privacy.confirming
    ? translateUi("A limpeza não pode ser desfeita nem apaga cópias de backup.")
    : ""
  const messageRows = Math.max(1, Math.ceil(displayWidth(message) / width))
  const warningRows = Math.ceil(displayWidth(warning) / width)
  return { message, warning, messageRows, warningRows, height: messageRows + warningRows + 1 }
}

export function DatabaseHistoryPrivacyBar({
  privacy,
  width,
}: {
  privacy: ReturnType<typeof useHistoryPrivacy>
  width: number
}) {
  const layout = historyPrivacyLayout(privacy, width)
  return (
    <box height={layout.height} flexShrink={0}>
      <text
        content={layout.message}
        width={width}
        height={layout.messageRows}
        wrapMode="char"
        fg={privacy.failed ? COLORS.danger : COLORS.warning}
      />
      {privacy.confirming ? (
        <text
          content={layout.warning}
          width={width}
          height={layout.warningRows}
          wrapMode="char"
          fg={COLORS.warning}
        />
      ) : null}
      {privacy.legacyCount ? (
        <box flexDirection="row" height={1}>
          <InlineButton
            id="database-history-cleanup"
            label={translateUi(
              privacy.confirming ? "[Y] Confirmar limpeza" : "[D] Limpar conteúdo antigo",
            )}
            accent={COLORS.danger}
            onPress={privacy.clean}
          />
          <text content={` (${privacy.legacyCount})`} fg={COLORS.muted} />
          {privacy.confirming ? (
            <InlineButton
              id="database-history-cleanup-cancel"
              label={translateUi("[Esc] Cancelar")}
              accent={COLORS.muted}
              onPress={privacy.cancel}
            />
          ) : null}
        </box>
      ) : null}
    </box>
  )
}
