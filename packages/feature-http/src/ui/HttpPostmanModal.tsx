import { useKeyboard, useRenderer } from "@opentui/react"
import { useCallback, useEffect, useRef, useState } from "react"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { translateUi, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { loadPostmanAccount } from "../postman/account"
import { PostmanApi, type PostmanEnvironment, type PostmanWorkspace } from "../postman/api"
import { postmanDisplayName } from "../postman/display"
import { syncPostmanWorkspace, type WorkspaceSyncResult } from "../postman/workspace-sync"

const ARROWS = new Set(["up", "down", "j", "k"])
const ENTER = new Set(["enter", "return"])

export function HttpPostmanModal({
  root,
  terminalWidth,
  terminalHeight,
  onWorkspaceSelected,
  onClose,
}: {
  root: string
  terminalWidth: number
  terminalHeight: number
  onWorkspaceSelected: (workspace: PostmanWorkspace, result: WorkspaceSyncResult) => Promise<void>
  onClose: () => void
}) {
  const renderer = useRenderer()
  const apiRef = useRef<PostmanApi | null>(null)
  const [workspaces, setWorkspaces] = useState<PostmanWorkspace[]>([])
  const [selection, setSelection] = useState(0)
  const [environments, setEnvironments] = useState<PostmanEnvironment[]>([])
  const [environmentIndex, setEnvironmentIndex] = useState(0)
  const [busy, setBusy] = useState(true)
  const [progress, setProgress] = useState("")
  const [disconnected, setDisconnected] = useState(false)
  const [error, setError] = useState("")
  const [failures, setFailures] = useState<string[]>([])
  const width = Math.min(84, Math.max(42, terminalWidth - 4))
  const height = Math.min(27, Math.max(13, terminalHeight - 2))

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
      if (!api || busy) return
      setBusy(true)
      setError("")
      setFailures([])
      setProgress("Carregando coleções…")
      try {
        const result = await syncPostmanWorkspace(
          root,
          api,
          workspace.id,
          (done, total) => setProgress(`Coleções ${done}/${total}…`),
          environments[environmentIndex - 1]?.uid ?? environments[environmentIndex - 1]?.id,
        )
        if (apiRef.current !== api) return
        await onWorkspaceSelected(workspace, result)
        if (result.errors.length) setFailures(result.errors)
        else onClose()
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause))
      } finally {
        setBusy(false)
        setProgress("")
      }
    },
    [busy, environmentIndex, environments, onClose, onWorkspaceSelected, root],
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

  return (
    <>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: the backdrop blocks workspace pointer input. */}
      <box
        id="http-postman-backdrop"
        onMouseDown={(event) => {
          event.preventDefault()
          event.stopPropagation()
        }}
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: "100%",
          height: "100%",
          zIndex: 124,
        }}
      />
      <box
        id="http-postman-modal"
        focusable
        style={{
          position: "absolute",
          left: Math.max(0, Math.floor((terminalWidth - width) / 2)),
          top: Math.max(0, Math.floor((terminalHeight - height) / 2)),
          width,
          height,
          zIndex: 125,
          border: true,
          borderStyle: "rounded",
          borderColor: COLORS.http,
          backgroundColor: COLORS.panelRaised,
          paddingLeft: 1,
          paddingRight: 1,
        }}
      >
        <box
          style={{
            height: 1,
            flexShrink: 0,
            flexDirection: "row",
            justifyContent: "space-between",
          }}
        >
          <text content={translateUi("WORKSPACES POSTMAN")} style={{ fg: COLORS.http }} />
          <InlineButton
            id="http-postman-close"
            label="[Esc] Fechar"
            accent={COLORS.http}
            disabled={busy}
            onPress={onClose}
          />
        </box>
        {busy ? (
          <text
            content={translateUi(progress || "Carregando Postman...")}
            style={{ fg: COLORS.muted }}
          />
        ) : null}
        {disconnected ? (
          <text
            content={translateUi("Conecte a conta: tuiminal postman login")}
            style={{ fg: COLORS.warning }}
          />
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
            <InlineButton
              id="http-postman-done"
              label="[Enter] Concluir"
              accent={COLORS.http}
              onPress={onClose}
            />
          </>
        ) : !busy && !disconnected ? (
          <>
            {workspaces.length === 0 ? (
              <text
                content={translateUi("Nenhum workspace acessível.")}
                style={{ fg: COLORS.muted }}
              />
            ) : null}
            <scrollbox scrollY style={{ flexGrow: 1 }}>
              {workspaces.map((workspace, index) => (
                <InlineButton
                  key={workspace.id}
                  id={`http-postman-workspace-${workspace.id}`}
                  label={truncateDisplay(
                    `${postmanDisplayName(workspace.name)} · ${postmanDisplayName(workspace.visibility ?? "")}`,
                    width - 6,
                  )}
                  accent={COLORS.http}
                  active={index === selection}
                  onPress={() => void choose(workspace)}
                />
              ))}
            </scrollbox>
            <InlineButton
              id="http-postman-environment"
              label={`[E] ${environments[environmentIndex - 1]?.name ?? translateUi("Sem ambiente")}`}
              accent={COLORS.http}
              onPress={() =>
                setEnvironmentIndex((index) => (index + 1) % (environments.length + 1))
              }
            />
            <text
              content={translateUi("[↑/↓] escolher · [Enter] abrir coleções")}
              style={{ fg: COLORS.muted }}
            />
          </>
        ) : null}
      </box>
    </>
  )
}
