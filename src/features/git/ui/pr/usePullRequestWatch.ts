import { useEffect, useRef, useState } from "react"
import { pullRequestIdentityKey } from "../../model/pr/query"
import type { PullRequestSummary } from "../../model/pr/types"
import { loadPullRequestDetails } from "../../services/github/details"
import { notifyPullRequestChecks } from "../../services/pr-notifications"
import { PullRequestWatchScheduler } from "../../services/pr-watch"
import { loadPullRequestConfig } from "../../storage/pr/config"

export function usePullRequestWatch(onNotice: (message: string) => void) {
  const executable = process.env.TUIMINAL_GH_EXECUTABLE?.trim()
  const [revision, setRevision] = useState(0)
  const demoWatches = useRef(new Set<string>())
  const [scheduler] = useState(
    () =>
      new PullRequestWatchScheduler(
        async (item) => {
          const details = await loadPullRequestDetails({
            identity: item.identity,
            options: executable ? { executable } : {},
          })
          if (!details) throw new Error("Pull Request not found")
          return details.checks
        },
        (item, summary) => {
          const message =
            summary.state === "success"
              ? "CI concluído com sucesso."
              : "CI concluído com falhas ou cancelamentos."
          onNotice(message)
          const notifications = loadPullRequestConfig().config.defaults.notifications
          if (notifications.desktop) {
            void notifyPullRequestChecks({
              title: `${item.identity.owner}/${item.identity.repository} #${item.identity.number}`,
              message,
              discreet: notifications.discreet,
            })
          }
          setRevision((current) => current + 1)
        },
      ),
  )
  useEffect(() => () => scheduler.dispose(), [scheduler])

  const toggle = (item: PullRequestSummary) => {
    if (process.env.TUIMINAL_GIT_PR_DEMO === "1") {
      const key = `${pullRequestIdentityKey(item.identity)}:${item.headSha}`
      if (demoWatches.current.has(key)) {
        demoWatches.current.delete(key)
        onNotice("DEMO · acompanhamento de CI interrompido.")
      } else {
        demoWatches.current.add(key)
        onNotice("DEMO · acompanhando CI sem acessar o GitHub.")
      }
      setRevision((current) => current + 1)
      return
    }
    if (scheduler.isWatching(item)) {
      scheduler.unwatch(item)
      onNotice("Acompanhamento de CI interrompido.")
    } else if (scheduler.watch(item)) {
      onNotice("Acompanhando CI enquanto o Tuiminal estiver aberto.")
    } else onNotice("Limite de 10 acompanhamentos simultâneos atingido.")
    setRevision((current) => current + 1)
  }
  return {
    toggle,
    isWatching: (item: PullRequestSummary | null) => {
      if (!item) return false
      const key = `${pullRequestIdentityKey(item.identity)}:${item.headSha}`
      return demoWatches.current.has(key) || scheduler.isWatching(item)
    },
    revision,
  }
}
