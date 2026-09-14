import type { InputRenderable } from "@opentui/core"
import type { ButtonRenderable } from "@tuiparts/core/button"
import { useEffect, useRef } from "react"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import type { PasswordInputRenderable } from "@xupon/tuiminal-core/ui/PasswordInput"
import "@xupon/tuiminal-core/ui/PasswordInput"
import type { HttpEnvironment } from "../storage/environments"

function fieldStyle(secret = false) {
  return {
    flexGrow: 1,
    backgroundColor: COLORS.panelRaised,
    focusedBackgroundColor: COLORS.panelRaised,
    textColor: secret ? COLORS.panelRaised : COLORS.text,
    focusedTextColor: secret ? COLORS.panelRaised : COLORS.text,
    selectionFg: secret ? COLORS.panelRaised : COLORS.text,
    cursorColor: COLORS.http,
    placeholderColor: COLORS.muted,
  }
}

export function HttpEnvironmentList({
  environments,
  activeName,
  selection,
  onSelect,
  onCreate,
  onOpenWorkspaceSettings,
}: {
  environments: HttpEnvironment[]
  activeName: string | null
  selection: number
  onSelect: (name: string | null) => void
  onCreate: () => void
  onOpenWorkspaceSettings: () => void
}) {
  const listRefs = useRef(new Map<number, ButtonRenderable>())
  const choices: Array<string | null> = [
    null,
    ...environments.map((environment) => environment.name),
  ]

  useEffect(() => {
    const timer = setTimeout(() => listRefs.current.get(selection)?.focus(), 0)
    return () => clearTimeout(timer)
  }, [selection])

  return (
    <>
      <text
        content={translateUi("Escolha o ambiente usado para preparar e enviar requests.")}
        style={{ fg: COLORS.muted }}
      />
      <scrollbox scrollY viewportCulling style={{ flexGrow: 1, paddingTop: 1 }}>
        {choices.map((name, index) => {
          const environment = name
            ? environments.find((candidate) => candidate.name === name)
            : undefined
          const details = environment
            ? `${environment.production ? " · PROD" : ""} · ${translateUi(`${environment.privateNames.size} privado(s)`)} · ${environment.directory || "/"}`
            : ""
          return (
            <InlineButton
              key={name ?? "none"}
              id={`http-environment-choice-${name ?? "none"}`}
              buttonRef={(button) => {
                if (button) listRefs.current.set(index, button)
                else listRefs.current.delete(index)
              }}
              label={`${name === activeName ? "◆" : "◇"} ${name ?? "Sem ambiente"}${details}`}
              accent={environment?.production ? COLORS.danger : COLORS.http}
              active={index === selection}
              onPress={() => onSelect(name)}
            />
          )
        })}
      </scrollbox>
      <text content={translateUi("[↑/↓] Navegar · [Enter] Usar")} style={{ fg: COLORS.muted }} />
      <InlineButton
        id="http-environment-new-private"
        label="[N] Novo ambiente privado"
        accent={COLORS.http}
        onPress={onCreate}
      />
      <InlineButton
        id="http-environment-workspace-settings"
        label="[W] Defaults do workspace"
        accent={COLORS.http}
        onPress={onOpenWorkspaceSettings}
      />
    </>
  )
}

export function HttpPrivateEnvironmentForm({
  environmentName,
  variableName,
  secret,
  addToGitignore,
  storeInKeychain,
  busy,
  error,
  privateEnvironmentPath,
  onEnvironmentNameChange,
  onVariableNameChange,
  onSecretChange,
  onToggleGitignore,
  onToggleKeychain,
  onBack,
  onSave,
}: {
  environmentName: string
  variableName: string
  secret: string
  addToGitignore: boolean
  storeInKeychain: boolean
  busy: boolean
  error: string
  privateEnvironmentPath: string
  onEnvironmentNameChange: (value: string) => void
  onVariableNameChange: (value: string) => void
  onSecretChange: (value: string) => void
  onToggleGitignore: () => void
  onToggleKeychain: () => void
  onBack: () => void
  onSave: () => void
}) {
  const environmentRef = useRef<InputRenderable | null>(null)
  const variableRef = useRef<InputRenderable | null>(null)
  const secretRef = useRef<PasswordInputRenderable | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => environmentRef.current?.focus(), 0)
    return () => clearTimeout(timer)
  }, [])

  return (
    <>
      <text
        content={translateUi("Crie uma variável secreta sem gravá-la no request.")}
        style={{ fg: COLORS.muted }}
      />
      <text
        content={`${translateUi("ARQUIVO")}  ${privateEnvironmentPath}`}
        style={{ fg: COLORS.muted }}
      />
      <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
        <text content={translateUi("AMBIENTE")} style={{ width: 14, fg: COLORS.muted }} />
        <input
          ref={environmentRef}
          id="http-environment-create-name"
          value={environmentName}
          placeholder="local"
          maxLength={80}
          onInput={onEnvironmentNameChange}
          onMouseDown={() => environmentRef.current?.focus()}
          style={fieldStyle()}
        />
      </box>
      <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
        <text content={translateUi("VARIÁVEL")} style={{ width: 14, fg: COLORS.muted }} />
        <input
          ref={variableRef}
          id="http-environment-create-variable"
          value={variableName}
          placeholder="apiToken"
          maxLength={120}
          onInput={onVariableNameChange}
          onMouseDown={() => variableRef.current?.focus()}
          style={fieldStyle()}
        />
      </box>
      <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
        <text content={translateUi("VALOR PRIVADO")} style={{ width: 14, fg: COLORS.muted }} />
        <password-input
          ref={secretRef}
          id="http-environment-create-secret"
          value={secret}
          placeholder={translateUi("não será exibido")}
          maxLength={4096}
          onInput={onSecretChange}
          onMouseDown={() => secretRef.current?.focus()}
          style={fieldStyle(true)}
        />
      </box>
      <InlineButton
        id="http-environment-gitignore"
        label={`[G] ${addToGitignore ? "◆" : "◇"} Adicionar ao .gitignore`}
        accent={addToGitignore ? COLORS.http : COLORS.warning}
        active={addToGitignore}
        onPress={onToggleGitignore}
      />
      <InlineButton
        id="http-environment-keychain"
        label={`[Ctrl+K] ${storeInKeychain ? "◆" : "◇"} Guardar no keychain`}
        accent={COLORS.http}
        active={storeInKeychain}
        onPress={onToggleKeychain}
      />
      <text
        content={translateUi(
          storeInKeychain
            ? "O JSON guardará apenas uma referência opaca ao keychain."
            : "O valor será gravado somente no arquivo privado protegido.",
        )}
        style={{ fg: COLORS.muted }}
      />
      <text
        content={translateUi(
          addToGitignore
            ? "O arquivo privado será protegido por uma regra do projeto."
            : "Atenção: o arquivo privado poderá ser incluído em um commit.",
        )}
        style={{ fg: addToGitignore ? COLORS.muted : COLORS.warning }}
      />
      {error ? <text content={translateUi(error)} style={{ fg: COLORS.danger }} /> : null}
      <box style={{ flexGrow: 1 }} />
      <box style={{ height: 1, flexShrink: 0, flexDirection: "row", justifyContent: "flex-end" }}>
        <InlineButton
          id="http-environment-back"
          label="[B] Ambientes"
          accent={COLORS.http}
          onPress={onBack}
        />
        <InlineButton
          id="http-environment-create-save"
          label={busy ? "SALVANDO…" : "[Ctrl+S] Criar privado"}
          accent={COLORS.http}
          disabled={busy}
          onPress={onSave}
        />
      </box>
    </>
  )
}
