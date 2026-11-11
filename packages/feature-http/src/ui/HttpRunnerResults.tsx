import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { translateUi, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import type { HttpRunCase } from "../services/collection-runner"

function runItemPassed(item: HttpRunCase["items"][number]) {
  return (
    Boolean(item.response) &&
    !item.error &&
    (item.response?.assertions ?? []).every((assertion) => assertion.passed)
  )
}

export function HttpRunnerResults({ cases, width }: { cases: HttpRunCase[]; width: number }) {
  if (!cases.length) return null
  return (
    <box style={{ flexShrink: 0 }}>
      {cases.flatMap((testCase) => {
        const passed = testCase.items.filter(runItemPassed).length
        const casePassed = passed === testCase.items.length && Boolean(testCase.items.length)
        return [
          <text
            key={`case-${testCase.name}`}
            content={truncateDisplay(
              `${casePassed ? "✓" : "×"} ${testCase.name} · ${passed}/${testCase.items.length}`,
              width,
            )}
            style={{ fg: casePassed ? COLORS.success : COLORS.danger }}
          />,
          ...testCase.items.map((item) => {
            const itemPassed = runItemPassed(item)
            const detail = item.error
              ? translateUi(item.error.message)
              : `${item.response?.status ?? "—"} · ${item.method} ${item.requestName}`
            return (
              <text
                key={`${testCase.name}-${item.requestId}`}
                content={truncateDisplay(`  ${itemPassed ? "✓" : "×"} ${detail}`, width)}
                style={{ fg: itemPassed ? COLORS.text : COLORS.warning }}
              />
            )
          }),
        ]
      })}
    </box>
  )
}
