import { useMemo, useRef, useState } from "react"
import { translateUi } from "../../../../shared/i18n"
import { MountWhen } from "../../../../shared/ui/MountWhen"
import {
  type IssueActionKind,
  issueActionAvailability,
  prepareIssueAction,
} from "../../model/issue/actions"
import { issueIdentityKey } from "../../model/issue/query"
import type { IssueAuthContext, IssueDetails, IssueSummary } from "../../model/issue/types"
import { IssueActionCoordinator } from "../../services/issue-actions"
import { inspectCheckoutClone } from "../../services/pr-checkout"
import { addIssueClonePath, loadIssueConfig } from "../../storage/issue/config"
import { IssueActionMenuModal, type IssueActionMenuItem } from "./IssueActionMenuModal"
import { IssueActionModal } from "./IssueActionModal"

const ACTIONS: ReadonlyArray<Pick<IssueActionMenuItem, "kind" | "label" | "shortcut">> = [
  { kind: "comment", label: "Comentar", shortcut: "[C]" },
  { kind: "assign", label: "Adicionar responsáveis", shortcut: "[A]" },
  { kind: "unassign", label: "Remover responsáveis", shortcut: "[Shift+A]" },
  { kind: "labels", label: "Editar labels", shortcut: "[Shift+L]" },
  { kind: "checkout", label: "Criar branch e checkout", shortcut: "[Shift+C]" },
  { kind: "close", label: "Fechar issue", shortcut: "[X]" },
  { kind: "reopen", label: "Reabrir issue", shortcut: "[Shift+X]" },
]

type UiActionResult =
  | { status: "confirmed" }
  | { status: "uncertain"; reason: string }
  | { status: "rejected"; reason: string }

async function validateCheckout(
  kind: IssueActionKind,
  payload: Readonly<Record<string, unknown>>,
  item: IssueSummary,
) {
  if (kind !== "checkout") return null
  const clonePath = typeof payload.clonePath === "string" ? payload.clonePath : ""
  const inspection = await inspectCheckoutClone(clonePath, item.identity)
  if (!inspection.eligible || !inspection.root) return inspection.reason ?? "Clone inválido"
  addIssueClonePath({
    host: item.identity.host,
    repository: `${item.identity.owner}/${item.identity.repository}`,
    clonePath: inspection.root,
  })
  return null
}

async function executeSelectedAction({
  kind,
  payload,
  item,
  auth,
  coordinator,
}: {
  kind: IssueActionKind
  payload: Readonly<Record<string, unknown>>
  item: IssueSummary
  auth: IssueAuthContext
  coordinator: IssueActionCoordinator
}): Promise<UiActionResult> {
  if (process.env.TUIMINAL_GIT_ISSUES_DEMO === "1") return { status: "confirmed" }
  const checkoutError = await validateCheckout(kind, payload, item)
  if (checkoutError) return { status: "rejected", reason: checkoutError }
  const prepared = prepareIssueAction({
    actionId: `${Date.now()}-${kind}`,
    kind,
    target: item.identity,
    expectedUpdatedAt: item.updatedAt,
    expectedState: item.state,
    auth,
    payload,
  })
  const result = await coordinator.execute(prepared)
  if (result.status === "confirmed") return { status: "confirmed" }
  if (result.status === "uncertain") return { status: "uncertain", reason: result.reason }
  return {
    status: "rejected",
    reason: result.status === "rejected" ? result.reason : "invalid-action-state",
  }
}

function mappedClonePaths(item: IssueSummary) {
  const config = loadIssueConfig().config
  return (
    config.repoPaths[
      `${item.identity.host.toLowerCase()}/${item.identity.owner}/${item.identity.repository}`
    ] ?? []
  )
}

export function useIssueActions({
  item,
  details,
  auth,
  profileRoot,
  onNotice,
  onRefresh,
  onLocalCheckout,
}: {
  item: IssueSummary | null
  details: IssueDetails | null
  auth: IssueAuthContext | null
  profileRoot: string | null
  onNotice: (message: string) => void
  onRefresh: () => void
  onLocalCheckout: () => void
}) {
  const executable = process.env.TUIMINAL_GH_EXECUTABLE?.trim()
  const [coordinator] = useState(() => new IssueActionCoordinator(executable ? { executable } : {}))
  const [menuOpen, setMenuOpen] = useState(false)
  const [kind, setKind] = useState<IssueActionKind | null>(null)
  const [value, setValue] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const drafts = useRef(new Map<string, string>())
  const clonePaths = useMemo(() => (item ? mappedClonePaths(item) : []), [item])

  const actions = useMemo(() => {
    if (!item || !details || !auth) return []
    return ACTIONS.map((action) => ({
      ...action,
      availability: issueActionAvailability({
        kind: action.kind,
        summary: item,
        details,
        hasCheckout: clonePaths.length > 0,
      }),
    }))
  }, [auth, clonePaths.length, details, item])

  const draftKey = (action: IssueActionKind) =>
    item ? `${issueIdentityKey(item.identity)}:${action}` : action
  const defaultValue = (action: IssueActionKind) => {
    const draft = drafts.current.get(draftKey(action))
    if (draft !== undefined) return draft
    if (action === "checkout") return clonePaths[0] ?? profileRoot ?? ""
    if (action === "unassign") {
      return details?.assignees.map((actor) => actor.login).join(", ") ?? ""
    }
    if (action === "labels") {
      return details?.labels.map((label) => label.name).join(", ") ?? ""
    }
    return ""
  }
  const openAction = (action: IssueActionKind) => {
    const available = actions.find((candidate) => candidate.kind === action)?.availability
    if (!available?.enabled) {
      onNotice(translateUi(available?.reason ?? "Ação indisponível."))
      return
    }
    setMenuOpen(false)
    setKind(action)
    setValue(defaultValue(action))
    setError("")
  }
  const updateValue = (next: string) => {
    setValue(next)
    if (kind) drafts.current.set(draftKey(kind), next)
  }
  const submit = async (payload: Readonly<Record<string, unknown>>) => {
    if (!item || !details || !auth || !kind || busy) return
    setBusy(true)
    setError("")
    try {
      const result = await executeSelectedAction({ kind, payload, item, auth, coordinator })
      if (result.status === "confirmed") {
        if (kind === "checkout") onLocalCheckout()
        drafts.current.delete(draftKey(kind))
        setKind(null)
        onNotice(
          process.env.TUIMINAL_GIT_ISSUES_DEMO === "1"
            ? translateUi("DEMO · ação confirmada sem alterar o GitHub.")
            : translateUi("Ação confirmada pelo GitHub."),
        )
        onRefresh()
      } else if (result.status === "uncertain") {
        setError(
          translateUi("Resultado remoto incerto. Verifique a issue antes de tentar novamente."),
        )
      } else {
        setError(translateUi(result.reason))
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : translateUi("A ação falhou"))
    } finally {
      setBusy(false)
    }
  }

  const modals = item ? (
    <>
      <MountWhen when={menuOpen}>
        <IssueActionMenuModal
          item={item}
          actions={actions}
          onClose={() => setMenuOpen(false)}
          onSelect={openAction}
        />
      </MountWhen>
      {kind ? (
        <IssueActionModal
          kind={kind}
          item={item}
          currentAssignees={details?.assignees.map((actor) => actor.login) ?? []}
          currentLabels={details?.labels.map((label) => label.name) ?? []}
          initialValue={value}
          checkoutPaths={[...new Set([...clonePaths, ...(profileRoot ? [profileRoot] : [])])]}
          busy={busy}
          error={error}
          onValueChange={updateValue}
          onClose={() => setKind(null)}
          onSubmit={(payload) => void submit(payload)}
        />
      ) : null}
    </>
  ) : null

  return {
    modalOpen: menuOpen || kind !== null,
    modals,
    openMenu: () => setMenuOpen(true),
    openAction,
  }
}
