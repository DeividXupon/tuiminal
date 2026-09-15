import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { GitHubTransportError } from "../../services/github/transport"

export type GitRemoteDetailsState<Details> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "not-found" }
  | { status: "ready"; details: Details; fromCache: boolean }
  | { status: "error"; kind: string; message: string }

type DetailResult<Details> = { details: Details | null; fromCache: boolean }
type DetailSession<Item, Details, PageArgs extends unknown[]> = {
  load: (item: Item) => Promise<DetailResult<Details>>
  refresh: (item: Item) => Promise<DetailResult<Details>>
  loadMore: (item: Item, current: Details, ...args: PageArgs) => Promise<Details>
  cancel: () => void
  dispose: () => void
}

function detailError<Details>(error: unknown): GitRemoteDetailsState<Details> {
  return {
    status: "error",
    kind: error instanceof GitHubTransportError ? error.kind : "unknown",
    message: error instanceof Error ? error.message : "Unknown GitHub error",
  }
}

export function useGitRemoteDetails<Item, Details, PageArgs extends unknown[]>({
  active,
  item,
  demo,
  demoDetails,
  createSession,
}: {
  active: boolean
  item: Item | null
  demo: boolean
  demoDetails: (item: Item) => Details
  createSession: () => DetailSession<Item, Details, PageArgs>
}) {
  const [session] = useState(createSession)
  const scope = useMemo(() => ({ active, item, demo }), [active, item, demo])
  const scopeRef = useRef(scope)
  scopeRef.current = scope
  const [state, setState] = useState<GitRemoteDetailsState<Details>>({ status: "idle" })
  const [loadingMore, setLoadingMore] = useState(false)
  const generationRef = useRef(0)
  const requestRef = useRef<"initial" | "page" | "refresh" | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cancel = useCallback(() => {
    generationRef.current += 1
    requestRef.current = null
    if (timerRef.current !== null) clearTimeout(timerRef.current)
    timerRef.current = null
    session.cancel()
  }, [session])

  const run = useCallback(
    async (work: () => Promise<DetailResult<Details>>, kind: "initial" | "page" | "refresh") => {
      if (scopeRef.current !== scope) return
      cancel()
      const generation = generationRef.current
      requestRef.current = kind
      setLoadingMore(kind === "page")
      try {
        const result = await work()
        if (generation !== generationRef.current || scopeRef.current !== scope) return
        setState(
          result.details
            ? { status: "ready", details: result.details, fromCache: result.fromCache }
            : { status: "not-found" },
        )
      } catch (error) {
        if (generation === generationRef.current && scopeRef.current === scope)
          setState(detailError(error))
      } finally {
        if (generation === generationRef.current) {
          requestRef.current = null
          setLoadingMore(false)
        }
      }
    },
    [cancel, scope],
  )

  useEffect(() => {
    cancel()
    setLoadingMore(false)
    if (!active || !item) setState({ status: "idle" })
    else if (demo) setState({ status: "ready", details: demoDetails(item), fromCache: true })
    else {
      setState({ status: "loading" })
      timerRef.current = setTimeout(() => {
        timerRef.current = null
        void run(() => session.load(item), "initial")
      }, 150)
    }
    return cancel
  }, [active, cancel, demo, demoDetails, item, run, session])

  useEffect(
    () => () => {
      cancel()
      session.dispose()
    },
    [cancel, session],
  )

  const loadMore = async (...args: PageArgs) => {
    if (!active || !item || state.status !== "ready" || demo || requestRef.current !== null) return
    await run(
      async () => ({
        details: await session.loadMore(item, state.details, ...args),
        fromCache: false,
      }),
      "page",
    )
  }

  const reload = async () => {
    if (!active || !item || demo) return
    await run(() => session.refresh(item), "refresh")
  }

  return { state, loadMore, loadingMore, reload }
}
