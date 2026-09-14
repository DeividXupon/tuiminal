import { describe, expect, test } from "bun:test"
import {
  APP_NOTIFICATION_LIMIT,
  appendNotification,
  defaultNotificationDuration,
  inferNotificationKind,
  type AppNotification,
} from "../packages/core/src/notifications/model"

function notification(
  id: string,
  message: string,
  kind: AppNotification["kind"] = "info",
): AppNotification {
  return {
    id,
    kind,
    source: "Teste",
    message,
    createdAt: Number(id.replace(/\D/g, "")) || 0,
    durationMs: null,
  }
}

describe("global notifications", () => {
  test("infers information, success, warning and error without classifying progress as failure", () => {
    expect(inferNotificationKind("Carregando…")).toBe("info")
    expect(inferNotificationKind("Configuração salva")).toBe("success")
    expect(inferNotificationKind("Aviso: limite atingido")).toBe("warning")
    expect(inferNotificationKind("Não foi possível conectar.")).toBe("error")
  })

  test("keeps errors persistent and gives transient kinds bounded durations", () => {
    expect(defaultNotificationDuration("error")).toBeNull()
    expect(defaultNotificationDuration("warning")).toBeGreaterThan(
      defaultNotificationDuration("success") ?? 0,
    )
    expect(defaultNotificationDuration("success")).toBeGreaterThan(0)
    expect(defaultNotificationDuration("info")).toBeGreaterThan(0)
  })

  test("deduplicates repeated messages and retains only the three newest cards", () => {
    let items: AppNotification[] = []
    for (let index = 1; index <= APP_NOTIFICATION_LIMIT + 1; index += 1) {
      items = appendNotification(items, notification(`n${index}`, `mensagem ${index}`))
    }
    expect(items.map((item) => item.id)).toEqual(["n2", "n3", "n4"])

    items = appendNotification(items, notification("n5", "mensagem 3"))
    expect(items.map((item) => item.id)).toEqual(["n2", "n4", "n5"])
  })
})
