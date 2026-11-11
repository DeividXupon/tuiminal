const MAC_PICKER = `const app = Application.currentApplication();
app.includeStandardAdditions = true;
try {
  JSON.stringify(app.chooseFile({ multipleSelectionsAllowed: true }).map(file => file.toString()));
} catch (error) {
  if (error.errorNumber !== -128) throw error;
  "[]";
}`

const WINDOWS_PICKER = `Add-Type -AssemblyName System.Windows.Forms
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$dialog = New-Object System.Windows.Forms.OpenFileDialog
$dialog.CheckFileExists = $true
$dialog.Multiselect = $true
try {
  if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
    [Console]::Write((ConvertTo-Json -InputObject @($dialog.FileNames) -Compress))
  }
} finally { $dialog.Dispose() }`

export function httpFilePickerCommand(
  platform: NodeJS.Platform = process.platform,
  which: (name: string) => string | null = Bun.which,
) {
  if (platform === "darwin")
    return { cmd: ["/usr/bin/osascript", "-l", "JavaScript", "-e", MAC_PICKER], json: true }
  if (platform === "win32")
    return {
      cmd: ["powershell.exe", "-NoProfile", "-NonInteractive", "-STA", "-Command", WINDOWS_PICKER],
      json: true,
    }
  const zenity = which("zenity")
  if (zenity)
    return { cmd: [zenity, "--file-selection", "--multiple", "--separator=\n"], json: false }
  const kdialog = which("kdialog")
  if (kdialog)
    return {
      cmd: [kdialog, "--getopenfilename", ".", "*", "--multiple", "--separate-output"],
      json: false,
    }
  throw new Error("Seletor de arquivos indisponível. Solte um arquivo ou cole seu caminho.")
}

export async function chooseHttpBodyFiles(
  signal: AbortSignal,
  command?: { cmd: string[]; json: boolean },
): Promise<string[] | null> {
  if (signal.aborted) return null
  const args = command ?? httpFilePickerCommand()
  let child: ReturnType<typeof spawnPicker>
  try {
    child = spawnPicker(args.cmd)
  } catch {
    throw new Error("Não foi possível abrir o seletor de arquivos.")
  }
  const abort = () => child.kill()
  signal.addEventListener("abort", abort, { once: true })
  try {
    const [code, output, error] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ])
    if (signal.aborted) return null
    if (code === 1 && !error.trim() && !output.trim()) return null
    if (code !== 0) throw new Error("Não foi possível abrir o seletor de arquivos.")
    if (!output.trim()) return null
    return pickerPaths(output, args.json)
  } finally {
    signal.removeEventListener("abort", abort)
  }
}

function spawnPicker(command: string[]) {
  return Bun.spawn(command, { stdin: "ignore", stdout: "pipe", stderr: "pipe" })
}

function pickerPaths(output: string, json: boolean) {
  try {
    const paths: unknown = json ? JSON.parse(output) : output.replace(/\r?\n$/, "").split(/\r?\n/)
    if (!Array.isArray(paths) || paths.some((path) => typeof path !== "string" || !path))
      throw new Error()
    return paths.length ? (paths as string[]) : null
  } catch {
    throw new Error("Não foi possível abrir o seletor de arquivos.")
  }
}
