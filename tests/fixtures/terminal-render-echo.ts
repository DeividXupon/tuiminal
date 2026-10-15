// Synthetic interactive child. Never starts an agent or touches project files.
export {}

process.stdin.setRawMode(true)
process.stdin.setEncoding("utf8")
let input = ""
let status = "READY"
let alternate = false
let writes = Promise.resolve()
let resumeTimer: ReturnType<typeof setTimeout> | undefined

function draw(fragmented = false) {
  const frame =
    `\x1b[?2026h\x1b[H\x1b[2KINPUT=${input}\r\n` +
    `\x1b[2KSTATUS=${status}\r\n` +
    `\x1b[2KSIZE=${process.stdout.columns}x${process.stdout.rows}\r\n` +
    `\x1b[2KCHILD=${process.pid};\x1b[?2026l`
  writes = writes.then(async () => {
    if (!fragmented) {
      process.stdout.write(frame)
      return
    }
    // Split CSI and multibyte UTF-8 across separate PTY reads.
    for (const byte of Buffer.from(frame)) {
      process.stdout.write(Uint8Array.of(byte))
      await Bun.sleep(1)
    }
  })
}

process.stdin.on("data", (data: string) => {
  for (const char of data) {
    if (char === "\x03") {
      clearTimeout(resumeTimer)
      void writes.then(() => process.exit(0))
      return
    }
    if (char === "\x01") {
      alternate = !alternate
      const sequence = alternate ? "\x1b[?1049h" : "\x1b[?1049l"
      writes = writes.then(() => {
        process.stdout.write(sequence)
      })
      status = alternate ? "ALTERNATE" : "PRIMARY"
    } else if (char === "\x06") {
      status = "FRAGMENTED"
      draw(true)
      continue
    } else if (char === "\x14") {
      status = "WAITING"
      clearTimeout(resumeTimer)
      resumeTimer = setTimeout(() => {
        status = "RESUMED"
        draw()
      }, 200)
    } else if (char === "\x15") input = ""
    else input += char
    draw()
  }
})
process.stdout.on("resize", () => draw())
draw()
