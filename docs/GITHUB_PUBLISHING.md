# GitHub publishing checklist

The approved repository name is `lifegrid-productivity-app`. The state below is exact and was verified directly
(2026-11-12); publishing has not been performed, and no claim below covers GitHub-side steps that have not run.

## Verified current state

- **Local Git repository:** initialized on branch `main`; the commit history is the record in
  [CHANGES](../CHANGES.md) (increment 4 created the repository and initial commits; increments 4–5
  extend it). The history is complete and must be preserved.
- **Source-only archive:** `lifegrid-source-20261112.zip` in the repository root, produced with
  `git archive` from a commit — it contains the tracked files exactly and therefore **excludes**
  `.git` metadata, databases, backups, attachments, logs, Data Protection keys, build outputs and
  local caches; contents were verified entry by entry (see CHANGES increment 5 §4).
- **No GitHub remote:** `git remote -v` shows no remote configured.
- **No public repository:** `lifegrid-productivity-app` has not been created, and its existence,
  visibility and owner are unknown/none. Nothing has been pushed.
- **No GitHub Actions run:** `.github/workflows/ci.yml` is defined but has executed only via the
  equivalent local clean-clone runs; no Action run or artifacts exist.

## Before creating or updating the repository

- Confirm the GitHub owner and whether the repository should be public or private.
- Re-run the pre-publish gates on the final commit: frontend unit tests, lint, production build,
  the complete backend test suite, the Playwright e2e suite, and the clean-clone battery (all are
  recorded with real figures in CHANGES.md; re-run them on the commit being pushed).
- Re-check `.gitignore`/tracked files: no databases, backups, attachments, logs, Data Protection
  keys, environment files with values, build output, or local caches are tracked.

## Create and verify

Create the repository only on explicit approval, with the approved name `lifegrid-productivity-app`
and an accurate description. Before pushing, inspect `git status` and the staged file list; after the
first push, verify directly: the remote URL, default branch, repository visibility, the workflow's
Actions status (the CI badge in README must be added only after a real, green run), and the
deployment configuration.

Do not claim the repository is public, deployed, or production-ready until those checks have
succeeded. The existing project, database identity, and compatibility-sensitive TaskFlow identifiers
must remain intact.
