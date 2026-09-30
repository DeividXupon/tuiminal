import { createHash } from "node:crypto"
import { appendFileSync } from "node:fs"
import { CodexProxyFrameDecoder } from "../../packages/feature-terminal/src/services/codex-proxy-websocket"

const mode = process.argv[2] ?? "handshake"
const responsePayload = JSON.parse(process.argv[3] ?? '{"result":{}}') as Record<string, unknown>
const requestsPath = process.argv[4]
let buffered = Buffer.alloc(0)
let upgraded = false
const decoder = new CodexProxyFrameDecoder()

function serverFrame(value: string) {
  const body = Buffer.from(value)
  const lengthBytes = body.byteLength < 126 ? 0 : body.byteLength <= 0xffff ? 2 : 8
  const frame = Buffer.alloc(2 + lengthBytes + body.byteLength)
  frame[0] = 0x81
  if (lengthBytes === 0) frame[1] = body.byteLength
  else if (lengthBytes === 2) {
    frame[1] = 126
    frame.writeUInt16BE(body.byteLength, 2)
  } else {
    frame[1] = 127
    frame.writeBigUInt64BE(BigInt(body.byteLength), 2)
  }
  body.copy(frame, 2 + lengthBytes)
  return frame
}

function reply(request: Record<string, unknown>) {
  if (requestsPath) appendFileSync(requestsPath, `${JSON.stringify(request)}\n`)
  if (request.method === "initialize") return { id: request.id, ...responsePayload }
  if (mode !== "resume") return null
  if (request.method === "thread/list")
    return {
      id: request.id,
      result: {
        data: [
          {
            id: "remote-1",
            name: "Agente remoto",
            preview: "Projeto remoto",
            cwd: "/srv/project",
            gitInfo: { branch: "feature/remote" },
            recencyAt: 10,
            status: { type: "notLoaded" },
          },
        ],
      },
    }
  if (request.method === "thread/turns/list")
    return {
      id: request.id,
      result: {
        data: [
          {
            items: [
              {
                type: "agentMessage",
                phase: "final_answer",
                text: "Concluído remotamente.",
              },
            ],
          },
        ],
      },
    }
  return null
}

function consumeFrames(chunk: Uint8Array) {
  for (const frame of decoder.push(chunk)) {
    if (frame.opcode !== 1) continue
    const request = JSON.parse(new TextDecoder().decode(frame.payload)) as Record<string, unknown>
    const response = reply(request)
    if (response) process.stdout.write(serverFrame(JSON.stringify(response)))
  }
}

function consumeUpgrade() {
  const end = buffered.indexOf("\r\n\r\n")
  if (end < 0) return
  const request = buffered.subarray(0, end).toString("utf8")
  const key = request.match(/^Sec-WebSocket-Key:\s*(.+)$/imu)?.[1]?.trim()
  if (!key) process.exit(2)
  const accept = createHash("sha1")
    .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest("base64")
  process.stdout.write(
    `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`,
  )
  const remaining = buffered.subarray(end + 4)
  buffered = Buffer.alloc(0)
  upgraded = true
  consumeFrames(remaining)
}

process.stdin.on("data", (chunk: Buffer) => {
  if (upgraded) consumeFrames(chunk)
  else {
    buffered = Buffer.concat([buffered, chunk])
    consumeUpgrade()
  }
})
