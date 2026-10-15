import { describe, expect, test } from "bun:test"
import {
  REMOTE_MYSQL_ENVIRONMENT_NAMES,
  remoteMySqlEnvironment,
} from "./fixtures/remote-mysql-environment"

function completeEnvironment() {
  return {
    TUIMINAL_TEST_MYSQL_HOST: "db-test.example.com",
    TUIMINAL_TEST_MYSQL_PORT: "3306",
    TUIMINAL_TEST_MYSQL_DATABASE: "custom_test_database",
    TUIMINAL_TEST_MYSQL_USER: "tuiminal_test",
    TUIMINAL_TEST_MYSQL_PASSWORD: "not-a-real-password",
    TUIMINAL_TEST_MYSQL_TLS: "1",
    TUIMINAL_TEST_MYSQL_WRITES: "1",
  }
}

describe("remote MySQL test environment", () => {
  test("stays disabled when all or some required values are absent", () => {
    expect(remoteMySqlEnvironment({})).toEqual({ status: "disabled" })
    for (const name of REMOTE_MYSQL_ENVIRONMENT_NAMES) {
      const environment: Record<string, string | undefined> = completeEnvironment()
      delete environment[name]
      expect(remoteMySqlEnvironment(environment)).toEqual({ status: "disabled" })
    }
    expect(
      remoteMySqlEnvironment({ ...completeEnvironment(), TUIMINAL_TEST_MYSQL_HOST: " " }),
    ).toEqual({ status: "disabled" })
  })

  test("returns a typed configuration only when every value is present", () => {
    expect(remoteMySqlEnvironment(completeEnvironment())).toEqual({
      status: "enabled",
      configuration: {
        host: "db-test.example.com",
        port: 3306,
        database: "custom_test_database",
        username: "tuiminal_test",
        password: "not-a-real-password",
      },
    })
  })

  test.each([
    ["TUIMINAL_TEST_MYSQL_PORT", "0", "between 1 and 65535"],
    ["TUIMINAL_TEST_MYSQL_PORT", "not-a-port", "between 1 and 65535"],
    ["TUIMINAL_TEST_MYSQL_HOST", "https://db.test", "valid hostname"],
    ["TUIMINAL_TEST_MYSQL_USER", "root", "non-root"],
    ["TUIMINAL_TEST_MYSQL_TLS", "0", "must be 1"],
    ["TUIMINAL_TEST_MYSQL_WRITES", "yes", "must be 1"],
  ])("rejects complete but unsafe %s configuration", (name, value, message) => {
    const environment = { ...completeEnvironment(), [name]: value }
    const result = remoteMySqlEnvironment(environment)
    expect(result.status).toBe("invalid")
    if (result.status === "invalid") expect(result.error.message).toContain(message)
  })

  test("never includes the password in validation errors", () => {
    const password = "DO_NOT_PRINT_THIS_PASSWORD"
    const environment = {
      ...completeEnvironment(),
      TUIMINAL_TEST_MYSQL_HOST: "invalid host",
      TUIMINAL_TEST_MYSQL_PASSWORD: password,
    }
    const result = remoteMySqlEnvironment(environment)
    const message = result.status === "invalid" ? result.error.message : ""
    expect(message).toContain("TUIMINAL_TEST_MYSQL_HOST")
    expect(message).not.toContain(password)
  })
})
