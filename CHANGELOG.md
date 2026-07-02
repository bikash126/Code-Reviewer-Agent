# Changelog

All notable changes to Bitbucket PR Reviewer will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Coming Soon

- **Wired-up review passes** — The Settings tab's specialized Security/Bugs/Performance/Style passes, comment template, and file-exclusion rules will actually drive the review pipeline instead of just being stored.
- **Multi-provider reviews** — Use the Claude/Gemini/GitHub/GitLab/Jira credentials already stored in the Integrations tab for real reviews and cross-provider PRs.

## [0.1.8] - 2026-07-02

### New

- **Batch Review** — Review pull requests across every Bitbucket repo in your workspace at once: pick repos, multi-select PRs, and batch-generate AI summaries. Posting still requires its own confirmation per PR.

## [0.1.7] - 2026-07-02

### New

- **Changelog tab** — Browse the full release history without leaving the panel.

## [0.1.6] - 2026-07-02

### New

- **Inline comments** — Comment directly in the diff editor gutter (VS Code's native Comments API) and post them to Bitbucket as inline PR comments, attached to the correct file/line on either side of the diff.
- **Changelog** — Extension changelog is now tracked and shown in the Extensions view's Changelog tab.

## [0.1.5] - 2026-07-02

### New

- **Changed files tree** — Changed files are now grouped into a folder tree, with single-child folder chains compressed like VS Code's own Explorer, instead of a flat list.

## [0.1.4] - 2026-07-02

### Improved

- **Native diff editor** — Clicking a changed file now opens a native VS Code diff editor tab (side-by-side before/after) instead of an inline unified-diff block.

## [0.1.3] - 2026-07-02

### New

- **Per-file diffs** — Click a changed file to view its diff (later replaced in 0.1.4 by a native diff editor tab).

## [0.1.2] - 2026-07-02

### New

- **Activity Bar view** — A dedicated icon in the Activity Bar opens the same PR list/detail/review/settings/integrations app docked in the sidebar, with a responsive layout for narrow widths.

## [0.1.1] - 2026-07-02

### New

- **Project README** — Setup, usage, settings reference, and development instructions.

## [0.1.0] - 2026-07-02

### New

- **Initial release** — List Bitbucket Cloud pull requests, run an AI-assisted review via the OpenAI Responses API, edit the draft summary, and post it as a PR comment only on explicit approval.
- **Bitbucket authentication** — API-token and OAuth 2.0 authentication for Bitbucket Cloud.
- **Multi-repo support** — Workspace repo picker with a remembered choice per workspace.
- **Settings & Integrations tabs** — Comment format, review prompt, specialized review passes, file-exclusion rules, and Claude/Gemini/GitHub/GitLab/Jira credential storage.
