import { describe, expect, test } from "bun:test"
import { resolveGitHubCliInstallPlan } from "../src/features/git/services/github/installer"

describe("GitHub CLI guided installer", () => {
  test("uses the official WinGet package for install and upgrade", () => {
    const install = resolveGitHubCliInstallPlan({
      platform: "win32",
      commands: new Set(["winget"]),
    })
    const upgrade = resolveGitHubCliInstallPlan({
      platform: "win32",
      commands: new Set(["winget"]),
      mode: "upgrade",
    })

    expect(install.manager).toBe("WinGet")
    expect(install.command).toEqual([
      "winget",
      "install",
      "--id",
      "GitHub.cli",
      "--exact",
      "--source",
      "winget",
      "--accept-package-agreements",
      "--accept-source-agreements",
    ])
    expect(upgrade.command?.[1]).toBe("upgrade")
  })

  test("builds the official Debian repository flow and elevates only when needed", () => {
    const user = resolveGitHubCliInstallPlan({
      platform: "linux",
      commands: new Set(["apt", "sudo"]),
    })
    const root = resolveGitHubCliInstallPlan({
      platform: "linux",
      commands: new Set(["apt"]),
      root: true,
    })

    expect(user.manager).toBe("APT · pacote oficial")
    expect(user.displayCommand).toContain("https://cli.github.com/packages")
    expect(user.displayCommand).toContain("sudo apt install gh -y")
    expect(root.displayCommand).toContain("apt install gh -y")
    expect(root.displayCommand).not.toContain("sudo")
  })

  test("prefers Homebrew where supported and otherwise links the official guide", () => {
    expect(
      resolveGitHubCliInstallPlan({
        platform: "darwin",
        commands: new Set(["brew"]),
        mode: "upgrade",
      }),
    ).toMatchObject({ manager: "Homebrew", command: ["brew", "upgrade", "gh"] })

    const unavailable = resolveGitHubCliInstallPlan({
      platform: "freebsd",
      commands: new Set(),
    })
    expect(unavailable.available).toBe(false)
    expect(unavailable.command).toBeNull()
    expect(unavailable.guideUrl).toBe("https://github.com/cli/cli#installation")
  })
})
