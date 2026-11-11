/** Locate the actual header label, allowing mouse particles only in its spaces. */
export function renderedTabColumn(frame: string, key: string, label: string, selectedOnly = false) {
  const header = frame.split("\n", 1)[0] ?? ""
  // MouseTrailSurface paints +, : and . into blank cells. Keep every occupied
  // glyph exact, especially the selection diamond and the shortcut's literal +.
  const marker = selectedOnly ? "◆" : "[◆◇]"
  const pattern = new RegExp(
    `${marker}[ +:.]${RegExp.escape(label)}[ +:.]${RegExp.escape(`[Alt+${key}]`)}`,
  )
  return header.search(pattern)
}
