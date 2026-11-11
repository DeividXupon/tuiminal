import type { InputRenderable } from "@opentui/core"
import { useKeyboard } from "@opentui/react"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { useEffect, useRef, useState } from "react"
import { loadPostmanAccount } from "../postman/account"
import { PostmanApi, type PostmanWorkspace } from "../postman/api"
import { LivePostmanSession } from "../postman/live-session"
import { HttpDialog } from "./HttpDialog"
import { HttpDialogNotice, HttpDialogSection } from "./HttpDialogDetails"

async function createPersonalWorkspace(name: string, isActive: () => boolean) {
  const account = await loadPostmanAccount()
  if (!isActive()) return null
  if (!account) throw new Error("Postman desconectado. Execute: tuiminal postman login")
  const api = new PostmanApi(account)
  const workspace = await api.createWorkspace(name)
  return { api, workspace }
}

export function HttpPostmanWorkspaceCreateModal({
  terminalWidth,
  terminalHeight,
  onWorkspaceSelected,
  onClose,
}: {
  terminalWidth: number
  terminalHeight: number
  onWorkspaceSelected: (workspace: PostmanWorkspace, session: LivePostmanSession) => Promise<void>
  onClose: () => void
}) {
  const input = useRef<InputRenderable | null>(null)
  const mounted = useRef(true)
  const pending = useRef(false)
  const created = useRef<{ api: PostmanApi; workspace: PostmanWorkspace } | null>(null)
  const loading = useRef<LivePostmanSession | null>(null)
  const [name, setName] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  useEffect(() => {
    mounted.current = true
    const timer = setTimeout(() => input.current?.focus(), 0)
    return () => {
      mounted.current = false
      clearTimeout(timer)
      loading.current?.dispose()
      loading.current = null
    }
  }, [])

  const createAndOpen = async () => {
    created.current ??= await createPersonalWorkspace(name, () => mounted.current)
    if (!mounted.current || !created.current) return
    const { api, workspace } = created.current
    const session = new LivePostmanSession(api, workspace.id)
    loading.current = session
    await session.load()
    if (!mounted.current) return
    if (session.errors.length) throw new Error(session.errors.join("\n"))
    await onWorkspaceSelected(workspace, session)
    loading.current = null
    if (mounted.current) onClose()
  }
  const apply = async () => {
    if (pending.current || !name.trim()) return
    pending.current = true
    setBusy(true)
    setError("")
    try {
      await createAndOpen()
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      loading.current?.dispose()
      loading.current = null
      pending.current = false
      if (mounted.current) setBusy(false)
    }
  }

  useKeyboard((key) => {
    if (key.defaultPrevented) return
    if (!busy && key.name !== "escape" && key.name !== "return" && key.name !== "enter") return
    key.preventDefault()
    key.stopPropagation()
    if (busy) return
    if (key.name === "escape") onClose()
    else void apply()
  })

  return (
    <HttpDialog
      fitContent
      scrollContent
      id="http-postman-create-workspace"
      title="NOVO WORKSPACE POSTMAN"
      width={62}
      height={terminalHeight < 20 ? 12 : terminalHeight - 2}
      terminalWidth={terminalWidth}
      terminalHeight={terminalHeight}
      busy={busy}
      onClose={onClose}
      zIndex={140}
      actions={[
        {
          id: "http-postman-workspace-create-apply",
          label: created.current ? "[Enter] Abrir workspace" : "[Enter] Criar workspace",
          disabled: busy || !name.trim(),
          onPress: () => void apply(),
        },
      ]}
    >
      <HttpDialogSection title="Postman">
        <HttpDialogNotice text="Será criado um workspace pessoal no Postman." />
      </HttpDialogSection>
      <box style={{ flexShrink: 0, marginTop: 1 }}>
        <text content={translateUi("Nome do workspace")} fg={COLORS.text} />
        {created.current ? (
          <text content={created.current.workspace.name} fg={COLORS.text} />
        ) : (
          <input
            id="http-postman-workspace-name"
            ref={input}
            value={name}
            onInput={(value) => {
              if (!pending.current) setName(value)
            }}
            onMouseDown={() => input.current?.focus()}
            backgroundColor={COLORS.canvas}
            focusedBackgroundColor={COLORS.canvas}
            textColor={COLORS.text}
            focusedTextColor={COLORS.text}
            cursorColor={COLORS.http}
          />
        )}
        {busy ? (
          <text
            content={translateUi(created.current ? "Carregando coleções…" : "Criando workspace…")}
            fg={COLORS.muted}
          />
        ) : null}
        {error ? <text content={translateUi(error)} fg={COLORS.danger} /> : null}
        {error && created.current ? (
          <text
            content={translateUi("Workspace criado. Tente abrir novamente.")}
            fg={COLORS.muted}
          />
        ) : null}
      </box>
    </HttpDialog>
  )
}
