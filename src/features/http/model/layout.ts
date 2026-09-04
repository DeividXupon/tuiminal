import type { HttpLayoutMode } from "./types"

export type HttpRect = { left: number; top: number; width: number; height: number }

export type HttpLayout = {
  mode: HttpLayoutMode
  omnibarRows: 1 | 2
  navigation: HttpRect
  request: HttpRect
  response: HttpRect
  navigationFixed: boolean
  simultaneousPanes: boolean
}

type ResolveHttpLayoutOptions = {
  width: number
  height: number
  contentHeight?: number
  splitRatio?: number
  navigationWidth?: number
  requestWidth?: number
}

type ResolveHttpWorkspaceLayoutOptions = {
  terminalWidth: number
  terminalHeight: number
  appHeaderRows: number
  outerPadding: number
  spacing: number
  splitRatio?: number
}

const GAP = 1

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}

function verticalSplit(
  width: number,
  height: number,
  ratio: number,
  left = 0,
): [HttpRect, HttpRect] {
  const requestHeight = clamp(Math.floor((height - GAP) * ratio), 6, Math.max(6, height - 8))
  const responseHeight = Math.max(1, height - requestHeight - GAP)
  return [
    { left, top: 0, width, height: requestHeight },
    { left, top: requestHeight + GAP, width, height: responseHeight },
  ]
}

export function resolveHttpLayout({
  width,
  height,
  contentHeight,
  splitRatio = 0.4,
  navigationWidth,
  requestWidth,
}: ResolveHttpLayoutOptions): HttpLayout {
  const safeWidth = Math.max(1, Math.floor(width))
  const safeHeight = Math.max(1, Math.floor(height))
  const canvasHeight = Math.max(1, Math.floor(contentHeight ?? safeHeight))

  if (safeWidth >= 132 && safeHeight >= 24) {
    const navWidth = clamp(navigationWidth ?? Math.floor(safeWidth * 0.2), 22, 32)
    const available = safeWidth - navWidth - GAP * 2
    const builderWidth = clamp(requestWidth ?? Math.floor(available * splitRatio), 42, 54)
    return {
      mode: "panorama",
      omnibarRows: 1,
      navigation: { left: 0, top: 0, width: navWidth, height: canvasHeight },
      request: { left: navWidth + GAP, top: 0, width: builderWidth, height: canvasHeight },
      response: {
        left: navWidth + builderWidth + GAP * 2,
        top: 0,
        width: safeWidth - navWidth - builderWidth - GAP * 2,
        height: canvasHeight,
      },
      navigationFixed: true,
      simultaneousPanes: true,
    }
  }

  if (safeWidth >= 96 && safeHeight >= 22) {
    const navWidth = clamp(navigationWidth ?? Math.floor(safeWidth * 0.23), 22, 30)
    const contentLeft = navWidth + GAP
    const contentWidth = safeWidth - contentLeft
    const [request, response] = verticalSplit(contentWidth, canvasHeight, splitRatio, contentLeft)
    return {
      mode: "workbench",
      omnibarRows: 1,
      navigation: { left: 0, top: 0, width: navWidth, height: canvasHeight },
      request,
      response,
      navigationFixed: true,
      simultaneousPanes: true,
    }
  }

  if (safeWidth >= 72 && safeHeight >= 18) {
    const [request, response] = verticalSplit(safeWidth, canvasHeight, splitRatio)
    return {
      mode: "focus",
      omnibarRows: 1,
      navigation: {
        left: 0,
        top: 0,
        width: clamp(Math.floor(safeWidth * 0.55), 24, Math.max(24, safeWidth - 4)),
        height: canvasHeight,
      },
      request,
      response,
      navigationFixed: false,
      simultaneousPanes: true,
    }
  }

  const full = { left: 0, top: 0, width: safeWidth, height: canvasHeight }
  return {
    mode: "minimum",
    omnibarRows: 2,
    navigation: full,
    request: full,
    response: full,
    navigationFixed: false,
    simultaneousPanes: false,
  }
}

export function resolveHttpWorkspaceLayout({
  terminalWidth,
  terminalHeight,
  appHeaderRows,
  outerPadding,
  spacing,
  splitRatio,
}: ResolveHttpWorkspaceLayoutOptions) {
  const width = Math.max(1, terminalWidth - outerPadding * 2)
  const availableHeight = Math.max(8, terminalHeight - appHeaderRows - outerPadding * 2)
  const initial = resolveHttpLayout({ width, height: availableHeight })
  const selectorRows = initial.mode === "panorama" || initial.mode === "workbench" ? 0 : 1
  const chromeRows = 1 + initial.omnibarRows + selectorRows + 1 + spacing * 2
  const bodyHeight = Math.max(4, availableHeight - chromeRows)
  return {
    bodyHeight,
    layout: resolveHttpLayout({
      width,
      height: availableHeight,
      contentHeight: bodyHeight,
      ...(splitRatio === undefined ? {} : { splitRatio }),
    }),
  }
}

export function resizeHttpSplitRatio(current: number, direction: -1 | 1) {
  return clamp(Math.round((current + direction * 0.05) * 100) / 100, 0.25, 0.7)
}
