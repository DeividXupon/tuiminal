import type { BoxRenderable } from "@opentui/core"
import type { ReactNode, Ref } from "react"
import { COLORS } from "../settings/theme"

export type ModalSurfaceProps = {
  id: string
  width: number
  height: number
  zIndex: number
  borderColor: string
  onBackdropPress: () => void
  children: ReactNode
  dialogRef?: Ref<BoxRenderable>
  backgroundColor?: string
  backdropOpacity?: number
  horizontalPadding?: number
  positionRelative?: boolean
  dialogFocusable?: boolean
  layerId?: string
  layerFocusable?: boolean
}

/** Shared visual shell only; the owning feature keeps focus and keyboard policy. */
export function ModalSurface({
  id,
  width,
  height,
  zIndex,
  borderColor,
  onBackdropPress,
  children,
  dialogRef,
  backgroundColor = COLORS.canvas,
  backdropOpacity = 0.92,
  horizontalPadding = 1,
  positionRelative = false,
  dialogFocusable = true,
  layerId,
  layerFocusable = false,
}: ModalSurfaceProps) {
  const backdropLayerId = layerId ?? `${id}-layer`
  return (
    <>
      {backdropOpacity > 0 && (
        <box
          id={`${id}-backdrop`}
          position="absolute"
          top={0}
          left={0}
          width="100%"
          height="100%"
          zIndex={zIndex}
          backgroundColor="#030509"
          opacity={backdropOpacity}
        />
      )}
      {/* The centered full-screen layer sits above the dimmer, so it owns outside clicks. */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: Native terminal backdrop handling is pointer-only; the feature owns keyboard dismissal. */}
      <box
        id={backdropLayerId}
        focusable={layerFocusable}
        position="absolute"
        top={0}
        left={0}
        width="100%"
        height="100%"
        zIndex={zIndex + 1}
        alignItems="center"
        justifyContent="center"
        onMouseDown={(event) => {
          if (event.button !== 0 || event.target?.id !== backdropLayerId) return
          event.preventDefault()
          event.stopPropagation()
          onBackdropPress()
        }}
      >
        <box
          {...(dialogRef === undefined ? {} : { ref: dialogRef })}
          id={id}
          focusable={dialogFocusable}
          style={{
            ...(positionRelative ? { position: "relative" as const } : {}),
            width,
            height,
            border: true,
            borderStyle: "rounded",
            borderColor,
            backgroundColor,
            paddingLeft: horizontalPadding,
            paddingRight: horizontalPadding,
          }}
        >
          {children}
        </box>
      </box>
    </>
  )
}
