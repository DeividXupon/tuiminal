import { COLORS } from "../../../../core/settings/theme"
import { translateUi } from "../../../../shared/i18n"
import { InlineButton } from "../../../../shared/ui/InlineButton"
import type { PullRequestActionKind } from "../../model/pr/actions"
import type { PullRequestActor } from "../../model/pr/types"

export function AssigneePicker({
  kind,
  assignees,
  value,
  onSelect,
}: {
  kind: PullRequestActionKind
  assignees: PullRequestActor[]
  value: string
  onSelect: (login: string) => void
}) {
  if (kind !== "assign" && kind !== "unassign") return null
  return (
    <box style={{ marginTop: 1, width: "100%" }}>
      <text content={translateUi("RESPONSÁVEIS ATUAIS")} style={{ fg: COLORS.git }} />
      {assignees.length ? (
        <box style={{ flexDirection: "row", width: "100%" }}>
          {assignees.slice(0, 5).map((assignee) => (
            <InlineButton
              key={assignee.login}
              label={`[@${assignee.login}]`}
              accent={COLORS.git}
              active={value.replace(/^@/, "") === assignee.login}
              onPress={() => onSelect(assignee.login)}
            />
          ))}
        </box>
      ) : (
        <text content={translateUi("Nenhum responsável atribuído.")} style={{ fg: COLORS.muted }} />
      )}
      <text
        content={translateUi(
          kind === "unassign"
            ? "Clique em um responsável para selecioná-lo ou digite o login."
            : "Digite o login do novo responsável.",
        )}
        style={{ fg: COLORS.muted }}
      />
    </box>
  )
}
