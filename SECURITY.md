# Security policy

Tuiminal is currently a pre-alpha project. Security reports are welcome, but this stage does not carry a production support SLA.

## Supported versions

| Version | Security updates |
| --- | --- |
| Latest `0.2.0-pre-alpha.x` | Best-effort support until replaced or withdrawn |
| Older prereleases and source snapshots | Unsupported; reproduce against the latest prerelease first |

## Reporting a vulnerability

Please use a [private GitHub security advisory](https://github.com/DeividXupon/tuiminal/security/advisories/new). Do not put exploit details, credentials, private data, or an unpatched vulnerability in a public issue.

Include the Tuiminal version or commit, operating system and architecture, affected tool, impact, and the smallest safe reproduction you can provide. Redact tokens, passwords, cookies, database contents, filesystem secrets, and unrelated logs. Use disposable fixtures whenever possible.

If the private advisory form is unavailable, contact the repository owner through GitHub without including sensitive details and request a private channel.

## Triage and disclosure

The maintainer aims to acknowledge a report within three business days, provide an initial triage within seven, and send progress updates at least every fourteen days while remediation is active. These are targets, not guarantees.

The response process is to reproduce privately, assess affected versions and distributed artifacts, prepare tests and a fix, coordinate disclosure with the reporter, and publish or withdraw affected packages only after the release gate passes. Potentially duplicated remote writes, uncertain database commits, and leaked credentials are treated as high-priority integrity or confidentiality incidents. Tuiminal will not ask a reporter to test against production data or disclose a secret.

Credit is offered when requested and legally possible. Please allow a reasonable remediation window before public disclosure; if active exploitation or imminent user harm changes the timeline, state that clearly in the advisory.
