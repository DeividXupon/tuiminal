import type { TextareaRenderable } from "@opentui/core"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  DEFAULT_SENSITIVE_TERMS,
  parseSensitiveTerms,
  SENSITIVE_TERMS_LIMIT,
} from "@xupon/tuiminal-core/security/sensitive-data"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { ModalSurface } from "@xupon/tuiminal-core/ui/ModalSurface"

type SensitiveTermsModalProps = {
  open: boolean
  terms: string[]
  onClose: () => void
  onSave: (terms: string[]) => void
}

export function SensitiveTermsModal({ open, terms, onClose, onSave }: SensitiveTermsModalProps) {
  const renderer = useRenderer()
  const terminal = useTerminalDimensions()
  const editorRef = useRef<TextareaRenderable | null>(null)
  const [draft, setDraft] = useState(() => terms.join(", "))
  const [error, setError] = useState("")

  useEffect(() => {
    if (!open) return
    renderer.currentFocusedRenderable?.blur()
    const nextDraft = terms.join(", ")
    setDraft(nextDraft)
    setError("")
    const timeout = setTimeout(() => editorRef.current?.focus(), 0)
    return () => clearTimeout(timeout)
  }, [open, renderer, terms])

  const parsedCount = useMemo(() => {
    try {
      return parseSensitiveTerms(draft).length
    } catch {
      return null
    }
  }, [draft])

  const save = useCallback(() => {
    try {
      const nextTerms = parseSensitiveTerms(editorRef.current?.plainText ?? draft)
      setError("")
      onSave(nextTerms)
    } catch (parseError) {
      setError(
        parseError instanceof Error ? parseError.message : "Não foi possível validar os termos.",
      )
    }
  }, [draft, onSave])

  const restoreDraft = useCallback(() => {
    const nextDraft = DEFAULT_SENSITIVE_TERMS.join(", ")
    editorRef.current?.editBuffer.setText(nextDraft)
    setDraft(nextDraft)
    setError("")
    editorRef.current?.focus()
  }, [])

  const clearDraft = useCallback(() => {
    editorRef.current?.editBuffer.setText("")
    setDraft("")
    setError("")
    editorRef.current?.focus()
  }, [])

  useKeyboard((key) => {
    if (!open) return
    if (key.name === "escape") {
      key.preventDefault()
      key.stopPropagation()
      onClose()
      return
    }
    if (key.ctrl && key.name === "s") {
      key.preventDefault()
      key.stopPropagation()
      save()
      return
    }
    if (key.ctrl && key.name === "r") {
      key.preventDefault()
      key.stopPropagation()
      restoreDraft()
      return
    }
    if (key.ctrl && key.name === "l") {
      key.preventDefault()
      key.stopPropagation()
      clearDraft()
    }
  })

  if (!open) return null
  const width = Math.max(1, Math.min(88, terminal.width - 2))
  const height = Math.max(1, Math.min(16, terminal.height))
  const compact = width < 64 || height < 14
  const editorHeight = Math.max(3, height - (compact ? 6 : 8))
  const empty = parsedCount === 0

  return (
    <ModalSurface
      id="database-sensitive-terms-dialog"
      layerId="database-sensitive-terms-modal"
      layerFocusable
      dialogFocusable={false}
      width={width}
      height={height}
      zIndex={930}
      borderColor={COLORS.warning}
      backdropOpacity={0.9}
      horizontalPadding={compact ? 1 : 2}
      onBackdropPress={onClose}
    >
      <box
        style={{
          height: 2,
          flexShrink: 0,
          flexDirection: "row",
          justifyContent: "space-between",
          border: ["bottom"],
          borderColor: COLORS.border,
        }}
      >
        <text content="◆ TERMOS SENSÍVEIS" style={{ fg: COLORS.warning }} />
        <InlineButton label={compact ? "[Esc]" : "[Esc] Cancelar"} onPress={onClose} />
      </box>

      <text
        content={translateUi("Informe fragmentos encontrados no nome das colunas.")}
        style={{ height: 1, flexShrink: 0, fg: COLORS.text }}
      />
      {compact ? null : (
        <text
          content={translateUi(
            "Separe por vírgula ou linha · maiúsculas e separadores são ignorados.",
          )}
          style={{ height: 1, flexShrink: 0, fg: COLORS.muted }}
        />
      )}

      <box
        style={{
          height: editorHeight,
          flexShrink: 0,
          border: true,
          borderColor: error ? COLORS.danger : COLORS.border,
          backgroundColor: COLORS.panel,
        }}
      >
        <textarea
          ref={editorRef}
          id="database-sensitive-terms-editor"
          initialValue={terms.join(", ")}
          placeholder="password, token, cpf, email"
          width="100%"
          height="100%"
          onMouseDown={() => editorRef.current?.focus()}
          onContentChange={() => {
            setDraft(editorRef.current?.plainText ?? "")
            setError("")
          }}
          style={{
            backgroundColor: COLORS.panel,
            focusedBackgroundColor: COLORS.panel,
            textColor: COLORS.text,
            focusedTextColor: COLORS.text,
            cursorColor: COLORS.warning,
            placeholderColor: COLORS.muted,
            paddingLeft: 1,
            paddingRight: 1,
          }}
        />
      </box>

      <box
        style={{
          height: 1,
          flexShrink: 0,
          flexDirection: "row",
          justifyContent: "space-between",
        }}
      >
        <text
          content={
            error ||
            (empty
              ? "⚠ Lista vazia: mascaramento automático desativado."
              : `${parsedCount ?? "?"}/${SENSITIVE_TERMS_LIMIT} termos`)
          }
          style={{ fg: error || empty ? COLORS.danger : COLORS.muted }}
        />
      </box>

      <box
        style={{
          height: 1,
          flexShrink: 0,
          flexDirection: "row",
          justifyContent: "flex-end",
        }}
      >
        <InlineButton
          label={compact ? "[Ctrl+L]" : "[Ctrl+L] Limpar"}
          accent={COLORS.danger}
          onPress={clearDraft}
        />
        <InlineButton
          label={compact ? "[Ctrl+R]" : "[Ctrl+R] Restaurar padrão"}
          accent={COLORS.muted}
          onPress={restoreDraft}
        />
        <InlineButton
          label={compact ? "[Ctrl+S]" : "[Ctrl+S] Salvar"}
          accent={COLORS.warning}
          onPress={save}
        />
      </box>
    </ModalSurface>
  )
}
