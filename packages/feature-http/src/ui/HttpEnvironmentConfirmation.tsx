import { useKeyboard, useTerminalDimensions } from "@opentui/react"
import { HttpDiscardDocumentModal } from "./HttpDiscardDocumentModal"
import type { HttpEnvironmentTabs } from "../hooks/use-http-environment-tabs"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"

export function HttpEnvironmentConfirmation({
  environments,
}: {
  environments: HttpEnvironmentTabs
}) {
  const terminal = useTerminalDimensions()
  const pending = environments.pending
  useKeyboard((key) => {
    if (!pending || pending.document?.busy || key.defaultPrevented) return
    if (key.name !== "escape" && key.name !== "d") return
    key.preventDefault()
    key.stopPropagation()
    if (key.name === "escape") environments.cancel()
    else void environments.confirm()
  })
  if (!pending) return null
  return (
    <HttpDiscardDocumentModal
      requestName={pending.document?.name ?? ""}
      confirmDisabled={Boolean(pending.document?.loading || pending.document?.busy)}
      terminalWidth={terminal.width}
      terminalHeight={terminal.height}
      onClose={() => {
        if (!pending.document?.busy) environments.cancel()
      }}
      onConfirm={() => void environments.confirm()}
      {...(pending.action === "delete"
        ? {
            title: "EXCLUIR AMBIENTE?",
            description: translateUi(
              pending.document?.loading
                ? "Carregando…"
                : "O ambiente e suas variáveis serão excluídos.",
            ),
            confirmLabel: "[D] Excluir ambiente",
          }
        : {})}
    />
  )
}
