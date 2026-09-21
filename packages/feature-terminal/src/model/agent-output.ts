/** Bounded, incremental OSC title reader. Never removes bytes from the actual PTY. */
export class AgentOutput {
  title = ""
  titleRevision = 0
  private decoder = new TextDecoder()
  private mode: "text" | "escape" | "osc" | "oscEscape" | "discard" | "discardEscape" = "text"
  private pending = ""
  private discardBel = false

  write(data: Uint8Array) {
    for (const char of this.decoder.decode(data, { stream: true })) this.consume(char)
  }

  clearTitle() {
    this.title = ""
    this.titleRevision++
    this.pending = ""
    this.mode = "text"
  }

  private finish() {
    const match = /^(?:0|2);([\s\S]*)$/.exec(this.pending)
    if (match) {
      const title = match[1]!.replace(/[\p{Cc}\u202a-\u202e\u2066-\u2069]/gu, "").slice(0, 512)
      if (this.title !== title) {
        this.title = title
        this.titleRevision++
      }
    }
    this.pending = ""
    this.mode = "text"
  }

  private begin(char: string) {
    this.pending = ""
    if (char === "]") {
      this.mode = "osc"
      this.discardBel = true
    } else if ("PX^_".includes(char)) {
      this.mode = "discard"
      this.discardBel = false
    } else this.mode = char === "\x1b" ? "escape" : "text"
  }

  private append(char: string) {
    if (char === "\x07") this.finish()
    else if (char === "\x1b") this.mode = "oscEscape"
    else if (this.pending.length < 4096) this.pending += char
    else {
      this.pending = ""
      this.mode = "discard"
    }
  }

  private consume(char: string) {
    switch (this.mode) {
      case "text":
        if (char === "\x1b") this.mode = "escape"
        break
      case "escape":
        this.begin(char)
        break
      case "osc":
        this.append(char)
        break
      case "oscEscape":
        if (char === "\\") this.finish()
        else {
          this.pending = ""
          this.mode = "discard"
        }
        break
      case "discard":
        if (char === "\x1b") this.mode = "discardEscape"
        else if (char === "\x07" && this.discardBel) this.mode = "text"
        break
      case "discardEscape":
        this.mode = char === "\\" ? "text" : char === "\x1b" ? "discardEscape" : "discard"
        break
    }
  }
}
