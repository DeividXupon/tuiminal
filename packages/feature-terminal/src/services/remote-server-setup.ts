import type { RemoteServerBarrierId, RemoteServerReadinessReport } from "./remote-server-readiness"

const activateCodexPath = 'export PATH="$HOME/.local/bin:$PATH"'

export function remoteServerSetupInstructions(
  id: RemoteServerBarrierId,
  report: RemoteServerReadinessReport | null,
) {
  if (id === "githubSsh")
    return [
      '1. Crie uma chave: ssh-keygen -t ed25519 -C "seu-email-do-github"',
      "2. Mostre a chave: cat ~/.ssh/id_ed25519.pub",
      "3. Adicione a chave pública no GitHub: Settings → SSH and GPG keys",
      "4. Teste no terminal: ssh -T git@github.com",
    ]

  const prepareCurrentSession = [
    `1. Ative nesta sessão: ${activateCodexPath}`,
    "2. Verifique: command -v codex && codex --version",
    "3. Conecte sua conta: codex login --device-auth",
    "4. No navegador local, conclua o acesso e aguarde o sucesso neste terminal",
    "5. Confirme o login: codex login status",
  ]
  if (report?.codex.code === "codexUnauthenticated") return prepareCurrentSession

  return [
    "1. Instale: curl -fsSL https://chatgpt.com/codex/install.sh | sh",
    `2. Ative nesta sessão: ${activateCodexPath}`,
    "3. Verifique: command -v codex && codex --version",
    "4. Conecte sua conta: codex login --device-auth",
    "5. No navegador local, conclua o acesso e aguarde o sucesso neste terminal",
    "6. Confirme o login: codex login status",
  ]
}
