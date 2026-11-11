import type { ReactNode } from "react"
import { DatabaseBatchExportModal } from "../../packages/feature-database/src/ui/DatabaseBatchExportModal"
import { DatabaseChangesModal } from "../../packages/feature-database/src/ui/DatabaseChangesModal"
import { DatabaseQueryFavoritesModal } from "../../packages/feature-database/src/ui/DatabaseQueryFavoritesModal"
import { DEMO_INBOX_NOTIFICATIONS } from "../../packages/feature-git/src/model/inbox/fixtures"
import { DEMO_ISSUES } from "../../packages/feature-git/src/model/issue/fixtures"
import { DEMO_PULL_REQUESTS } from "../../packages/feature-git/src/model/pr/fixtures"
import { GitCompareBranchPicker } from "../../packages/feature-git/src/ui/base/GitCompareBranchPicker"
import { GitDiscardChangesModal } from "../../packages/feature-git/src/ui/base/GitDiscardChangesModal"
import { InboxActionModal } from "../../packages/feature-git/src/ui/inbox/InboxActionModal"
import { IssueActionModal } from "../../packages/feature-git/src/ui/issue/IssueActionModal"
import { PullRequestActionModal } from "../../packages/feature-git/src/ui/pr/PullRequestActionModal"
import { HttpDiscardDocumentModal } from "../../packages/feature-http/src/ui/HttpDiscardDocumentModal"
import { HttpInsecureTlsModal } from "../../packages/feature-http/src/ui/HttpInsecureTlsModal"
import { HttpPostmanSaveModal } from "../../packages/feature-http/src/ui/HttpPostmanSaveModal"
import { HttpPostmanWorkspaceCreateModal } from "../../packages/feature-http/src/ui/HttpPostmanWorkspaceCreateModal"
import { HttpRequestFileModal } from "../../packages/feature-http/src/ui/HttpRequestFileModal"
import { RunnerSaveCommandModal } from "../../packages/feature-runner/src/ui/RunnerSaveCommandModal"
import { AgentProjectEnvironmentDialog } from "../../packages/feature-terminal/src/ui/AgentProjectEnvironmentDialog"
import { AgentProviderPicker } from "../../packages/feature-terminal/src/ui/AgentProviderPicker"
import { RemoteProjectSyncDialog } from "../../packages/feature-terminal/src/ui/RemoteProjectSyncDialog"
import { RemoteProjectSyncProgressDialog } from "../../packages/feature-terminal/src/ui/RemoteProjectSyncProgressDialog"
import { TerminalDialog } from "../../packages/feature-terminal/src/ui/TerminalDialog"

const noop = () => {}
function firstFixture<T>(items: readonly T[]): T {
  const item = items[0]
  if (!item) throw new Error("Missing modal fixture")
  return item
}
const inbox = firstFixture(DEMO_INBOX_NOTIFICATIONS)
const issue = firstFixture(DEMO_ISSUES)
const pullRequest = firstFixture(DEMO_PULL_REQUESTS)
export type ModalLayoutCase = { name: string; id: string; maxHeight: number; view: ReactNode }

/** Real dialog components with synthetic data and inert external actions. */
export function modalLayoutCases(width: number, height: number, onClose = noop): ModalLayoutCase[] {
  const dimensions = { terminalWidth: width, terminalHeight: height }
  const actionProps = {
    initialValue: "",
    checkoutPaths: [],
    busy: false,
    error: "",
    targetComment: null,
    reactionGroups: [],
    onValueChange: noop,
    onSubmit: noop,
    onClose,
  }
  return [
    {
      name: "Postman workspace",
      id: "http-postman-create-workspace",
      maxHeight: 11,
      view: (
        <HttpPostmanWorkspaceCreateModal
          {...dimensions}
          onWorkspaceSelected={async () => {}}
          onClose={onClose}
        />
      ),
    },
    {
      name: "HTTP discard",
      id: "http-discard-document-modal",
      maxHeight: 9,
      view: (
        <HttpDiscardDocumentModal
          {...dimensions}
          requestName="Users"
          onConfirm={noop}
          onClose={onClose}
        />
      ),
    },
    {
      name: "HTTP TLS",
      id: "http-insecure-tls-modal",
      maxHeight: 15,
      view: (
        <HttpInsecureTlsModal
          {...dimensions}
          approval={{ key: "test", target: "https://example.test", environmentName: null }}
          onConfirm={noop}
          onClose={onClose}
        />
      ),
    },
    ...(["request-move", "request-delete"] as const).map((mode) => ({
      name: mode,
      id: "http-request-file-modal",
      maxHeight: mode === "request-move" ? 14 : 13,
      view: (
        <HttpRequestFileModal
          {...dimensions}
          mode={mode}
          requestName="Users"
          currentPath="api/users.http"
          targetPath="api/new.http"
          onTargetPathChange={noop}
          onApply={noop}
          onClose={onClose}
        />
      ),
    })),
    {
      name: "Postman destinations",
      id: "http-postman-save-modal",
      maxHeight: 11,
      view: (
        <HttpPostmanSaveModal
          {...dimensions}
          files={[{ path: "postman/example.http" }]}
          folders={[]}
          requestName="Users"
          onSelect={noop}
          onClose={onClose}
        />
      ),
    },
    {
      name: "Terminal rename",
      id: "terminal-dialog",
      maxHeight: 5,
      view: <TerminalDialog kind="rename" initialValue="Example" onSave={noop} onClose={onClose} />,
    },
    {
      name: "Agent providers",
      id: "terminal-dialog-agent-provider",
      maxHeight: 10,
      view: <AgentProviderPicker onSelect={noop} onClose={onClose} />,
    },
    {
      name: "Execution environments",
      id: "terminal-dialog-project-environments",
      maxHeight: 14,
      view: (
        <AgentProjectEnvironmentDialog
          profiles={[]}
          loading={false}
          error=""
          onSelect={noop}
          onClose={onClose}
        />
      ),
    },
    ...(["destination", "replace"] as const).map((kind) => ({
      name: `Sync ${kind}`,
      id: "terminal-project-sync-confirm",
      maxHeight: 11,
      view: (
        <RemoteProjectSyncDialog
          kind={kind}
          localPath="/tmp/example"
          onConfirm={noop}
          onClose={onClose}
        />
      ),
    })),
    {
      name: "Sync progress",
      id: "terminal-project-sync-progress",
      maxHeight: 13,
      view: (
        <RemoteProjectSyncProgressDialog
          localPath="/tmp/example"
          automatic={false}
          onToggleAutomatic={noop}
          onCancel={onClose}
        />
      ),
    },
    {
      name: "Git discard",
      id: "git-discard-changes-modal",
      maxHeight: 10,
      view: (
        <GitDiscardChangesModal
          target="example.ts"
          fileCount={1}
          onConfirm={noop}
          onClose={onClose}
        />
      ),
    },
    {
      name: "Git branches",
      id: "git-compare-branch-picker",
      maxHeight: 9,
      view: (
        <GitCompareBranchPicker
          side="base"
          references={[]}
          selectedRef={null}
          onSelect={noop}
          onClose={onClose}
        />
      ),
    },
    ...(["done", "unsubscribe"] as const).map((action) => ({
      name: `Inbox ${action}`,
      id: "git-inbox-action-modal",
      maxHeight: 11,
      view: (
        <InboxActionModal
          action={action}
          item={inbox}
          busy={false}
          onConfirm={noop}
          onClose={onClose}
        />
      ),
    })),
    ...(
      [
        "close",
        "reopen",
        "comment",
        "assign",
        "unassign",
        "labels",
        "checkout",
        "reaction",
        "reply",
      ] as const
    ).map((kind) => ({
      name: `Issue ${kind}`,
      id: "git-issue-action-modal",
      maxHeight: 16,
      view: (
        <IssueActionModal
          {...actionProps}
          kind={kind}
          item={issue}
          currentAssignees={[]}
          currentLabels={[]}
        />
      ),
    })),
    ...(
      [
        "close",
        "reopen",
        "comment",
        "assign",
        "unassign",
        "checkout",
        "reaction",
        "reply",
        "approve",
        "merge",
        "approve-workflow",
      ] as const
    ).map((kind) => ({
      name: `PR ${kind}`,
      id: "git-pr-action-modal",
      maxHeight: 19,
      view: (
        <PullRequestActionModal
          {...actionProps}
          open
          kind={kind}
          item={pullRequest}
          workflows={[]}
          mergeMethods={["merge", "squash", "rebase"]}
          mergeQueueConfigured={false}
          mergeQueuePosition={null}
          autoMergeEnabled={false}
        />
      ),
    })),
    ...(["save", "list"] as const).map((mode) => ({
      name: `Query ${mode}`,
      id: "database-saved-query-modal",
      maxHeight: mode === "save" ? 15 : 7,
      view: (
        <DatabaseQueryFavoritesModal
          mode={mode}
          connectionName="example"
          availableWidth={width}
          queries={[]}
          defaultName="Users"
          sql="SELECT 1"
          onClose={onClose}
          onSave={noop}
          onLoad={noop}
          onDelete={noop}
        />
      ),
    })),
    {
      name: "SQL review",
      id: "database-changes-modal",
      maxHeight: 13,
      view: (
        <DatabaseChangesModal
          open
          items={[
            {
              id: "example",
              kind: "update",
              tableName: "main.items",
              sql: "UPDATE items SET title = ?",
              parameters: ["example"],
              approved: false,
              description: "Example",
            },
          ]}
          busy={false}
          notice=""
          onClose={onClose}
          onToggle={noop}
          onToggleAll={noop}
          onExecute={noop}
        />
      ),
    },
    {
      name: "Database export",
      id: "database-batch-export-modal",
      maxHeight: 12,
      view: (
        <DatabaseBatchExportModal
          open
          tableName="main.items"
          columns={["id"]}
          rows={[{ id: "1", data: { id: 1 }, rowKey: { id: 1 } }]}
          onClose={onClose}
        />
      ),
    },
    {
      name: "Runner save",
      id: "runner-save-command-modal",
      maxHeight: 19,
      view: (
        <RunnerSaveCommandModal
          open
          command="echo example"
          availableWidth={width}
          onClose={onClose}
          onSave={noop}
        />
      ),
    },
  ]
}
