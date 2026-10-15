# Postman account access in HTTP

Tuiminal connects to the Postman API through `tuiminal postman login`. The prompt
does not echo the key; `--api-key-stdin` supports a pipe from a password manager.
`--region eu` selects the EU API endpoint; the default uses the US endpoint. The
key and region are stored as one record in the operating system credential store,
under `dev.tuiminal.postman`. `logout` deletes that record. Tuiminal does not put
the key in a command argument, project file, settings JSON, URL, or error message.
An unavailable credential store fails closed. Login checks the key with a paginated
workspace read before saving it.

`tuiminal postman workspaces`, `collections <workspace-id>`, and
`environments <workspace-id>` list accessible assets. When an account is connected,
opening HTTP shows Local and Postman source cards. Local shows the ordinary global
HTTP library, excluding `postman/`; Postman shows the collections linked to the
selected workspace. `[Ctrl+G]` returns to the source chooser when no request is
dirty or running. The Postman source opens a workspace chooser. Selecting a
workspace imports every missing collection and immediately displays its linked
collections in the left tree. Already linked collections are reused without a
duplicate pull or overwriting local edits. `[E]` can select an optional Postman
environment before opening the workspace. The UI reports collections that could
not be imported, while showing those that succeeded. The user can also
run `tuiminal postman pull <workspace-id> <collection-id>
[--environment <environment-id>]` without opening the UI. The CLI reports the
import result and compatibility warnings for individual pulls. The API client bounds responses and
pagination, uses HTTPS, sends the key only in `X-API-Key`, rejects redirects, and
does not print server response bodies on errors. Rate and usage limits remain
subject to the user's Postman plan.

Each explicit pull makes a new `0600` `.http` copy under the global HTTP home's
`postman/` directory. Workspace selection pulls only collections without an
existing association in that workspace. It never overwrites an earlier copy or
writes to the opened project.
It converts Postman Collection v2.0/v2.1 through the existing importer, with the
same compatibility warnings. Workspace globals, collection variables, and the
chosen environment are combined in Postman's broad-to-narrow order and saved as a
new selectable Tuiminal HTTP environment. Each value lives in the OS credential
store; `http-client.private.env.json` contains only opaque references. The browser
selects the new environment after importing; the CLI prints its name so the user
can select it with `[E]`. Literal authentication credentials that the importer can
identify are moved to that private environment. Vault-backed variables whose
values the Postman API omits are reported and remain unresolved.

Each imported file has a `0600` `.http.postman.json` sidecar that records the
workspace and collection IDs, request and folder IDs, and the remote state at import.
Requests with the same Postman display name receive distinct `.http` block IDs;
the visible names remain the same. Opening a workspace repairs duplicate block
IDs in previously linked copies and updates their sidecar keys in the same order,
without fetching a replacement collection or discarding local request edits.
Collections and folders start collapsed when a workspace opens. Opening one
branch reveals only its immediate children; closing it removes its descendant
rows from the visible tree, including in large workspaces.
`[Ctrl+S]` writes the local `.http` and then sends changes in the active
Postman-associated request to Postman. If the remote write fails, the UI says
that the local file was saved and that the Postman update remains pending.
For a saved, imported request, the HTTP footer's `[Ctrl+P] Postman` action
retries the send. The same
operation is available as `tuiminal postman push postman/<file>.http
[request-name]`; the name is required when a file contains multiple requests.
Both actions first fetch the collection and reject the write when that request
changed remotely since the last pull or push. They update one request through
Postman's request endpoint, leaving omitted fields, such as scripts and saved
responses, untouched. The remote request must expose an ID in the imported
collection; older imports without a sidecar must be pulled again. Moving the
imported file breaks its association. The check and update are separate API
calls, so a simultaneous remote edit between them cannot be ruled out.

`[Shift+N]` creates a collection in the selected source. In Postman mode it uses
the active workspace, or lists accessible workspaces when none is selected, and
creates the collection remotely, with an empty linked
`.http` file in `postman/`. Creating a request in a linked collection or folder
creates it remotely and stores its ID. `[Ctrl+S]` on a new scratch request in
Postman mode asks for a linked collection or folder, creates the remote request,
and sends the edited fields. Renaming, duplicating, or deleting a linked request
and renaming or deleting a linked collection update Postman and the local library.
Postman folders appear as nested rows, including empty folders; creating,
renaming, and deleting them uses the folder API and updates request paths in the
linked `.http` copy. Mutations check the saved local and remote states and report
conflicts. The local `postman/` directory is reserved for linked collection
files, so ordinary local folders there are not Postman folders. Request moves
between files and across the Local/Postman boundary are currently unavailable.
The collection tree omits the internal `postman/` directory and labels itself
with the selected workspace. Folder and collection rows use muted gray; request
names use the theme's main text color. Method labels in the tree and URL bar use
Postman's method hues, with darker variants for light themes. `[?]` reveals the
collection pane's actions and navigation shortcuts. Reopening a workspace adds
new collections, but does not refresh linked copies changed by collaborators;
the view is not continuously synchronized.

Push supports request name, method, URL/query, headers, path variables, supported
authentication, and raw text/JSON/XML bodies. It rejects changed form,
multipart, and file bodies. Changing headers or authentication that still use
private placeholders for imported literal secrets is also rejected, preventing
those placeholders from replacing the original remote values. Imported
environment values remain local; changing
them does not update Postman. Remote changes do not refresh the copy
automatically. Postman scripts, saved
responses, unsupported authentication schemes, API Builder assets, mocks,
monitors, forks, and collaboration controls are not reproduced by the HTTP tool.
The importer reports unsupported collection content. Body content is preserved as
provided and may contain user data; users should inspect imported files before
sharing or publishing them. A pull requiring more than 1 MB of converted `.http`
source, more than 100 imported variables, or access to an unavailable secret
store fails without publishing a collection copy.

The API endpoints, authentication header, regional host, and rate limits follow
the [Postman API reference](https://learning.postman.com/api-docs/api-reference/).
The [request update endpoint](https://www.postman.com/postman/postman-public-workspace/request/vm9t0g6/update-a-request)
accepts a collection ID and updates only submitted fields.
