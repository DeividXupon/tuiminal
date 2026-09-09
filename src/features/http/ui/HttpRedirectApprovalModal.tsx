import type { BoxRenderable, Renderable, ScrollBoxRenderable } from "@opentui/core"
import { useKeyboard, useRenderer } from "@opentui/react"
import { useEffect, useRef } from "react"
import { COLORS, panelBorder } from "../../../core/settings/theme"
import { translateUi } from "../../../shared/i18n/index"
import { InlineButton } from "../../../shared/ui/InlineButton"
import type { PendingHttpRedirect } from "../services/redirect-approvals"
import { httpInsecureTlsApproval } from "../model/tls-policy"
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
  const width = Math.min(88, Math.max(24, terminalWidth - 4))
  const height = Math.min(17, Math.max(8, terminalHeight - 4))
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
      style={{ position: "absolute", left: 0, top: 0, width: "100%", height: "100%", zIndex: 250 }}
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
        <box
          id="http-redirect-approval-modal"
          ref={modalRef}
          focusable
          style={{
            position: "absolute",
            left: Math.max(0, Math.floor((terminalWidth - width) / 2)),
            top: 0,
            width,
            height,
            ...panelBorder(COLORS.danger),
            backgroundColor: COLORS.panelRaised,
            paddingLeft: 1,
            paddingRight: 1,
          }}
        >
          <text
            content={translateUi("AUTORIZAR ESTE REDIRECT?")}
            style={{ fg: COLORS.danger, height: 1, flexShrink: 0 }}
          />
          <scrollbox ref={scrollRef} scrollY style={{ flexGrow: 1 }}>
            <text
              content={`${approval.fromOrigin}\n→ ${approval.toOrigin}\n${approval.method} ${approval.displayUrl}`}
              style={{ fg: COLORS.text }}
            />
            <text
              content={`${translateUi("AMBIENTE")}  ${approval.environmentName ?? translateUi("Sem ambiente")}`}
              style={{ fg: COLORS.muted }}
            />
            {approval.risks.map((risk) => (
              <text
                key={risk}
                content={translateUi(RISK_COPY[risk])}
                style={{ fg: COLORS.warning }}
              />
            ))}
            <text
              content={translateUi("Headers privados da origem não serão encaminhados.")}
              style={{ fg: COLORS.muted }}
            />
            <text
              content={translateUi(
                "Continuar envia somente este salto, sem repetir as requisições anteriores.",
              )}
              style={{ fg: COLORS.text }}
            />
          </scrollbox>
          <box style={{ height: 2, flexShrink: 0 }}>
            <InlineButton
              id="http-redirect-approval-deny"
              label="[Esc] Não seguir"
              accent={COLORS.http}
              onPress={cancel}
            />
            <InlineButton
              id="http-redirect-approval-confirm"
              label="[Y] Autorizar este salto"
              accent={COLORS.danger}
              onPress={confirm}
            />
          </box>
        </box>
      )}
    </box>
  )
}
