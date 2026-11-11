# Postman account access in HTTP

Tuiminal connects through `tuiminal postman login`. The prompt does not echo the
API key; `--api-key-stdin` accepts a pipe from a password manager. `--region eu`
selects the EU endpoint; the default is US. The key and region are stored together
in the OS credential store under `dev.tuiminal.postman` by default. Login validates
the key with a paginated workspace read. Keys never go into project files, settings,
URLs, command arguments, or error messages.

If the API accepts the key but credential storage fails, login prints a red
explanation followed by yellow recovery steps. Linux guidance
names libsecret and a credential service, includes the Ubuntu/Debian install
command, and requires a running, unlocked keyring in the same terminal session,
including SSH/WSL. Other platforms direct the user to unlock the system store and
allow Tuiminal access. API failures retain their own diagnostics. Native storage
error details are not echoed. Redirected output is plain text unless `FORCE_COLOR`
is enabled; `NO_COLOR` and `FORCE_COLOR=0` disable colors.

An interactive login then warns in yellow that an unencrypted local file exposes
the key to anyone who can read it and asks whether to save that way. Only typing
`Y` and pressing `[Enter]` accepts. Empty input, `N`, `[Esc]`, `[Ctrl+C]`, EOF, and
unrecognized answers decline, leave the previous account unchanged, and exit with
code 1. Piped input, including `--api-key-stdin`, never authorizes this fallback;
the command explains how to retry interactively instead. Invalid API keys and
network failures do not offer local storage.

After acceptance, `postman-account.json` in the global HTTP home stores the key
and region as plain text. The default path is
`~/.local/share/tuiminal/http/postman-account.json`, respecting `XDG_DATA_HOME`
and the fixture override `TUIMINAL_HTTP_HOME`. Writes are atomic, without backups,
and use mode `0600` where supported. This file takes precedence over an older OS
credential, allowing both the CLI and interactive HTTP to work without the OS
store. A later successful secure login removes the plaintext copy.

`logout` clears both records when the OS store is accessible. If it is unavailable
but a local account exists, logout erases the plaintext key and leaves only an
empty account marker; that marker prevents an older OS credential from becoming
active again when the store recovers. A new secure login removes the marker.

## Interactive Postman source

HTTP always starts with the Local and Postman source cards, including on first
use and without a connected account. Choosing Local opens the local library.
Both sources start without an open request. The editor and response panels appear
only after selecting a request or explicitly creating/importing one. Until then,
Tuiminal and Postman logos appear side by side with a request selection prompt.
Closing or deleting the final request returns to this view; modified requests
still require discard confirmation. No scratch request is created automatically.
Choosing Postman opens its last successfully used workspace and environment,
or the first accessible workspace if no previous workspace remains available.
A removed environment falls back to no environment in the selected workspace.
Only remote selection IDs are saved in `last-workspace.json` under the global
HTTP home; opening Local does not erase the last Postman selection. No account
or API read occurs until Postman is selected. Missing credentials, empty workspace
lists, and API failures keep the cards visible with an error and allow retry or
Local selection. Pending reads cannot replace a later Local choice or a closed
client. Edited/running requests still block source changes.

`[Ctrl+G]` returns to the source cards. Postman reads the
selected workspace and its collections from the API on every workspace opening.
Opening a request reads its collection again. Collection bodies, folders,
request associations, globals, collection variables, and the selected environment
are kept in the mounted session's memory. This mode neither reads nor writes
linked `.http` collections, `.http.postman.json` sidecars, or imported private
environment files. Existing copies from earlier versions are left untouched and
are not used as a fallback when the API is unavailable. Local mode continues to
use the global HTTP library, independently of the opened project.

The workspace chooser shows nested request counts, loaded sequentially in the
background without persistence. `…` means loading; `—` means unavailable. Closing
the chooser or loading a workspace stops scheduling further count reads. `[E]`
selects an optional Postman environment before opening the workspace. The HTTP
`[E]` action opens the workspace environment sidebar, replacing History. Global
is highlighted first; environments open variable/value tables in the request tab
strip, replacing both request/response panels while selected. Opening a tab does
not activate it: Use environment selects the execution context, and Sem ambiente
clears it. Each named environment row also exposes `[A]` with only Use environment
and Delete; these actions do not require opening a tab. Delete reads a fresh baseline
for an unopened environment and asks for confirmation before writing. Cancellation,
read errors and write failures keep the list and any existing drafts. Global variables
remain active and cannot be deleted. Selection persists only its IDs.

Create, rename, edit, and confirmed delete use the Postman environment endpoints;
Global uses the workspace global-variables endpoint. Only shared API-visible values
are available. Variable metadata (including disabled flags and secret references)
is preserved when editing names or values. Saving/deleting rereads the environment
and rejects changed baselines before writing; the API offers no atomic conditional
write here, so a change between that read and write can still race. Drafts remain
in memory on failure or tab switching. Dirty tabs require discard confirmation;
source/workspace changes are blocked during saves or with unsaved environments.
Read errors offer retry without presenting an empty editable environment. Closing
or switching workspace retires pending reads. Local environment storage remains
separate and uses the OS credential store. Variable resolution uses environment, collection, then
workspace precedence. Imported literal authentication values use private
placeholders resolved only in memory. API-omitted Vault values remain unresolved.

Collections and folders start collapsed. Their original names appear verbatim,
including capitalization, punctuation, spacing, and Unicode. Stable remote IDs
identify collections and requests independently of their names and positions.
Repeated request names and requests without URLs remain separate editable calls;
sending requires a URL. The internal file-shaped tree adapter is only an in-memory
view, not a filesystem location. The tree omits the internal `postman/` prefix.
Collections and their folders expose **Settings** in the `[A]`/right-click menu;
double-clicking their row opens the same settings tab. A single click still
expands or collapses the tree. Settings replace both request and response panels
while retaining open request drafts. Collection settings contain **Authorization**,
**Scripts**, and **Variables**; folders contain only **Authorization** and **Scripts**.
Folder authorization can inherit from the nearest parent folder or collection,
use its own credentials, or explicitly select No auth. Unsupported authentication
remains untouched unless the user selects a supported replacement.

`[Ctrl+S]` saves settings to Postman and confirms them with a fresh read. Saves
merge edited settings into the latest collection document, preserving requests,
examples, disabled scripts, and unrelated metadata. Same-field conflicts reject
the write. Failed reads offer retry; rejected or unconfirmed saves retain the draft.
Retry confirms an already accepted update without replaying it. Dirty settings
require discard confirmation on close and block source/workspace and collection
mutations. The collection replacement endpoint has no atomic conditional write:
a concurrent edit between the baseline read and PUT can still race.

Collection and folder scripts execute from the collection through parent folders
to the request in each phase. The request editor continues to show only its own
scripts. Saved parent authentication and scripts also apply to already-open
requests on the next send, preserving request-specific draft edits.

Method labels retain Postman colors. `[?]` opens the HTTP action palette.

`[Ctrl+S]` saves directly to Postman. A successful API update and confirmation read
are required before the editor marks the request saved. Network errors, rejected
writes, and unconfirmed updates leave the draft modified and visible; there is no
saved-local/pending-Postman state or background upload queue. `[Ctrl+P]` invokes
the same save operation. Edits made while a save is running remain unsaved.

Before saving, Tuiminal fetches the current remote request. It sends only edited
fields, preserving collaborators' changes to other fields and omitted content
such as collection/folder scripts and saved responses. Request pre-request and
post-response scripts are compared, sent, and confirmed independently, so editing
one phase preserves remote changes to the other. Edits made during saving also
retain the other phase's confirmed remote content. A concurrent change to the same edited field
stops the write and keeps the draft. Closing the draft requires discard
confirmation; reopening reads the current API version. An already accepted update
can be confirmed on retry without replaying it. Fetch and update are separate API
calls, so another remote edit between them cannot be ruled out. There is no
continuous polling or offline collection fallback.

The request pane's **More → Docs** subtab reads the API description as Markdown. `[Enter] Edit`
opens its complete source, `[Esc] Preview` keeps the draft, and `[Ctrl+S]` saves it
to Postman. Empty descriptions are supported. Merely viewing or opening the
editor does not mark the request modified. Rendering is bounded to 50,000
characters; the complete description remains in the session.

The workspace `[A]`/`[Enter]` menu offers New collection, Select workspace, and
New workspace. The latter asks for a name and creates a personal workspace via
`POST /workspaces`, then opens its API session. Empty names cannot be submitted;
`[Esc]` cancels before submission. Rejected creation retains the entered name.
Once creation returns an ID, a failed session load retries opening that ID without
creating another workspace. Changed or running requests block this action just
as they block workspace selection. Workspace creation follows the official
[create workspace API](https://learning.postman.com/api-docs/api-reference/workspaces/create-workspace).
Collection, folder, and request menus are also available by right-click. Creation,
rename, duplication, and deletion use the API and refresh the session view.
Names are edited inline; `[Esc]` cancels before submission. Deletion requires a
persistent confirmation notification and checks the remote state before deleting.
Collection operations protect dirty and running documents. Unrelated remote
changes do not require reimporting a local copy before creating a folder.
A new scratch request's save asks for a destination collection or folder once it
has edits or a prefilled URL. Saving an untouched, explicitly created empty scratch is a no-op.
Confirmed deletion is already applied remotely and needs no save.
Collection copies preserve remote scripts and saved responses; folder copies use
the transfer API in copy mode. Copying a collection or folder does not execute scripts. Moving requests between
collections or sources is not supported. The collection runner uses the current
session's requests; opening it sends nothing and `[Ctrl+Enter]` starts execution.

Supported request saves include name, description, pre-request and post-response scripts,
method, URL/query, headers,
path variables, supported authentication, raw text/JSON/XML, URL-encoded forms,
multipart, and binary-file references. Multipart retains ordered and repeated
fields; the remote client generates its own boundary. Saving file references
never uploads local file bytes. Confirmation verifies edited fields before
marking a draft saved. Tuiminal-specific options, assertions, and chaining cannot
be persisted as Postman request fields. Restoring option defaults or removing all
assertions and chaining entries does not block saving supported edits. If custom
settings remain, saving identifies the affected section and explains how to reset
it; the draft stays open and no API write occurs. Unsupported authentication, saved-response editing, API Builder assets, mocks, monitors, forks, and collaboration
controls are not reproduced. Body content remains user data; explicit exports
are separate actions.

Request scripts use the official Postman sandbox and appear in the **Scripts** tab
with JavaScript highlighting. `pm.environment`, `pm.globals`, `pm.collectionVariables`,
`pm.variables`, `pm.request`, `pm.response`, `pm.expect`, and `pm.test` are available.
Scope mutations remain local to the workspace session; changing environments or
collections does not mix their values. They do not write shared Postman variables.
Additional scripted HTTP requests, Vault, Visualizer, external packages and flow
control are disabled. Each phase has a two-second execution deadline. Pre-request
errors prevent transport; post-response errors retain the response as failed tests.

## Explicit CLI copies

`tuiminal postman workspaces`, `collections <workspace-id>`, and
`environments <workspace-id>` list accessible API assets.
`tuiminal postman pull <workspace-id> <collection-id> [--environment <id>]`
is an explicit copy/export workflow, separate from interactive Postman mode.
It creates a new protected `.http` file and `.http.postman.json` association under
the global HTTP home's `postman/` directory. It never overwrites previous copies
or writes to the opened project. Variables and identified authentication secrets
use the OS credential store; private environment files contain opaque references.
The CLI reports the resulting environment name and compatibility warnings.

`tuiminal postman push postman/<file>.http [request-name]` sends a saved CLI copy.
The name is required for multi-request files. Sidecar identities and local/remote
baselines are checked before writing; stale remote requests require another
explicit pull. Push preserves omitted fields and confirms descriptions and form,
multipart, or file bodies before advancing the baseline. Moving a copied file
breaks its association. Changes to imported environments remain local. Pulls
requiring over 1 MB of converted source, over 100 imported variables, or an
unavailable credential store fail without publishing a collection copy.

## OAuth2 request authentication

OAuth2 supports Client Credentials and Authorization Code with mandatory PKCE S256,
plus refresh tokens. Request, folder and collection auth settings accept token and
authorization URLs, client ID/secret, Basic/body/public-client authentication, scope,
optional audience and a configurable loopback callback. Use private variable references
for client secrets. Supported Postman OAuth configuration imports and saves with these
fields; imported access/refresh tokens are not used. Implicit, password, custom signing
and tokens in query parameters remain unsupported.

The Auth pane offers `[Ctrl+T]` acquisition, `[Ctrl+R]` renewal, explicit browser opening
or link copying, and forgetting the session token. `[Esc]` cancels the owned operation
outside text inputs. Register the callback URL with the provider before login. The
listener binds only the configured IPv4/IPv6 loopback address, checks state and PKCE,
accepts one code, and closes on success, error, timeout or cancellation. A remote shell
needs a browser able to reach that shell's loopback callback. No manual code paste or
Postman-hosted callback is supported.

Tokens are memory-only and scoped by HTTP home, selected environment and resolved auth
configuration. Requests and collection runs share acquisition and refresh; cancellation
retires only its consumer. Expiry triggers refresh (or another Client Credentials grant
when no refresh token exists). Failed refresh is reported without replaying the resource
request; use Get token to authorize again. OAuth token endpoints require HTTPS, except
literal loopback HTTP for local development, enforce a 30-second timeout and a 128 KiB
response limit, and never follow redirects. These exchanges use strict TLS independently
of resource request proxy/TLS settings. Browser login times out after three minutes.

Issued tokens never enter request models, `.http` files, Postman saves or cURL/preview;
resource execution attaches a transient Bearer header and includes it in existing privacy
redaction. Exiting HTTP clears the token cache. Client Credentials also works headlessly;
Authorization Code requires an interactive authorization in the same process.

## API boundaries

The API client bounds responses and pagination, uses HTTPS and `X-API-Key`, rejects
redirects, and does not expose server response bodies in errors. Limits depend on
the user's Postman plan. The endpoints and authentication follow the
[Postman API reference](https://learning.postman.com/api-docs/api-reference/).
Request creation and update fields follow the official
[create request tool](https://github.com/postmanlabs/postman-mcp-server/blob/main/src/tools/createCollectionRequest.ts)
and [update request tool](https://github.com/postmanlabs/postman-mcp-server/blob/main/src/tools/updateCollectionRequest.ts).
Collection reads retain the owner-prefixed UID; request and folder endpoints use
the collection UUID without that prefix, as specified by the
[collection items SDK reference](https://github.com/postmanlabs/postman-api-sdk-ts/blob/main/documentation/services/CollectionItemsService.md).
Folder transfer payloads retain their required UIDs.
Binary path references follow the
[collection transformer mapping](https://github.com/postmanlabs/postman-collection-transformer/blob/develop/test/unit/fixtures/request-body-file.js).

Collection settings saves use the official [collection replacement endpoint](https://learning.postman.com/api-docs/api-reference/collections/put-collection)
and the Postman Collection v2.1 schema.
