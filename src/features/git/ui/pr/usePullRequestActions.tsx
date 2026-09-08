import { useMemo, useRef, useState } from "react"
import { translateUi } from "../../../../shared/i18n"
import { MountWhen } from "../../../../shared/ui/MountWhen"
import {
  type PullRequestActionKind,
  preparePullRequestAction,
  pullRequestActionAvailability,
} from "../../model/pr/actions"
import { pullRequestIdentityKey } from "../../model/pr/query"
import type {
  PullRequestAuthContext,
  PullRequestDetails,
  PullRequestSummary,
} from "../../model/pr/types"
import type { PullRequestWorkflowRun } from "../../model/pr/workflows"
import { PullRequestActionCoordinator } from "../../services/pr-actions"
import { inspectCheckoutClone } from "../../services/pr-checkout"
import { addPullRequestClonePath, loadPullRequestConfig } from "../../storage/pr/config"
import { ActionMenuModal, type PullRequestActionMenuItem } from "./ActionMenuModal"
import { PullRequestActionModal } from "./PullRequestActionModal"

const ACTIONS: ReadonlyArray<Pick<PullRequestActionMenuItem, "kind" | "label" | "shortcut">> = [
  { kind: "comment", label: "Comentar", shortcut: "[C]" },
  { kind: "approve", label: "Aprovar com comentário", shortcut: "[V]" },
  { kind: "assign", label: "Adicionar responsável", shortcut: "[A]" },
  { kind: "unassign", label: "Remover responsável", shortcut: "[Shift+A]" },
  { kind: "ready", label: "Marcar draft como pronto", shortcut: "[Shift+W]" },
  { kind: "close", label: "Fechar", shortcut: "[X]" },
  { kind: "reopen", label: "Reabrir", shortcut: "[Shift+X]" },
  { kind: "checkout", label: "Checkout local", shortcut: "[Shift+C]" },
  { kind: "update-branch", label: "Atualizar com a base", shortcut: "[U]" },
  { kind: "merge", label: "Merge", shortcut: "[M]" },
  { kind: "approve-workflow", label: "Autorizar workflow", shortcut: "[Ctrl+A]" },
]

type UiActionResult =
  | { status: "confirmed" }
  | { status: "uncertain"; reason: string }
  | { status: "rejected"; reason: string }

async function validateCheckout(
  kind: PullRequestActionKind,
  payload: Readonly<Record<string, unknown>>,
  item: PullRequestSummary,
) {
  if (kind !== "checkout") return null
  const clonePath = typeof payload.clonePath === "string" ? payload.clonePath : ""
  const inspection = await inspectCheckoutClone(clonePath, item.identity)
  if (!inspection.eligible || !inspection.root) return inspection.reason ?? "Clone inválido"
  addPullRequestClonePath({
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
  kind: PullRequestActionKind
  payload: Readonly<Record<string, unknown>>
  item: PullRequestSummary
  auth: PullRequestAuthContext
  coordinator: PullRequestActionCoordinator
}): Promise<UiActionResult> {
  const checkoutError = await validateCheckout(kind, payload, item)
  if (checkoutError) return { status: "rejected", reason: checkoutError }
  if (process.env.TUIMINAL_GIT_PR_DEMO === "1") return { status: "confirmed" }
  const prepared = preparePullRequestAction({
    actionId: `${Date.now()}-${kind}`,
    kind,
    target: item.identity,
    expectedHeadSha: item.headSha,
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

function mappedClonePaths(item: PullRequestSummary) {
  const config = loadPullRequestConfig().config
  return {
    paths:
      config.repoPaths[
        `${item.identity.host.toLowerCase()}/${item.identity.owner}/${item.identity.repository}`
      ] ?? [],
    approveComment: config.defaults.approveComment,
  }
}

function notifyCheckout(kind: PullRequestActionKind, notify: () => void) {
  if (kind === "checkout") notify()
}

export function usePullRequestActions({
  item,
  details,
  auth,
  profileRoot,
  workflows,
  onNotice,
  onRefresh,
  onLocalCheckout,
}: {
  item: PullRequestSummary | null
  details: PullRequestDetails | null
  auth: PullRequestAuthContext | null
  profileRoot: string | null
  workflows: PullRequestWorkflowRun[]
  onNotice: (message: string) => void
  onRefresh: () => void
  onLocalCheckout: () => void
}) {
  const executable = process.env.TUIMINAL_GH_EXECUTABLE?.trim()
  const [coordinator] = useState(
    () => new PullRequestActionCoordinator(executable ? { executable } : {}),
  )
  const [menuOpen, setMenuOpen] = useState(false)
  const [kind, setKind] = useState<PullRequestActionKind | null>(null)
  const [value, setValue] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const drafts = useRef(new Map<string, string>())
  const configuration = useMemo(
    () => (item ? mappedClonePaths(item) : { paths: [], approveComment: "" }),
    [item],
  )
  const eligibleWorkflows = workflows.filter((run) => run.eligibleForApproval)

  const actions = useMemo(() => {
    if (!item || !details || !auth) return []
    return ACTIONS.map((action) => ({
      ...action,
      availability: pullRequestActionAvailability({
        kind: action.kind,
        summary: item,
        details,
        viewerLogin: auth.viewerLogin,
        hasCheckout: configuration.paths.length > 0,
        workflowCount: eligibleWorkflows.length,
      }),
    }))
  }, [auth, configuration.paths.length, details, eligibleWorkflows.length, item])

  const draftKey = (action: PullRequestActionKind) =>
    item ? `${pullRequestIdentityKey(item.identity)}:${action}` : action
  const defaultValue = (action: PullRequestActionKind) => {
    const draft = drafts.current.get(draftKey(action))
    if (draft !== undefined) return draft
    if (action === "approve") return configuration.approveComment
    if (action === "checkout") return configuration.paths[0] ?? profileRoot ?? ""
    if (action === "unassign") return item?.assignees[0]?.login ?? ""
    return ""
  }
  const openAction = (action: PullRequestActionKind) => {
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
      const result = await executeSelectedAction({
        kind,
        payload,
        item,
        auth,
        coordinator,
      })
      if (result.status === "confirmed") {
        notifyCheckout(kind, onLocalCheckout)
        drafts.current.delete(draftKey(kind))
        setKind(null)
        onNotice(
          process.env.TUIMINAL_GIT_PR_DEMO === "1"
            ? translateUi("DEMO · ação confirmada sem alterar o GitHub.")
            : translateUi("Ação confirmada pelo GitHub."),
        )
        onRefresh()
      } else if (result.status === "uncertain") {
        setError(translateUi("Resultado remoto incerto. Verifique o PR antes de tentar novamente."))
      } else if (result.status === "rejected") setError(translateUi(result.reason))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : translateUi("A ação falhou"))
    } finally {
      setBusy(false)
    }
  }

  const modalOpen = menuOpen || kind !== null
  const modals = item ? (
    <>
      <MountWhen when={menuOpen}>
        <ActionMenuModal
          open
          item={item}
          actions={actions}
          onClose={() => setMenuOpen(false)}
          onSelect={openAction}
        />
      </MountWhen>
      {kind ? (
        <PullRequestActionModal
          open
          kind={kind}
          item={item}
          initialValue={value}
          workflows={eligibleWorkflows}
          mergeMethods={details?.permissions.mergeMethods ?? []}
          checkoutPaths={[
            ...new Set([...configuration.paths, ...(profileRoot ? [profileRoot] : [])]),
          ]}
          mergeQueueConfigured={details?.mergeQueueConfigured ?? false}
          mergeQueuePosition={details?.mergeQueueEntry?.position ?? null}
          autoMergeEnabled={Boolean(details?.autoMergeRequest)}
          busy={busy}
          error={error}
          onValueChange={updateValue}
          onClose={() => setKind(null)}
          onSubmit={(payload) => void submit(payload)}
        />
      ) : null}
    </>
  ) : null
  return { modalOpen, modals, openMenu: () => setMenuOpen(true), openAction }
}
