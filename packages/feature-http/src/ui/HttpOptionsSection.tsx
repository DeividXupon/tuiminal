import { consumeHttpRequestTableKey } from "../hooks/use-http-request-tables"
import { Button } from "@tuiparts/react/button"
import type { ReactNode } from "react"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import type {
  HttpOptionsNavigation,
  HttpOptionsSection as Section,
} from "../hooks/use-http-options-navigation"

export function HttpOptionsSection({
  section,
  title,
  navigation,
  children,
}: {
  section: Section
  title: string
  navigation: HttpOptionsNavigation
  children: ReactNode
}) {
  const active = navigation.focused && navigation.section === section
  const id = navigation.sectionId(section)
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: OpenTUI boxes own native keyboard focus.
    <box
      id={id}
      focusable
      flexShrink={0}
      border={["left"]}
      onKeyDown={(key) => {
        if (!key.defaultPrevented) consumeHttpRequestTableKey(key, navigation.handleKey)
      }}
      borderColor={active ? COLORS.http : COLORS.border}
    >
      <box
        id={`${id}-heading`}
        height={1}
        flexShrink={0}
        flexDirection="row"
        backgroundColor={COLORS.panelRaised}
      >
        <Button height={1} flexShrink={1} minWidth={0} onPress={() => navigation.select(section)}>
          <text
            content={translateUi(title)}
            height={1}
            wrapMode="none"
            style={{ fg: active ? COLORS.http : COLORS.text }}
          />
        </Button>
        {active && section !== "actions" ? (
          <InlineButton
            id={`${id}-selection`}
            label={navigation.mode === "block" ? "[Enter] Selecionar" : "[Esc] Sair"}
            accent={COLORS.http}
            backgroundColor={COLORS.panelRaised}
            onPress={() =>
              navigation.select(
                section,
                navigation.mode === "item"
                  ? undefined
                  : section === "options"
                    ? navigation.option
                    : navigation.identity,
              )
            }
          />
        ) : null}
      </box>
      {children}
    </box>
  )
}

export function HttpOptionsInput({
  id,
  label,
  value,
  placeholder = "",
  width,
  section,
  index,
  navigation,
  onInput,
}: {
  id: string
  label: string
  value: string
  width?: number
  placeholder?: string
  section: "options" | "identity"
  index: number
  navigation: HttpOptionsNavigation
  onInput: (value: string) => void
}) {
  const selected =
    navigation.focused &&
    navigation.section === section &&
    navigation.mode !== "block" &&
    (section === "options" ? navigation.option : navigation.identity) === index
  return (
    <box
      id={`${id}-field`}
      height={section === "identity" ? 1 : 2}
      flexDirection={section === "identity" ? "row" : "column"}
      gap={section === "identity" ? 1 : 0}
      flexShrink={0}
      width={width ?? "100%"}
      minWidth={0}
    >
      <text
        content={translateUi(label)}
        height={1}
        flexShrink={0}
        fg={selected ? COLORS.http : COLORS.muted}
      />
      <input
        id={id}
        value={value}
        placeholder={translateUi(placeholder)}
        onInput={onInput}
        onMouseDown={() => navigation.select(section, index, true)}
        style={{
          width: section === "identity" ? 0 : "100%",
          flexGrow: 1,
          backgroundColor: selected ? COLORS.diffModifiedBg : COLORS.panelAlt,
          focusedBackgroundColor: COLORS.panelRaised,
          textColor: COLORS.text,
          focusedTextColor: COLORS.text,
          cursorColor: COLORS.http,
        }}
      />
    </box>
  )
}
