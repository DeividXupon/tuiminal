import { useState } from "react"
import { translateUi } from "../../../../shared/i18n"
import type { InboxNotification } from "../../model/inbox/types"
import {
  markNotificationDone,
  markNotificationRead,
  openNotificationInBrowser,
  unsubscribeNotification,
} from "../../services/github/notifications"
import { saveInboxSavedIds } from "../../storage/inbox/state"
import type { InboxDestructiveAction } from "./InboxActionModal"
import type { InboxDashboardState } from "./useInboxDashboard"

export function useInboxActions({
  state,
  selected,
  savedIds,
  setSavedIds,
  updateItems,
}: {
  state: InboxDashboardState
  selected: InboxNotification | null
  savedIds: Set<string>
  setSavedIds: (savedIds: Set<string>) => void
  updateItems: (update: (items: InboxNotification[]) => InboxNotification[]) => void
}) {
  const [notice, setNotice] = useState("")
  const [pendingAction, setPendingAction] = useState<InboxDestructiveAction | null>(null)
  const [busy, setBusy] = useState(false)
  const host = state.status === "ready" ? state.host : "github.com"
  const executable = process.env.TUIMINAL_GH_EXECUTABLE?.trim()
  const transport = executable ? { executable } : {}

  const toggleSaved = () => {
    if (!selected) return
    const next = new Set(savedIds)
    if (next.has(selected.id)) next.delete(selected.id)
    else next.add(selected.id)
    setSavedIds(next)
    try {
      saveInboxSavedIds(next)
      setNotice(
        translateUi(
          next.has(selected.id) ? "Notificação salva." : "Notificação removida das salvas.",
        ),
      )
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : translateUi("Não foi possível salvar a notificação."),
      )
    }
  }

  const open = async () => {
    if (!selected) return
    if (state.status === "demo") return setNotice(translateUi("DEMO · nenhuma página foi aberta."))
    try {
      await openNotificationInBrowser(selected, host, transport)
      setNotice(translateUi("Notificação aberta no navegador."))
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : translateUi("Não foi possível abrir a notificação."),
      )
    }
  }

  const markRead = async () => {
    if (!selected || !selected.unread) return
    try {
      if (state.status !== "demo") await markNotificationRead(selected, host, transport)
      updateItems((items) =>
        items.map((item) => (item.id === selected.id ? { ...item, unread: false } : item)),
      )
      setNotice(translateUi("Notificação marcada como lida."))
    } catch (error) {
      setNotice(error instanceof Error ? error.message : translateUi("A ação no Inbox falhou."))
    }
  }

  const confirm = async () => {
    if (!selected || !pendingAction || busy) return
    setBusy(true)
    try {
      if (state.status !== "demo") {
        if (pendingAction === "done") await markNotificationDone(selected, host, transport)
        else await unsubscribeNotification(selected, host, transport)
      }
      if (pendingAction === "done") {
        updateItems((items) => items.filter((item) => item.id !== selected.id))
      }
      setNotice(
        translateUi(
          pendingAction === "done"
            ? "Notificação concluída."
            : "Você deixou de acompanhar a conversa.",
        ),
      )
      setPendingAction(null)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : translateUi("A ação no Inbox falhou."))
    } finally {
      setBusy(false)
    }
  }

  return {
    savedIds,
    notice,
    pendingAction,
    busy,
    open,
    markRead,
    toggleSaved,
    requestAction: setPendingAction,
    closeAction: () => setPendingAction(null),
    confirm,
  }
}
