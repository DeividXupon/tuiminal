import { Button } from "@tuiparts/react/button"
import { translateUi, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"

export function HttpPostmanDestinationRow({
  index,
  label,
  folder,
  selected,
  compact,
  width,
  onPress,
}: {
  index: number
  label: string
  folder: boolean
  selected: boolean
  compact: boolean
  width: number
  onPress: () => void
}) {
  const height = compact ? 1 : 2
  const background = selected ? COLORS.diffModifiedBg : index % 2 ? COLORS.panel : COLORS.canvas
  return (
    <Button
      id={`http-postman-save-option-${index}`}
      height={height}
      flexShrink={0}
      width="100%"
      onPress={onPress}
    >
      <box
        style={{
          width: "100%",
          height,
          border: ["left"],
          borderColor: selected ? COLORS.http : COLORS.border,
          backgroundColor: background,
        }}
      >
        <text
          content={` ${selected ? "›" : " "} ${truncateDisplay(label, width - 9)}`}
          wrapMode="none"
          style={{ height: 1, fg: COLORS.text }}
        />
        {!compact && (
          <text
            content={`   ${translateUi(folder ? "Pasta" : "Coleção")}`}
            style={{ height: 1, fg: COLORS.muted }}
          />
        )}
      </box>
    </Button>
  )
}
