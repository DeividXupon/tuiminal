import { useMemo, useRef, useState } from "react"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { discussionActionTargetPayload } from "../../model/discussion-actions"
import {
  type IssueActionAvailability,
  type IssueActionKind,
  issueActionAvailability,
  prepareIssueAction,
} from "../../model/issue/actions"
import { ISSUE_MUTATIONS } from "../../model/issue/palette"
import { issueIdentityKey } from "../../model/issue/query"
import type {
  IssueAuthContext,
  IssueComment,
  IssueDetails,
  IssueSummary,
} from "../../model/issue/types"
import { IssueActionCoordinator } from "../../services/issue-actions"
import { inspectCheckoutClone } from "../../services/pr-checkout"
import { addIssueClonePath, loadIssueConfig } from "../../storage/issue/config"
import { IssueActionModal } from "./IssueActionModal"

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
  demo,
}: {
  kind: IssueActionKind
  payload: Readonly<Record<string, unknown>>
  item: IssueSummary
  auth: IssueAuthContext
  coordinator: IssueActionCoordinator
  demo: boolean
}): Promise<UiActionResult> {
  if (demo) return { status: "confirmed" }
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
  demo = process.env.TUIMINAL_GIT_ISSUES_DEMO === "1",
  onNotice,
  onRefresh,
  onLocalCheckout,
}: {
  item: IssueSummary | null
  details: IssueDetails | null
  auth: IssueAuthContext | null
  profileRoot: string | null
  demo?: boolean
  onNotice: (message: string) => void
  onRefresh: () => void
  onLocalCheckout: () => void
}) {
  const executable = process.env.TUIMINAL_GH_EXECUTABLE?.trim()
  const [coordinator] = useState(() => new IssueActionCoordinator(executable ? { executable } : {}))
  const [kind, setKind] = useState<IssueActionKind | null>(null)
  const [targetComment, setTargetComment] = useState<IssueComment | null>(null)
  const [value, setValue] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const drafts = useRef(new Map<string, string>())
  const clonePaths = useMemo(() => (item ? mappedClonePaths(item) : []), [item])

  const availability = useMemo(() => {
    if (!item || !details || !auth) return new Map<IssueActionKind, IssueActionAvailability>()
    return new Map(
      ISSUE_MUTATIONS.map((mutation) => [
        mutation.kind,
        issueActionAvailability({
          kind: mutation.kind,
          summary: item,
          details,
          hasCheckout: clonePaths.length > 0,
        }),
      ]),
    )
  }, [auth, clonePaths.length, details, item])

  const draftKey = (action: IssueActionKind, comment: IssueComment | null = targetComment) =>
    item ? `${issueIdentityKey(item.identity)}:${action}:${comment?.id ?? "item"}` : action
  const defaultValue = (action: IssueActionKind, comment: IssueComment | null = targetComment) => {
    const draft = drafts.current.get(draftKey(action, comment))
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
    const available = availability.get(action)
    if (!available?.enabled) {
      onNotice(translateUi(available?.reason ?? "Ação indisponível."))
      return
    }
    setTargetComment(null)
    setKind(action)
    setValue(defaultValue(action, null))
    setError("")
  }
  const openCommentAction = (action: "reaction" | "reply", comment: IssueComment) => {
    setTargetComment(comment)
    setKind(action)
    setValue(drafts.current.get(draftKey(action, comment)) ?? "")
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
      const targetPayload = discussionActionTargetPayload(kind, item.identity, targetComment)
      const result = await executeSelectedAction({
        kind,
        payload: { ...payload, ...targetPayload },
        item,
        auth,
        coordinator,
        demo,
      })
      if (result.status === "confirmed") {
        if (kind === "checkout") onLocalCheckout()
        drafts.current.delete(draftKey(kind))
        setKind(null)
        setTargetComment(null)
        onNotice(
          demo
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

  const modals =
    item && kind ? (
      <IssueActionModal
        kind={kind}
        item={item}
        currentAssignees={details?.assignees.map((actor) => actor.login) ?? []}
        currentLabels={details?.labels.map((label) => label.name) ?? []}
        targetComment={targetComment}
        reactionGroups={targetComment?.reactionGroups ?? details?.reactionGroups}
        initialValue={value}
        checkoutPaths={[...new Set([...clonePaths, ...(profileRoot ? [profileRoot] : [])])]}
        busy={busy}
        error={error}
        onValueChange={updateValue}
        onClose={() => {
          setKind(null)
          setTargetComment(null)
        }}
        onSubmit={(payload) => void submit(payload)}
      />
    ) : null

  return {
    modalOpen: kind !== null,
    modals,
    availability,
    openAction,
    openCommentAction,
  }
}
