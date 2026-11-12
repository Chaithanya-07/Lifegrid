# GitHub publishing checklist

The approved repository name is `lifegrid-productivity-app`. Publishing has not been performed or verified: this workspace has no
Git metadata, and the repository's existence, visibility, owner, remotes, and deployment status are unknown.

## Before creating or updating the repository

- Confirm the GitHub owner and whether the repository should be public or private.
- Review the complete file inventory and `.gitignore`; exclude databases, backups, attachments, logs, Data Protection keys,
  environment files, build output, and local caches.
- Run the frontend test, lint, and build commands and the complete backend test suite.
- Review current production/security documentation, add a CI workflow, provide an `.env.example` without secrets, and decide on an
  appropriate license.
- Verify README setup instructions and migration/backup behavior using isolated test data.

## Create and verify

Initialize or use the intended repository only after confirming the owner and visibility. Create it with the approved name,
`lifegrid-productivity-app`, and an accurate description. Before pushing, inspect `git status` and the staged file list. After
publishing, verify the remote URL, default branch, repository metadata, Actions status, and deployment configuration directly.

Do not claim the repository is public, deployed, or production-ready until those checks have succeeded. The existing project,
database identity, and compatibility-sensitive TaskFlow identifiers must remain intact.
