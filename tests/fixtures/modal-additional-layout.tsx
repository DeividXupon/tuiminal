import { FeatureUninstallModal } from "../../apps/cli/src/features/FeatureUninstallModal"
import { SensitiveTermsModal } from "../../apps/cli/src/ui/SensitiveTermsModal"
import { UnsavedChangesExitModal } from "../../apps/cli/src/ui/UnsavedChangesExitModal"
import { ActionPalette } from "../../packages/core/src/ui/ActionPalette"
import { DatabaseCellEditor } from "../../packages/feature-database/src/ui/DatabaseCellEditor"
import { DatabaseConnectionModal } from "../../packages/feature-database/src/ui/DatabaseConnectionModal"
import { DatabaseQueryHistoryModal } from "../../packages/feature-database/src/ui/DatabaseQueryHistoryModal"
import { DatabaseTableSearchModal } from "../../packages/feature-database/src/ui/DatabaseTableSearchModal"
import { GitHubCreateBranchPicker } from "../../packages/feature-git/src/ui/shared/GitHubCreateBranchPicker"
import { GitHubCreateRepositoryPicker } from "../../packages/feature-git/src/ui/shared/GitHubCreateRepositoryPicker"
import { HttpCollectionImportModal } from "../../packages/feature-http/src/ui/HttpCollectionImportModal"
import { HttpCurlModal } from "../../packages/feature-http/src/ui/HttpCurlModal"
import { HttpEnvironmentManagerModal } from "../../packages/feature-http/src/ui/HttpEnvironmentManagerModal"
import { HttpPostmanModal } from "../../packages/feature-http/src/ui/HttpPostmanModal"
import { LiveDiffProjectPicker } from "../../packages/feature-terminal/src/ui/LiveDiffProjectPicker"
import { RemoteCodexCompatibilityModal } from "../../packages/feature-terminal/src/ui/RemoteCodexCompatibilityModal"
import { TerminalSplitDialog } from "../../packages/feature-terminal/src/ui/TerminalSplitDialog"
import type { ModalLayoutCase } from "./modal-layout"

const noop = () => {}
export function additionalModalLayoutCases(
  width: number,
  height: number,
  onClose = noop,
): ModalLayoutCase[] {
  const dimensions = { terminalWidth: width, terminalHeight: height }
  return [
    {
      name: "Unsaved exit",
      id: "unsaved-changes-exit-modal",
      maxHeight: 7,
      view: <UnsavedChangesExitModal {...dimensions} open onConfirm={noop} onClose={onClose} />,
    },
    {
      name: "Sensitive terms editor",
      id: "database-sensitive-terms-dialog",
      maxHeight: 16,
      view: <SensitiveTermsModal open terms={["password"]} onSave={noop} onClose={onClose} />,
    },
    {
      name: "Feature uninstall",
      id: "feature-uninstall-dialog",
      maxHeight: 14,
      view: <FeatureUninstallModal id="http" onConfirm={noop} onClose={onClose} />,
    },
    {
      name: "Action palette",
      id: "layout-palette",
      maxHeight: 7,
      view: (
        <ActionPalette
          id="layout-palette"
          title="Actions"
          width={width}
          height={height}
          accent="#ffaa00"
          actions={[
            {
              id: "example",
              label: "Example",
              description: "Example action",
              tags: [],
              shortcut: "",
            },
          ]}
          tags={{}}
          onRun={noop}
          onClose={onClose}
        />
      ),
    },
    {
      name: "HTTP environments",
      id: "http-environment-manager-modal",
      maxHeight: 9,
      view: (
        <HttpEnvironmentManagerModal
          {...dimensions}
          environments={[]}
          globals={undefined}
          activeName={null}
          onSelect={noop}
          onClose={onClose}
          onCreate={async () => ({ environmentName: "Example" })}
          onReplace={async () => ({ environmentName: "Example" })}
          onDelete={async () => ({ environmentName: "Example" })}
          onSaveGlobals={async () => ({ environmentName: "Globals" })}
        />
      ),
    },
    {
      name: "Postman account",
      id: "http-postman-modal",
      maxHeight: 11,
      view: (
        <HttpPostmanModal {...dimensions} onWorkspaceSelected={async () => {}} onClose={onClose} />
      ),
    },
    ...(["curl-import", "curl-export"] as const).map((mode) => ({
      name: mode,
      id: "http-curl-modal",
      maxHeight: 16,
      view: (
        <HttpCurlModal
          {...dimensions}
          mode={mode}
          command="curl https://example.test"
          curl="curl https://example.test"
          onCommandChange={noop}
          onApplyImport={noop}
          onCopy={noop}
          onClose={onClose}
        />
      ),
    })),
    {
      name: "Collection import",
      id: "http-collection-import-modal",
      maxHeight: 27,
      view: (
        <HttpCollectionImportModal
          {...dimensions}
          sourcePath=""
          preview={null}
          busy={false}
          error=""
          onSourcePathChange={noop}
          onApply={noop}
          onBack={noop}
          onClose={onClose}
        />
      ),
    },
    {
      name: "Table search",
      id: "database-table-search-modal",
      maxHeight: 7,
      view: (
        <DatabaseTableSearchModal
          open
          table={{ schema: "main", name: "items", type: "table" }}
          initialValue=""
          onApply={noop}
          onClose={onClose}
        />
      ),
    },
    {
      name: "Cell editor",
      id: "database-cell-editor-modal",
      maxHeight: 14,
      view: (
        <DatabaseCellEditor
          open
          tableName="main.items"
          column={{ field: "title", type: "TEXT", nullable: false, key: "", defaultValue: null }}
          value="Example"
          isNewRow={false}
          onApply={noop}
          onClose={onClose}
        />
      ),
    },
    {
      name: "Database connection",
      id: "database-connection-modal",
      maxHeight: 22,
      view: (
        <DatabaseConnectionModal
          open
          connections={[]}
          selectedConnectionId={null}
          startInForm
          onClose={onClose}
          onSelect={noop}
          onCreated={noop}
          onDeleted={noop}
        />
      ),
    },
    {
      name: "Query history",
      id: "database-query-history-modal",
      maxHeight: 12,
      view: (
        <DatabaseQueryHistoryModal
          open
          entries={[]}
          canRerun={() => false}
          onClose={onClose}
          onRerun={noop}
          onEntriesChanged={noop}
        />
      ),
    },
    {
      name: "Split terminal",
      id: "terminal-split-dialog",
      maxHeight: 8,
      view: (
        <TerminalSplitDialog
          down={false}
          agents={[]}
          canCreateTerminal
          onCreateTerminal={noop}
          onSelectAgent={noop}
          onClose={onClose}
        />
      ),
    },
    {
      name: "Agent compatibility",
      id: "remote-codex-compatibility-modal",
      maxHeight: 9,
      view: (
        <RemoteCodexCompatibilityModal
          report={{
            compatible: false,
            reason: "localCodexMissing",
            localVersion: null,
            remoteVersion: null,
            daemonAvailable: false,
            proxyAvailable: false,
          }}
          onCancel={onClose}
          onOpenGuide={noop}
        />
      ),
    },
    {
      name: "Live Diff project",
      id: "live-diff-project-picker",
      maxHeight: 6,
      view: (
        <LiveDiffProjectPicker
          projects={[]}
          loading={false}
          error=""
          onSelect={noop}
          onClose={onClose}
        />
      ),
    },
    {
      name: "Git repositories",
      id: "git-create-repository-picker",
      maxHeight: 25,
      view: (
        <GitHubCreateRepositoryPicker
          host="github.com"
          selected=""
          demo
          onSelect={noop}
          onClose={onClose}
        />
      ),
    },
    {
      name: "Git remote branches",
      id: "git-create-branch-picker",
      maxHeight: 25,
      view: (
        <GitHubCreateBranchPicker
          host="github.com"
          repository="team/example"
          side="base"
          selected=""
          demo
          onSelect={noop}
          onClose={onClose}
        />
      ),
    },
  ]
}
