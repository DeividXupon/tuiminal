import type { InputRenderable } from "@opentui/core"
import { padDisplayEnd, translateUi } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import type { PasswordInputRenderable } from "@xupon/tuiminal-core/ui/PasswordInput"
import "@xupon/tuiminal-core/ui/PasswordInput"
import { useConnectionEnvironmentCompletion } from "../hooks/use-connection-environment-completion"
import { ShortcutText } from "@xupon/tuiminal-core/ui/ShortcutText"

export function ConnectionInput({
  label,
  id,
  value,
  placeholder,
  width,
  inputRef,
  onInput,
  onSubmit,
  masked = false,
  maxLength = 256,
}: {
  label: string
  id: string
  value: string
  placeholder: string
  width?: number | "auto" | `${number}%`
  inputRef: React.RefObject<InputRenderable | null>
  onInput: (value: string) => void
  onSubmit: () => void
  masked?: boolean
  maxLength?: number
}) {
  const completion = useConnectionEnvironmentCompletion(inputRef, onInput, maxLength)
  const inputStyle = {
    flexGrow: width === undefined ? 1 : 0,
    backgroundColor: COLORS.panelRaised,
    focusedBackgroundColor: COLORS.panelRaised,
    textColor: masked ? COLORS.panelRaised : COLORS.text,
    focusedTextColor: masked ? COLORS.panelRaised : COLORS.text,
    selectionFg: masked ? COLORS.panelRaised : COLORS.text,
    cursorColor: COLORS.database,
    placeholderColor: COLORS.muted,
  }

  return (
    <box style={{ flexShrink: 0, flexDirection: "column" }}>
      <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
        <text
          content={padDisplayEnd(translateUi(label), 12)}
          style={{ width: 12, flexShrink: 0, fg: COLORS.muted }}
        />
        {masked ? (
          <password-input
            ref={inputRef as React.RefObject<PasswordInputRenderable | null>}
            id={id}
            value={value}
            placeholder={translateUi(placeholder)}
            {...(width === undefined ? {} : { width })}
            maxLength={maxLength}
            onMouseDown={() => inputRef.current?.focus()}
            onInput={completion.onInput}
            onSubmit={onSubmit}
            style={inputStyle}
          />
        ) : (
          <input
            ref={inputRef}
            id={id}
            value={value}
            placeholder={translateUi(placeholder)}
            {...(width === undefined ? {} : { width })}
            maxLength={maxLength}
            onMouseDown={() => inputRef.current?.focus()}
            onInput={completion.onInput}
            onSubmit={onSubmit}
            style={inputStyle}
          />
        )}
      </box>
      {completion.visible ? (
        <box
          id={`${id}-environment-suggestions`}
          style={{ flexDirection: "column", paddingLeft: 12, flexShrink: 0 }}
        >
          {completion.suggestions.map((name, index) => (
            // biome-ignore lint/a11y/noStaticElementInteractions: the input owns keyboard navigation for these native completion rows.
            <text
              key={name}
              id={`${id}-environment-${index}`}
              content={`${index === completion.selectedIndex ? "›" : " "} {${name}}`}
              onMouseDown={(event) => {
                event.preventDefault()
                event.stopPropagation()
                completion.accept(index)
              }}
              style={{
                height: 1,
                fg: index === completion.selectedIndex ? COLORS.database : COLORS.text,
              }}
            />
          ))}
          <ShortcutText
            content={translateUi("[↑/↓] Selecionar · [Tab/Enter] Completar · [Esc] Fechar")}
            style={{ height: 1, fg: COLORS.muted }}
          />
        </box>
      ) : null}
    </box>
  )
}
