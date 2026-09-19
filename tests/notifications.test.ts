import { describe, expect, test } from "bun:test"
import {
  APP_NOTIFICATION_LIMIT,
  appendNotification,
  defaultNotificationDuration,
  inferNotificationKind,
  NOTIFICATION_ANIMATION_TIMING,
  notificationAnimationFrame,
  notificationProgress,
  resolveNotificationDuration,
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
    durationMs: 4_000,
  }
}

describe("global notifications", () => {
  test("infers information, success, warning and error without classifying progress as failure", () => {
    expect(inferNotificationKind("Carregando…")).toBe("info")
    expect(inferNotificationKind("Configuração salva")).toBe("success")
    expect(inferNotificationKind("Aviso: limite atingido")).toBe("warning")
    expect(inferNotificationKind("Não foi possível conectar.")).toBe("error")
  })

  test("gives every kind a finite duration and keeps errors visible longest", () => {
    expect(defaultNotificationDuration("error")).toBeGreaterThan(
      defaultNotificationDuration("warning"),
    )
    expect(defaultNotificationDuration("warning")).toBeGreaterThan(
      defaultNotificationDuration("success"),
    )
    expect(defaultNotificationDuration("success")).toBeGreaterThan(0)
    expect(defaultNotificationDuration("info")).toBeGreaterThan(0)
    expect(resolveNotificationDuration("error", null)).toBe(defaultNotificationDuration("error"))
    expect(resolveNotificationDuration("success", 12_345)).toBe(12_345)
  })

  test("derives countdown progress and horizontal entrance and exit frames", () => {
    expect(notificationProgress(750, 1_000)).toBe(0.75)
    expect(notificationProgress(-1, 1_000)).toBe(0)

    const entering = notificationAnimationFrame(1_000, null, 1_000)
    const entered = notificationAnimationFrame(
      1_000,
      null,
      1_000 + NOTIFICATION_ANIMATION_TIMING.enterMs,
    )
    const exiting = notificationAnimationFrame(1_000, 2_000, 2_000)
    const exited = notificationAnimationFrame(
      1_000,
      2_000,
      2_000 + NOTIFICATION_ANIMATION_TIMING.exitMs,
    )
    expect(entering).toEqual({
      opacity: 0,
      offset: NOTIFICATION_ANIMATION_TIMING.slideColumns,
    })
    expect(entered).toEqual({ opacity: 1, offset: 0 })
    expect(exiting).toEqual({ opacity: 1, offset: 0 })
    expect(exited).toEqual({
      opacity: 0,
      offset: NOTIFICATION_ANIMATION_TIMING.slideColumns,
    })
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
