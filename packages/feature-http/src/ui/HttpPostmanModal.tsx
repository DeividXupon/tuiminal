import type { ScrollBoxRenderable } from "@opentui/core"
import { useKeyboard, useRenderer } from "@opentui/react"
import { translateUi, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { ShortcutText } from "@xupon/tuiminal-core/ui/ShortcutText"
import { useCallback, useEffect, useRef, useState } from "react"
import { usePostmanRequestCounts } from "../hooks/use-postman-request-counts"
import { loadPostmanAccount } from "../postman/account"
import { PostmanApi, type PostmanEnvironment, type PostmanWorkspace } from "../postman/api"
import { LivePostmanSession } from "../postman/live-session"
import { HttpDialog } from "./HttpDialog"
import { HttpDialogNotice, HttpDialogSection } from "./HttpDialogDetails"
import { HttpPostmanWorkspaceRow } from "./HttpPostmanWorkspaceRow"

const ARROWS = new Set(["up", "down", "j", "k"])
const ENTER = new Set(["enter", "return"])

export function HttpPostmanModal({
  terminalWidth,
  terminalHeight,
  onWorkspaceSelected,
  onClose,
}: {
  terminalWidth: number
  terminalHeight: number
  onWorkspaceSelected: (workspace: PostmanWorkspace, result: LivePostmanSession) => Promise<void>
  onClose: () => void
}) {
  const renderer = useRenderer()
  const listRef = useRef<ScrollBoxRenderable | null>(null)
  const apiRef = useRef<PostmanApi | null>(null)
  const loadingSession = useRef<LivePostmanSession | null>(null)
  const [workspaces, setWorkspaces] = useState<PostmanWorkspace[]>([])
  const [selection, setSelection] = useState(0)
  useEffect(() => {
    listRef.current?.scrollTo(Math.max(0, selection - 2))
  }, [selection])

  const [environments, setEnvironments] = useState<PostmanEnvironment[]>([])
  const [environmentIndex, setEnvironmentIndex] = useState(0)
  const [busy, setBusy] = useState(true)
  const requestCounts = usePostmanRequestCounts(apiRef, workspaces, busy)
  const [progress, setProgress] = useState("")
  const [disconnected, setDisconnected] = useState(false)
  const [error, setError] = useState("")
  const [failures, setFailures] = useState<string[]>([])
  const width = Math.max(1, Math.min(84, terminalWidth - 2))
  const contentHeight =
    (terminalHeight < 20 ? 7 : 10) + Math.max(1, failures.length || workspaces.length)
  const height = Math.max(
    1,
    Math.min(27, terminalHeight - 2, contentHeight + Number(Boolean(error))),
  )

  useEffect(() => {
    let disposed = false
    void loadPostmanAccount()
      .then(async (account) => {
        if (disposed) return
        if (!account) return setDisconnected(true)
        const api = new PostmanApi(account)
        const available = await api.workspaces()
        if (disposed) return
        apiRef.current = api
        setWorkspaces(available)
      })
      .catch((cause) => {
        if (!disposed) setError(cause instanceof Error ? cause.message : String(cause))
      })
      .finally(() => {
        if (!disposed) setBusy(false)
      })
    return () => {
      disposed = true
      apiRef.current = null
      loadingSession.current?.dispose()
      loadingSession.current = null
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(
      () => renderer.root.findDescendantById("http-postman-modal")?.focus(),
      0,
    )
    return () => clearTimeout(timer)
  }, [renderer])

  useEffect(() => {
    const api = apiRef.current
    const workspace = workspaces[selection]
    if (!api || !workspace) return
    let disposed = false
    setEnvironments([])
    setEnvironmentIndex(0)
    void api.environments(workspace.id).then(
      (available) => {
        if (!disposed) setEnvironments(available)
      },
      () => {
        if (!disposed) setEnvironments([])
      },
    )
    return () => {
      disposed = true
    }
  }, [selection, workspaces])

  const choose = useCallback(
    async (workspace: PostmanWorkspace) => {
      const api = apiRef.current
      if (!api || busy || loadingSession.current) return
      setBusy(true)
      setError("")
      setFailures([])
      setProgress("Carregando coleções…")
      try {
        const result = new LivePostmanSession(
          api,
          workspace.id,
          environments[environmentIndex - 1]?.uid ?? environments[environmentIndex - 1]?.id,
        )
        loadingSession.current = result
        await result.load((done, total) => {
          if (apiRef.current === api) setProgress(`Coleções ${done}/${total}…`)
        })
        if (apiRef.current !== api) {
          result.dispose()
          return
        }
        await onWorkspaceSelected(workspace, result)
        loadingSession.current = null
        if (result.errors.length) setFailures(result.errors)
        else onClose()
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause))
      } finally {
        loadingSession.current?.dispose()
        loadingSession.current = null
        if (apiRef.current === api) {
          setBusy(false)
          setProgress("")
        }
      }
    },
    [busy, environmentIndex, environments, onClose, onWorkspaceSelected],
  )

  useKeyboard((key) => {
    const name = key.name
    if (busy) {
      key.preventDefault()
      key.stopPropagation()
      return
    }
    if (name !== "escape" && name !== "e" && !ARROWS.has(name) && !ENTER.has(name)) return
    key.preventDefault()
    key.stopPropagation()
    if (name === "escape" || (failures.length && ENTER.has(name))) return onClose()
    if (failures.length || disconnected) return
    if (name === "e") return setEnvironmentIndex((index) => (index + 1) % (environments.length + 1))
    if (ARROWS.has(name)) {
      setSelection((index) =>
        Math.max(
          0,
          Math.min(workspaces.length - 1, index + (name === "up" || name === "k" ? -1 : 1)),
        ),
      )
    } else if (ENTER.has(name) && workspaces[selection]) {
      void choose(workspaces[selection])
    }
  })

  const footerActions = () => {
    if (failures.length)
      return [{ id: "http-postman-done", label: "[Enter] Concluir", onPress: onClose }]
    if (busy || disconnected || !workspaces.length) return []
    return [
      {
        id: "http-postman-open",
        label: "[Enter] Abrir workspace",
        onPress: () => {
          const workspace = workspaces[selection]
          if (workspace) void choose(workspace)
        },
      },
    ]
  }
  return (
    <HttpDialog
      fitContent={busy || disconnected}
      id="http-postman-modal"
      title="WORKSPACES POSTMAN"
      width={width}
      height={height}
      terminalWidth={terminalWidth}
      terminalHeight={terminalHeight}
      onClose={onClose}
      zIndex={140}
      busy={busy}
      closeId="http-postman-close"
      actions={footerActions()}
    >
      {busy ? (
        <HttpDialogSection title="Postman">
          <text
            content={translateUi(progress || "Carregando Postman...")}
            style={{ fg: COLORS.muted }}
          />
        </HttpDialogSection>
      ) : null}
      {disconnected ? (
        <HttpDialogSection title="Postman">
          <HttpDialogNotice text="Conecte a conta: tuiminal postman login" />
        </HttpDialogSection>
      ) : null}
      {error ? (
        <text
          content={truncateDisplay(translateUi(error), width - 4)}
          style={{ fg: COLORS.danger }}
        />
      ) : null}
      {failures.length ? (
        <>
          <text
            content={translateUi(`${failures.length} coleções não puderam ser carregadas.`)}
            style={{ fg: COLORS.warning }}
          />
          <scrollbox scrollY style={{ flexGrow: 1 }}>
            {failures.map((failure) => (
              <text
                key={failure}
                content={truncateDisplay(translateUi(failure), width - 4)}
                style={{ fg: COLORS.warning }}
              />
            ))}
          </scrollbox>
        </>
      ) : !busy && !disconnected ? (
        <>
          <text
            content={`${translateUi("WORKSPACES POSTMAN")} · ${workspaces.length}`}
            style={{ height: 1, flexShrink: 0, fg: COLORS.muted }}
          />
          {workspaces.length === 0 ? (
            <text
              content={translateUi("Nenhum workspace acessível.")}
              style={{ fg: COLORS.muted }}
            />
          ) : null}
          <scrollbox
            ref={listRef}
            scrollY
            style={{ flexGrow: 1, minHeight: 0, overflow: "hidden" }}
          >
            {workspaces.map((workspace, index) => (
              <HttpPostmanWorkspaceRow
                key={workspace.id}
                workspace={workspace}
                count={requestCounts[workspace.id]}
                selected={index === selection}
                width={Math.min(width, terminalWidth - 2) - 5}
                onPress={() => void choose(workspace)}
              />
            ))}
          </scrollbox>
          <box
            style={{
              height: 1,
              flexShrink: 0,
              flexDirection: "row",
              marginTop: terminalHeight < 20 ? 0 : 1,
            }}
          >
            <InlineButton
              id="http-postman-environment"
              label="[E] Ambiente"
              accent={COLORS.http}
              onPress={() =>
                setEnvironmentIndex((index) => (index + 1) % (environments.length + 1))
              }
            />
            <text
              content={truncateDisplay(
                environments[environmentIndex - 1]?.name ?? translateUi("Sem ambiente"),
                Math.max(1, width - 24),
              )}
              wrapMode="none"
              style={{ height: 1, fg: COLORS.text, flexGrow: 1, minWidth: 0 }}
            />
          </box>
          <ShortcutText content="[↑/↓] Navegar" style={{ fg: COLORS.muted, flexShrink: 0 }} />
        </>
      ) : null}
    </HttpDialog>
  )
}
