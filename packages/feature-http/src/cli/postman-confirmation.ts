import { translateUi } from "@xupon/tuiminal-core/i18n/index"

function confirmationInput(answer: string, character: string) {
  if (["\u001b", "\u0003", "\u0004"].includes(character)) {
    return { done: true as const, accepted: false }
  }
  if (character === "\r" || character === "\n") {
    return { done: true as const, accepted: answer.toLowerCase() === "y" }
  }
  if (character === "\u007f" || character === "\b") {
    return { done: false as const, answer: answer.slice(0, -1), echo: answer ? "\b \b" : "" }
  }
  if (character < " " || answer.length >= 16) {
    return { done: true as const, accepted: false }
  }
  return { done: false as const, answer: answer + character, echo: character }
}

export async function confirmPlaintextPostmanAccount(): Promise<boolean> {
  if (!process.stdin.isTTY || !process.stdin.setRawMode) return false
  const previousRaw = process.stdin.isRaw
  process.stdin.setRawMode(true)
  process.stderr.write(
    translateUi("Salvar sem criptografia? [Y] Sim · [N/Enter/Esc] Não (padrão): "),
  )
  return new Promise((resolve) => {
    let answer = ""
    let finished = false
    const finish = (accepted = false) => {
      if (finished) return
      finished = true
      process.stdin.off("data", receive)
      process.stdin.off("end", cancel)
      process.stdin.off("error", cancel)
      process.stdin.setRawMode(previousRaw)
      process.stdin.pause()
      process.stderr.write("\n")
      resolve(accepted)
    }
    const cancel = () => finish()
    const receive = (chunk: Buffer) => {
      for (const character of chunk.toString("utf8")) {
        const next = confirmationInput(answer, character)
        if (next.done) return finish(next.accepted)
        answer = next.answer
        process.stderr.write(next.echo)
      }
    }
    process.stdin.on("data", receive)
    process.stdin.once("end", cancel)
    process.stdin.once("error", cancel)
    process.stdin.resume()
  })
}
