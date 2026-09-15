import { describe, expect, test } from "bun:test"
import { readLimitedResponseBody } from "../packages/feature-http/src/services/response-reader"

function streamedResponse(chunks: readonly (readonly number[])[], cancel?: () => void) {
  let next = 0
  return new Response(
    new ReadableStream<Uint8Array>({
      pull(controller) {
        const chunk = chunks[next++]
        if (chunk) controller.enqueue(new Uint8Array(chunk))
        else controller.close()
      },
      ...(cancel ? { cancel } : {}),
    }),
  )
}

describe("HTTP capture stream ownership", () => {
  test.each([
    { chunks: [], limit: 4, bytes: [], truncated: false },
    { chunks: [[1, 2]], limit: 4, bytes: [1, 2], truncated: false },
    {
      chunks: [
        [1, 2],
        [3, 4],
      ],
      limit: 4,
      bytes: [1, 2, 3, 4],
      truncated: false,
    },
    { chunks: [[1, 2, 3, 4, 5]], limit: 4, bytes: [1, 2, 3, 4], truncated: true },
    { chunks: [[1, 2], [3, 4], [5]], limit: 4, bytes: [1, 2, 3, 4], truncated: true },
    { chunks: [], limit: 0, bytes: [], truncated: false },
    { chunks: [[1]], limit: 0, bytes: [], truncated: true },
  ])("releases the reader after capturing $bytes with limit $limit", async (fixture) => {
    let cancellations = 0
    const response = streamedResponse(fixture.chunks, () => {
      cancellations += 1
    })
    const captured = await readLimitedResponseBody(response, fixture.limit)
    expect([...captured.body]).toEqual([...fixture.bytes])
    expect(captured.truncated).toBe(fixture.truncated)
    expect(cancellations).toBe(fixture.truncated ? 1 : 0)
    expect(response.body?.locked).toBe(false)
  })

  test("empty chunks at the exact limit do not imply truncated content", async () => {
    let cancellations = 0
    const response = streamedResponse([[], [1, 2], [], [3, 4], [], []], () => {
      cancellations += 1
    })
    const captured = await readLimitedResponseBody(response, 4)
    expect([...captured.body]).toEqual([1, 2, 3, 4])
    expect(captured.truncated).toBe(false)
    expect(cancellations).toBe(0)
    expect(response.body?.locked).toBe(false)
  })

  test("empty chunks at the limit cannot hide later bytes", async () => {
    let cancellations = 0
    const response = streamedResponse([[1, 2], [], [], [3], [4]], () => {
      cancellations += 1
    })
    const captured = await readLimitedResponseBody(response, 2)
    expect([...captured.body]).toEqual([1, 2])
    expect(captured.truncated).toBe(true)
    expect(cancellations).toBe(1)
    expect(response.body?.locked).toBe(false)
  })

  test("read failures release the lock and preserve the original error", async () => {
    const failure = new Error("synthetic stream failure")
    let pulls = 0
    const response = new Response(
      new ReadableStream<Uint8Array>({
        pull(controller) {
          if (pulls++ === 0) controller.enqueue(new Uint8Array([1, 2]))
          else controller.error(failure)
        },
      }),
    )
    await expect(readLimitedResponseBody(response, 4)).rejects.toBe(failure)
    expect(response.body?.locked).toBe(false)
  })

  test("cancellation failures also release the reader without replacing the error", async () => {
    const failure = new Error("synthetic cancellation failure")
    const response = streamedResponse([[1, 2, 3]], () => {
      throw failure
    })
    await expect(readLimitedResponseBody(response, 2)).rejects.toBe(failure)
    expect(response.body?.locked).toBe(false)
  })

  test("an absent body needs no reader", async () => {
    expect(await readLimitedResponseBody(new Response(null), 4)).toEqual({
      body: new Uint8Array(),
      truncated: false,
    })
  })
})
