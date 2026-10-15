export const REMOTE_MYSQL_ENVIRONMENT_NAMES = [
  "TUIMINAL_TEST_MYSQL_HOST",
  "TUIMINAL_TEST_MYSQL_PORT",
  "TUIMINAL_TEST_MYSQL_DATABASE",
  "TUIMINAL_TEST_MYSQL_USER",
  "TUIMINAL_TEST_MYSQL_PASSWORD",
  "TUIMINAL_TEST_MYSQL_TLS",
  "TUIMINAL_TEST_MYSQL_WRITES",
] as const

type RemoteMySqlEnvironmentName = (typeof REMOTE_MYSQL_ENVIRONMENT_NAMES)[number]

export type RemoteMySqlTestConfiguration = {
  host: string
  port: number
  database: string
  username: string
  password: string
}

export type RemoteMySqlEnvironment =
  | { status: "disabled" }
  | { status: "invalid"; error: Error }
  | { status: "enabled"; configuration: RemoteMySqlTestConfiguration }

type Environment = Readonly<Record<string, string | undefined>>

function configuredValues(environment: Environment) {
  return Object.fromEntries(
    REMOTE_MYSQL_ENVIRONMENT_NAMES.map((name) => {
      const value = environment[name] ?? ""
      return [name, name === "TUIMINAL_TEST_MYSQL_PASSWORD" ? value : value.trim()]
    }),
  ) as Record<RemoteMySqlEnvironmentName, string>
}

function validName(value: string) {
  return value.length <= 255 && !/[\p{Cc}\p{Cf}]/u.test(value)
}

function invalid(name: RemoteMySqlEnvironmentName, requirement: string): RemoteMySqlEnvironment {
  return { status: "invalid", error: new Error(`${name} ${requirement}.`) }
}

export function remoteMySqlEnvironment(
  environment: Environment = process.env,
): RemoteMySqlEnvironment {
  const values = configuredValues(environment)
  if (REMOTE_MYSQL_ENVIRONMENT_NAMES.some((name) => !values[name])) {
    return { status: "disabled" }
  }

  const port = Number(values.TUIMINAL_TEST_MYSQL_PORT)
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    return invalid("TUIMINAL_TEST_MYSQL_PORT", "must be an integer between 1 and 65535")
  }
  if (
    !validName(values.TUIMINAL_TEST_MYSQL_HOST) ||
    /[\s/]/u.test(values.TUIMINAL_TEST_MYSQL_HOST)
  ) {
    return invalid("TUIMINAL_TEST_MYSQL_HOST", "must be a valid hostname")
  }
  if (!validName(values.TUIMINAL_TEST_MYSQL_DATABASE)) {
    return invalid("TUIMINAL_TEST_MYSQL_DATABASE", "must be a valid database name")
  }
  if (!validName(values.TUIMINAL_TEST_MYSQL_USER)) {
    return invalid("TUIMINAL_TEST_MYSQL_USER", "must be a valid username")
  }
  if (values.TUIMINAL_TEST_MYSQL_USER.toLowerCase() === "root") {
    return invalid("TUIMINAL_TEST_MYSQL_USER", "must name a dedicated non-root account")
  }
  if (values.TUIMINAL_TEST_MYSQL_TLS !== "1") {
    return invalid("TUIMINAL_TEST_MYSQL_TLS", "must be 1")
  }
  if (values.TUIMINAL_TEST_MYSQL_WRITES !== "1") {
    return invalid("TUIMINAL_TEST_MYSQL_WRITES", "must be 1")
  }

  return {
    status: "enabled",
    configuration: {
      host: values.TUIMINAL_TEST_MYSQL_HOST,
      port,
      database: values.TUIMINAL_TEST_MYSQL_DATABASE,
      username: values.TUIMINAL_TEST_MYSQL_USER,
      password: values.TUIMINAL_TEST_MYSQL_PASSWORD,
    },
  }
}
