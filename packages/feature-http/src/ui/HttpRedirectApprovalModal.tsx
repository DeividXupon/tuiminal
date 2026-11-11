import type { BoxRenderable, Renderable, ScrollBoxRenderable } from "@opentui/core"
import { useKeyboard, useRenderer } from "@opentui/react"
import { displayWidth, translateUi } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { useEffect, useRef } from "react"
import { httpInsecureTlsApproval } from "../model/tls-policy"
import type { PendingHttpRedirect } from "../services/redirect-approvals"
import { HttpDialog } from "./HttpDialog"
import { HttpDialogNotice, HttpDialogSection } from "./HttpDialogDetails"
import { HttpInsecureTlsModal } from "./HttpInsecureTlsModal"

const RISK_COPY = {
  body: "O corpo será enviado a outra origem e pode conter dados privados.",
  "private-url": "A URL do novo destino contém valores privados.",
  downgrade: "HTTPS → HTTP: o próximo envio não será criptografado.",
  "insecure-tls": "A identidade do servidor não será verificada neste destino.",
}

export function HttpRedirectApprovalModal({
  pending,
  decide,
  terminalWidth,
  terminalHeight,
}: {
  pending: PendingHttpRedirect
  decide: (id: number, allowed: boolean) => void
  terminalWidth: number
  terminalHeight: number
}) {
  const renderer = useRenderer()
  const returnFocus = useRef(renderer.currentFocusedRenderable)
  const modalRef = useRef<BoxRenderable | null>(null)
  const scrollRef = useRef<ScrollBoxRenderable | null>(null)
  const focusedApproval = useRef<number | null>(null)
  const approval = pending.approval
  const onlyTls = approval.risks.length === 1 && approval.risks[0] === "insecure-tls"
  const width = Math.max(1, Math.min(88, terminalWidth - 2))
  const contentLines = [
    approval.fromOrigin,
    `→ ${approval.toOrigin}`,
    `${approval.method} ${approval.displayUrl}`,
    `${translateUi("AMBIENTE")}  ${approval.environmentName ?? translateUi("Sem ambiente")}`,
    ...approval.risks.map((risk) => translateUi(RISK_COPY[risk])),
    translateUi("Headers privados da origem não serão encaminhados."),
    translateUi("Continuar envia somente este salto, sem repetir as requisições anteriores."),
  ]
  const contentRows = contentLines.reduce(
    (rows, line) => rows + Math.max(1, Math.ceil(displayWidth(line) / Math.max(1, width - 5))),
    0,
  )
  const height = Math.max(1, Math.min(24, terminalHeight - 2, 10 + contentRows))
  useEffect(
    () => () => {
      const previous = returnFocus.current
      const focused = renderer.currentFocusedRenderable
      if (renderer.isDestroyed || !previous || previous.isDestroyed) return
      for (let ancestor: Renderable | null = previous; ancestor; ancestor = ancestor.parent) {
        if (!ancestor.visible) return
      }
      if (
        focused &&
        !focused.id.startsWith("http-redirect-approval-") &&
        !focused.id.startsWith("http-insecure-tls-")
      )
        return
      previous.focus()
    },
    [renderer],
  )
  useEffect(() => {
    if (focusedApproval.current === pending.id) return
    focusedApproval.current = pending.id
    renderer.currentFocusedRenderable?.blur()
    if (onlyTls) renderer.root.findDescendantById("http-insecure-tls-modal")?.focus()
    else modalRef.current?.focus()
  }, [onlyTls, pending.id, renderer])
  const confirm = () => decide(pending.id, true)
  const cancel = () => decide(pending.id, false)
  // OpenTUI key events do not bubble from a focused child to its parent box.
  // This mounted-only listener also owns keys while a modal button is focused.
  useKeyboard((key) => {
    key.preventDefault()
    key.stopPropagation()
    if (key.repeated || key.eventType !== "press" || key.ctrl || key.meta || key.option) return
    if (key.name === "escape") cancel()
    else if (key.name === (onlyTls ? "i" : "y")) confirm()
    else if (key.name === "up" || key.name === "down")
      scrollRef.current?.scrollBy(key.name === "up" ? -1 : 1)
  })
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: OpenTUI modal backdrop blocks mouse propagation.
    <box
      id="http-redirect-approval-layer"
      onMouseDown={(event) => event.stopPropagation()}
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: terminalWidth,
        height: terminalHeight,
        zIndex: 250,
      }}
    >
      {onlyTls ? (
        <HttpInsecureTlsModal
          approval={httpInsecureTlsApproval(approval.toOrigin, approval.environmentName ?? null)}
          terminalWidth={terminalWidth}
          terminalHeight={terminalHeight}
          onConfirm={confirm}
          onClose={cancel}
        />
      ) : (
        <HttpDialog
          id="http-redirect-approval-modal"
          title="AUTORIZAR ESTE REDIRECT?"
          width={width}
          height={height}
          terminalWidth={terminalWidth}
          terminalHeight={terminalHeight}
          dialogRef={modalRef}
          accent={COLORS.danger}
          zIndex={250}
          onClose={cancel}
          closeLabel="[Esc] Não seguir"
          closeId="http-redirect-approval-deny"
          actions={[
            {
              id: "http-redirect-approval-confirm",
              label: "[Y] Autorizar este salto",
              accent: COLORS.danger,
              onPress: confirm,
            },
          ]}
        >
          <scrollbox ref={scrollRef} scrollY style={{ flexGrow: 1, minHeight: 0 }}>
            <HttpDialogSection title="ORIGEM" accent={COLORS.muted}>
              <text
                content={approval.fromOrigin}
                wrapMode="word"
                style={{ flexShrink: 0, fg: COLORS.muted }}
              />
            </HttpDialogSection>
            <box style={{ flexShrink: 0, marginTop: 1, marginBottom: 1 }}>
              <HttpDialogSection title="DESTINO" accent={COLORS.warning}>
                <text
                  content={`→ ${approval.toOrigin}`}
                  wrapMode="word"
                  style={{ flexShrink: 0, fg: COLORS.text }}
                />
                <text
                  content={`${approval.method} ${approval.displayUrl}`}
                  wrapMode="word"
                  style={{ flexShrink: 0, fg: COLORS.text }}
                />
                <text
                  content={`${translateUi("AMBIENTE")}  ${approval.environmentName ?? translateUi("Sem ambiente")}`}
                  style={{ fg: COLORS.muted }}
                />
              </HttpDialogSection>
            </box>
            {approval.risks.map((risk) => (
              <text
                key={risk}
                content={translateUi(RISK_COPY[risk])}
                style={{ fg: COLORS.warning }}
              />
            ))}
            <HttpDialogNotice text="Headers privados da origem não serão encaminhados." />
            <text
              content={translateUi(
                "Continuar envia somente este salto, sem repetir as requisições anteriores.",
              )}
              style={{ fg: COLORS.text }}
            />
          </scrollbox>
        </HttpDialog>
      )}
    </box>
  )
}
