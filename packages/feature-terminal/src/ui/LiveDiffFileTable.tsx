import type { BoxRenderable, ScrollBoxRenderable } from "@opentui/core"
import { useEffect, useMemo, useRef, useState } from "react"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { liveDiffElapsedLabel, type LiveDiffFile } from "../model/live-diff"
import {
  LIVE_DIFF_CHANGE_WIDTH,
  LIVE_DIFF_STATUS_WIDTH,
  LIVE_DIFF_TIME_WIDTH,
  fittedLiveDiffPath,
  liveDiffFileStatus,
  liveDiffPathWidth,
} from "../rendering/live-diff-table"

const fileKey = (file: Pick<LiveDiffFile, "root" | "path">) => `${file.root}\0${file.path}`
const rightAligned = (value: string, width: number) => value.padStart(width - 1).padEnd(width)

export function LiveDiffFileTable({
  sessionId,
  files,
  selected,
  now,
  error,
  active,
  onSelect,
  onAddProject,
  onFocus,
}: {
  sessionId: string
  files: LiveDiffFile[]
  selected: LiveDiffFile | null
  now: number
  error: string
  active: boolean
  onSelect: (file: LiveDiffFile) => void
  onAddProject: () => void
  onFocus: (event: { stopPropagation: () => void }) => void
}) {
  const fileList = useRef<ScrollBoxRenderable | null>(null)
  const [listWidth, setListWidth] = useState(80)
  const [sweepFrame, setSweepFrame] = useState<number | null>(null)
  const hasNewFile = files.some((file) => file.newFile)
  useEffect(() => {
    if (!active || !hasNewFile || process.env.TUIMINAL_TEST_STATIC_LOADERS === "1") {
      setSweepFrame(null)
      return
    }
    const timer = setInterval(() => setSweepFrame((frame) => ((frame ?? -1) + 1) % 8), 70)
    return () => clearInterval(timer)
  }, [active, hasNewFile])

  const selectedFileKey = selected ? fileKey(selected) : null
  const selectedIndex = files.findIndex((file) => fileKey(file) === selectedFileKey)
  useEffect(() => {
    const scroll = fileList.current
    if (!scroll || !selectedFileKey || selectedIndex < 0) return
    if (selectedIndex < scroll.scrollTop) scroll.scrollTo(selectedIndex)
    else if (selectedIndex >= scroll.scrollTop + scroll.height)
      scroll.scrollTo(Math.max(0, selectedIndex - scroll.height + 1))
  }, [selectedIndex, selectedFileKey])

  const pathWidth = liveDiffPathWidth(listWidth)
  const displayPaths = useMemo(
    () => files.map((file) => fittedLiveDiffPath(file.root, file.path, pathWidth)),
    [files, pathWidth],
  )

  return (
    <box
      style={{
        height: "30%",
        minHeight: 4,
        flexShrink: 0,
        border: ["top"],
        borderColor: COLORS.border,
      }}
    >
      <box
        style={{
          height: 1,
          flexShrink: 0,
          flexDirection: "row",
          justifyContent: "space-between",
        }}
      >
        <text
          content={`${translateUi("Arquivos")} · ${files.length}`}
          style={{ fg: COLORS.terminal }}
        />
        <InlineButton
          compact
          id={`live-diff-add-${sessionId}`}
          label="[N] Adicionar projeto"
          onPress={onAddProject}
        />
      </box>
      <box
        style={{ height: 1, flexShrink: 0, flexDirection: "row", backgroundColor: COLORS.panelAlt }}
      >
        <text
          content={translateUi("Estado")}
          wrapMode="none"
          style={{ width: LIVE_DIFF_STATUS_WIDTH, fg: COLORS.muted }}
        />
        <text
          content={translateUi("Caminho")}
          wrapMode="none"
          style={{ width: pathWidth, fg: COLORS.muted }}
        />
        <text
          content={translateUi("Tempo")}
          wrapMode="none"
          style={{ width: LIVE_DIFF_TIME_WIDTH, fg: COLORS.muted }}
        />
        <text
          content={rightAligned("+", LIVE_DIFF_CHANGE_WIDTH)}
          style={{ width: LIVE_DIFF_CHANGE_WIDTH, fg: COLORS.graphAccent }}
        />
        <text
          content={rightAligned("−", LIVE_DIFF_CHANGE_WIDTH)}
          style={{ width: LIVE_DIFF_CHANGE_WIDTH, fg: COLORS.danger }}
        />
      </box>
      <scrollbox
        ref={fileList}
        id={`live-diff-files-${sessionId}`}
        scrollY
        viewportCulling
        onSizeChange={function (this: BoxRenderable) {
          setListWidth((current) => (current === this.width ? current : this.width))
        }}
        style={{ flexGrow: 1, minHeight: 1 }}
      >
        {files.map((file, index) => {
          const isSelected = selected && fileKey(file) === fileKey(selected)
          const status = liveDiffFileStatus(file)
          return (
            // biome-ignore lint/a11y/noStaticElementInteractions: file rows are also selectable from the keyboard with J/K.
            <box
              key={fileKey(file)}
              id={`live-diff-file-${sessionId}-${index}`}
              focusable
              onMouseDown={(event) => {
                onSelect(file)
                onFocus(event)
              }}
              style={{
                height: 1,
                flexShrink: 0,
                flexDirection: "row",
                backgroundColor: isSelected ? COLORS.panelRaised : COLORS.canvas,
              }}
            >
              <box
                style={{
                  width: LIVE_DIFF_STATUS_WIDTH,
                  height: 1,
                  flexShrink: 0,
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                {status === "New" && sweepFrame !== null && (
                  <box
                    position="absolute"
                    top={0}
                    left={Math.max(0, sweepFrame - 2)}
                    width={2}
                    height={1}
                    backgroundColor={COLORS.gitMerged}
                    opacity={0.2}
                  />
                )}
                <text
                  content={translateUi(status)}
                  wrapMode="none"
                  style={{
                    width: LIVE_DIFF_STATUS_WIDTH,
                    fg: status === "New" ? COLORS.gitMerged : COLORS.warning,
                  }}
                />
              </box>
              <text
                content={displayPaths[index] ?? ""}
                wrapMode="none"
                style={{ width: pathWidth, fg: isSelected ? COLORS.focus : COLORS.text }}
              />
              <text
                content={rightAligned(
                  liveDiffElapsedLabel(file.changedAt, now),
                  LIVE_DIFF_TIME_WIDTH,
                )}
                wrapMode="none"
                style={{ width: LIVE_DIFF_TIME_WIDTH, fg: COLORS.graphAccent }}
              />
              <text
                content={rightAligned(`+${file.additions ?? "—"}`, LIVE_DIFF_CHANGE_WIDTH)}
                wrapMode="none"
                style={{ width: LIVE_DIFF_CHANGE_WIDTH, fg: COLORS.graphAccent }}
              />
              <text
                content={rightAligned(`−${file.deletions ?? "—"}`, LIVE_DIFF_CHANGE_WIDTH)}
                wrapMode="none"
                style={{ width: LIVE_DIFF_CHANGE_WIDTH, fg: COLORS.danger }}
              />
            </box>
          )
        })}
        {!files.length && (
          <text
            content={error || translateUi("Nenhum arquivo alterado")}
            style={{ fg: COLORS.muted }}
          />
        )}
      </scrollbox>
    </box>
  )
}
