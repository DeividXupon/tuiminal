import { useRef, useState } from "react"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { type GitHubCreateDraft, validateGitHubCreateDraft } from "../../model/create-item"
import type { PullRequestAuthContext } from "../../model/pr/types"
import { createGitHubItem, type GitHubCreateResult } from "../../services/github/create-item"
import { GitHubCreateModal } from "./GitHubCreateModal"
import { useGitHubCreateDefaultBase } from "./useGitHubCreateDefaultBase"
import { useGitHubCreateTitleSuggestion } from "./useGitHubCreateTitleSuggestion"

async function dispatchGitHubCreation(draft: GitHubCreateDraft, auth: PullRequestAuthContext) {
  const demo =
    process.env[draft.kind === "pr" ? "TUIMINAL_GIT_PR_DEMO" : "TUIMINAL_GIT_ISSUES_DEMO"] === "1"
  const executable = process.env.TUIMINAL_GH_EXECUTABLE?.trim()
  const result: GitHubCreateResult = demo
    ? { status: "confirmed", url: "", number: 0 }
    : await createGitHubItem(draft, auth, executable ? { executable } : {})
  return { demo, result }
}

function creationSuccessNotice(kind: GitHubCreateDraft["kind"], demo: boolean, url: string) {
  if (demo) return translateUi("DEMO · criação simulada sem alterar o GitHub.")
  return `${translateUi(kind === "pr" ? "PR criado no GitHub." : "Issue criada no GitHub.")} ${url}`
}

export function useGitHubCreation({
  kind,
  auth,
  defaultRepository,
  onNotice,
  onRefresh,
}: {
  kind: "pr" | "issue"
  auth: PullRequestAuthContext | null
  defaultRepository: string
  onNotice: (message: string) => void
  onRefresh: () => void
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<GitHubCreateDraft>(() => ({
    kind,
    repository: "",
    title: "",
    body: "",
    base: "",
    head: "",
    draft: false,
  }))
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [uncertain, setUncertain] = useState(false)
  const [error, setError] = useState("")
  const titleSuggestion = useGitHubCreateTitleSuggestion(
    draft,
    setDraft,
    open,
    auth?.host,
    process.env.TUIMINAL_GIT_PR_DEMO === "1",
  )
  const baseSuggestion = useGitHubCreateDefaultBase(
    draft,
    setDraft,
    open,
    auth?.host,
    process.env.TUIMINAL_GIT_PR_DEMO === "1",
  )
  const openModal = () => {
    if (!auth) return
    setDraft((current) => ({ ...current, repository: current.repository || defaultRepository }))
    if (!uncertain) setError("")
    setOpen(true)
  }
  const submit = async () => {
    if (!auth || busyRef.current || uncertain) return
    const invalid = validateGitHubCreateDraft(draft)
    if (invalid) {
      setError(translateUi(invalid))
      return
    }
    busyRef.current = true
    setBusy(true)
    setError("")
    try {
      const { demo, result } = await dispatchGitHubCreation(draft, auth)
      if (result.status === "confirmed") {
        titleSuggestion.reset()
        baseSuggestion.reset()
        setOpen(false)
        setDraft({
          kind,
          repository: draft.repository,
          title: "",
          body: "",
          base: "",
          head: "",
          draft: false,
        })
        onNotice(creationSuccessNotice(kind, demo, result.url))
        onRefresh()
      } else if (result.status === "uncertain") {
        setUncertain(true)
        setError(
          `${translateUi("Resultado remoto incerto. Confira o GitHub antes de tentar novamente.")} ${result.reason}`,
        )
      } else setError(translateUi(result.reason))
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }
  return {
    available: Boolean(auth),
    open,
    openModal,
    modal:
      open && auth ? (
        <GitHubCreateModal
          draft={draft}
          host={auth.host}
          viewer={auth.viewerLogin}
          busy={busy}
          uncertain={uncertain}
          error={error}
          titleSuggestionStatus={titleSuggestion.status}
          onAcknowledge={() => {
            setUncertain(false)
            setError("")
          }}
          onChange={(patch) => {
            baseSuggestion.noteChange(patch)
            titleSuggestion.changeDraft(patch)
          }}
          onClose={() => setOpen(false)}
          onSubmit={() => void submit()}
        />
      ) : null,
  }
}
