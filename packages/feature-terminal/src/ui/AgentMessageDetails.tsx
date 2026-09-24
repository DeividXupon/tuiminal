import type { ScrollBoxRenderable } from "@opentui/core"
import { formatUiDateTime, translateUi, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import type { RefObject } from "react"
import {
  type AgentMessageActivityKind,
  agentMessageDiffStats,
  type AgentMessageHistoryEntry,
  agentMessageElapsedLabel,
  agentMessageModelLabel,
  agentMessageStatusLabel,
} from "../model/agent-message-history"
import { AgentMessageDiffDetail } from "./AgentMessageDiffDetail"

export type AgentMessageDetailView = "overview" | "message" | "response" | "activity" | "diff"

function clock(value: number) {
  return formatUiDateTime(value, { hour: "2-digit", minute: "2-digit" })
}

function activityLabel(kind: AgentMessageActivityKind) {
  const labels: Record<AgentMessageActivityKind, string> = {
    message: "Mensagem enviada",
    reasoning: "Resumo público",
    plan: "Plano atualizado",
    command: "Comando executado",
    change: "Arquivos alterados",
    tool: "Ferramenta utilizada",
    response: "Texto do agente",
    other: "Atividade",
  }
  return translateUi(labels[kind])
}

function SectionHeading({
  label,
  shortcut,
  onOpen,
}: {
  label: string
  shortcut: string
  onOpen: () => void
}) {
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: OpenTUI headings are keyboard and mouse actions.
    <box
      onMouseDown={onOpen}
      style={{
        height: 1,
        flexShrink: 0,
        paddingLeft: 1,
        paddingRight: 1,
        backgroundColor: COLORS.panelRaised,
      }}
    >
      <text>
        <span fg={COLORS.text}>{translateUi(label)}</span>
        <span fg={COLORS.terminal}>{` [${shortcut}]`}</span>
      </text>
    </box>
  )
}

function Empty({ text }: { text: string }) {
  return <text content={` ${translateUi(text)}`} style={{ height: 1, fg: COLORS.muted }} />
}

function Overview({
  entry,
  now,
  width,
  height,
  onOpen,
}: {
  entry: AgentMessageHistoryEntry
  now: number
  width: number
  height: number
  onOpen: (view: AgentMessageDetailView) => void
}) {
  const stats = agentMessageDiffStats(entry.turnDiff)
  const activityCount = entry.activities.length + 1 + (entry.status === "completed" ? 1 : 0)
  const attachments = [
    `${translateUi("Imagem")} ${entry.hasImage ? "✓" : "—"}`,
    `${translateUi("Áudio")} ${entry.hasAudio ? "✓" : "—"}`,
    `${translateUi("Skill")} ${entry.hasSkill ? "✓" : "—"}`,
  ].join("   ")
  const previewRows = Math.max(2, Math.min(5, Math.floor(height / 10)))
  const activityPreview = entry.activities.slice(0, previewRows)
  const changePreview = entry.changes.slice(0, previewRows)
  const statusColor =
    entry.status === "completed"
      ? COLORS.success
      : entry.status === "failed" || entry.status === "interrupted"
        ? COLORS.danger
        : COLORS.warning
  const messageHeight = Math.max(4, Math.min(7, Math.floor(height * 0.2)))
  return (
    <box
      id={`agent-message-overview-${entry.id}`}
      style={{
        height: "100%",
        flexGrow: 1,
        minHeight: 1,
        flexDirection: "column",
        gap: 1,
        backgroundColor: COLORS.canvas,
      }}
    >
      <box
        style={{
          height: 2,
          flexShrink: 0,
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          paddingLeft: 1,
          paddingRight: 1,
          backgroundColor: COLORS.panelRaised,
        }}
      >
        <text>
          <span fg={statusColor}>{agentMessageStatusLabel(entry, now)}</span>
          <span
            fg={COLORS.muted}
          >{`  ${translateUi("há")} ${agentMessageElapsedLabel(entry.sentAt, now)}`}</span>
        </text>
        <text
          content={truncateDisplay(
            agentMessageModelLabel(entry),
            Math.max(1, Math.floor(width / 2)),
          )}
          style={{ fg: COLORS.terminal }}
        />
      </box>
      <box
        style={{
          height: messageHeight,
          minHeight: 4,
          flexShrink: 0,
          backgroundColor: COLORS.panel,
        }}
      >
        <SectionHeading label="MENSAGEM" shortcut="M" onOpen={() => onOpen("message")} />
        <text
          content={` ${entry.text || "—"}`}
          wrapMode="word"
          style={{ flexGrow: 1, minHeight: 1, paddingRight: 1, fg: COLORS.text }}
        />
        <text content={` ${attachments}`} style={{ height: 1, flexShrink: 0, fg: COLORS.muted }} />
      </box>
      <box style={{ flexGrow: 2, minHeight: 6, backgroundColor: COLORS.panel }}>
        <SectionHeading label="RESPOSTA FINAL" shortcut="R" onOpen={() => onOpen("response")} />
        {entry.finalResponse ? (
          <text
            content={` ${entry.finalResponse}`}
            wrapMode="word"
            style={{ flexGrow: 1, minHeight: 1, paddingRight: 1, fg: COLORS.text }}
          />
        ) : (
          <Empty
            text={entry.status === "inProgress" ? "Aguardando conclusão…" : "Sem resposta final."}
          />
        )}
      </box>
      <box
        style={{
          flexDirection: width < 80 ? "column" : "row",
          flexGrow: 1,
          minHeight: width < 80 ? 10 : 6,
          gap: 1,
        }}
      >
        <box
          style={{
            width: width < 80 ? "100%" : "50%",
            minHeight: 5,
            flexGrow: 1,
            backgroundColor: COLORS.panel,
          }}
        >
          <SectionHeading label="ATIVIDADE" shortcut="A" onOpen={() => onOpen("activity")} />
          <text
            content={` ${activityCount} ${translateUi("eventos")}`}
            style={{ height: 1, flexShrink: 0, fg: COLORS.graphAccent }}
          />
          {activityPreview.map((item, index) => (
            <box
              key={item.id}
              style={{
                height: 1,
                flexShrink: 0,
                paddingLeft: 1,
                paddingRight: 1,
                backgroundColor: index % 2 === 0 ? COLORS.panelAlt : COLORS.panel,
              }}
            >
              <text
                content={truncateDisplay(
                  `${activityLabel(item.kind)} · ${item.label}`,
                  Math.max(1, (width < 80 ? width : width / 2) - 3),
                )}
                style={{ fg: COLORS.muted }}
              />
            </box>
          ))}
        </box>
        <box
          style={{
            width: width < 80 ? "100%" : "50%",
            minHeight: 5,
            flexGrow: 1,
            backgroundColor: COLORS.panel,
          }}
        >
          <SectionHeading label="ALTERAÇÕES" shortcut="D" onOpen={() => onOpen("diff")} />
          <text style={{ height: 1, flexShrink: 0 }}>
            <span
              fg={COLORS.graphAccent}
            >{` ${entry.changes.length} ${translateUi("arquivos")}`}</span>
            <span fg={COLORS.success}>{`  +${stats.additions}`}</span>
            <span fg={COLORS.danger}>{`  −${stats.deletions}`}</span>
          </text>
          {changePreview.map((change, index) => {
            const changeStats = agentMessageDiffStats(change.diff)
            return (
              <box
                key={change.id}
                style={{
                  height: 1,
                  flexShrink: 0,
                  flexDirection: "row",
                  paddingLeft: 1,
                  paddingRight: 1,
                  backgroundColor: index % 2 === 0 ? COLORS.panelAlt : COLORS.panel,
                }}
              >
                <text
                  content={truncateDisplay(
                    change.path,
                    Math.max(1, (width < 80 ? width : width / 2) - 15),
                  )}
                  style={{ flexGrow: 1, fg: COLORS.text }}
                />
                <text>
                  <span fg={COLORS.success}>{`+${changeStats.additions}`}</span>
                  <span fg={COLORS.danger}>{` −${changeStats.deletions}`}</span>
                </text>
              </box>
            )
          })}
        </box>
      </box>
    </box>
  )
}

function ResponseDetail({ entry }: { entry: AgentMessageHistoryEntry }) {
  const groups = [
    ["RESPOSTA FINAL", entry.finalResponse ? [entry.finalResponse] : []],
    ["RESUMOS PÚBLICOS", entry.reasoningSummaries],
    ["PLANOS", entry.plans],
    ["OUTROS TEXTOS", entry.commentary],
  ] as const
  return (
    <>
      {groups.map(([label, values]) => (
        <box key={label} style={{ flexShrink: 0, marginBottom: 1, backgroundColor: COLORS.panel }}>
          <text
            content={` ${translateUi(label)}`}
            style={{ height: 1, fg: COLORS.terminal, bg: COLORS.panelRaised }}
          />
          {values.length ? (
            values.map((value) => (
              <text
                key={`${label}-${value}`}
                content={` ${value}`}
                wrapMode="word"
                style={{ minHeight: 2, paddingRight: 1, fg: COLORS.text }}
              />
            ))
          ) : (
            <text content=" —" style={{ height: 1, fg: COLORS.muted }} />
          )}
        </box>
      ))}
      <text
        content={translateUi("O raciocínio interno privado não é exibido.")}
        style={{ height: 1, flexShrink: 0, fg: COLORS.muted }}
      />
    </>
  )
}

function ActivityDetail({ entry }: { entry: AgentMessageHistoryEntry }) {
  const rows = [
    { id: "sent", at: entry.sentAt, label: translateUi("Mensagem enviada"), detail: entry.text },
    ...entry.activities.map((item) => ({
      id: item.id,
      at: item.at,
      label: activityLabel(item.kind),
      detail: [item.label, item.detail].filter(Boolean).join("\n"),
    })),
    ...(entry.status === "completed"
      ? [
          {
            id: "completed",
            at: entry.durationMs === null ? null : entry.sentAt + entry.durationMs,
            label: translateUi("Concluído"),
            detail: agentMessageStatusLabel(entry, Date.now()),
          },
        ]
      : []),
  ]
  return (
    <>
      {rows.map((row) => (
        <box key={row.id} style={{ flexShrink: 0, marginBottom: 1 }}>
          <box
            style={{
              minHeight: 2,
              flexShrink: 0,
              flexDirection: "row",
              paddingLeft: 1,
              paddingRight: 1,
              backgroundColor: COLORS.panel,
            }}
          >
            <text
              content={row.at ? clock(row.at) : "  —  "}
              style={{ width: 7, flexShrink: 0, fg: COLORS.muted }}
            />
            <text content={row.label} style={{ width: 20, flexShrink: 0, fg: COLORS.terminal }} />
            <text content={row.detail} wrapMode="word" style={{ minHeight: 1, fg: COLORS.text }} />
          </box>
        </box>
      ))}
    </>
  )
}

export function AgentMessageDetails({
  entry,
  view,
  now,
  width,
  height,
  scrollRef,
  onOpen,
}: {
  entry: AgentMessageHistoryEntry
  view: AgentMessageDetailView
  now: number
  width: number
  height: number
  scrollRef: RefObject<ScrollBoxRenderable | null>
  onOpen: (view: AgentMessageDetailView) => void
}) {
  if (view === "diff")
    return (
      <AgentMessageDiffDetail entry={entry} width={width} height={height} scrollRef={scrollRef} />
    )
  if (view === "overview")
    return <Overview entry={entry} now={now} width={width} height={height} onOpen={onOpen} />
  return (
    <scrollbox ref={scrollRef} scrollY viewportCulling style={{ flexGrow: 1, minHeight: 1 }}>
      {view === "message" && (
        <box
          style={{
            minHeight: height,
            paddingLeft: 1,
            paddingRight: 1,
            backgroundColor: COLORS.panel,
          }}
        >
          <text
            content={entry.text || "—"}
            wrapMode="word"
            style={{ flexGrow: 1, minHeight: 1, fg: COLORS.text }}
          />
          <text
            content={`${translateUi("Imagem")} ${entry.hasImage ? "✓" : "—"}   ${translateUi("Áudio")} ${entry.hasAudio ? "✓" : "—"}   ${translateUi("Skill")} ${entry.hasSkill ? "✓" : "—"}`}
            style={{ height: 1, fg: COLORS.muted }}
          />
        </box>
      )}
      {view === "response" && <ResponseDetail entry={entry} />}
      {view === "activity" && <ActivityDetail entry={entry} />}
    </scrollbox>
  )
}
