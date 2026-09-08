import {
  InputRenderable,
  parseColor,
  type InputRenderableOptions,
  type OptimizedBuffer,
  type RenderContext,
} from "@opentui/core"
import { extend } from "@opentui/react"
import { COLORS } from "../../../core/settings/theme"

type PasswordInputOptions = InputRenderableOptions & {
  onInput?: (value: string) => void
  onChange?: (value: string) => void
  onSubmit?: (value: string) => void
}

export class PasswordInputRenderable extends InputRenderable {
  constructor(ctx: RenderContext, options: PasswordInputOptions) {
    const { onInput: _onInput, onChange: _onChange, onSubmit: _onSubmit, ...inputOptions } = options
    super(ctx, inputOptions)
  }

  protected override renderSelf(buffer: OptimizedBuffer) {
    super.renderSelf(buffer)
    const maskLength = Math.min([...this.plainText].length, this.width)
    if (maskLength === 0) return
    buffer.drawText(
      "*".repeat(maskLength),
      this.screenX,
      this.screenY,
      parseColor(COLORS.text),
      parseColor(COLORS.panelRaised),
    )
  }
}

extend({ "password-input": PasswordInputRenderable })

declare module "@opentui/react" {
  interface OpenTUIComponents {
    "password-input": typeof PasswordInputRenderable
  }
}
