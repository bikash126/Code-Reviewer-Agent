# Bitbucket PR Reviewer

A VS Code extension that lists Bitbucket Cloud pull requests for the repository you have open, runs an AI-assisted code review through the OpenAI Responses API, and — only when you explicitly approve it — posts a summary comment back to the PR.

Human-in-the-loop by design: the extension never posts anything to Bitbucket on its own. It drafts, you review/edit, you click **Post Summary**.

## Features

- **PR list & detail** for the Bitbucket repo inferred from your current git workspace (`origin` remote), including author, branches, comment/task counts, changed files, and reviewer approval status.
- **Changed files as a tree**: files are grouped by folder (with single-child folder chains compressed, like VS Code's own Explorer) instead of a flat list.
- **Per-file diffs**: click any changed file in the tree to open it in a native VS Code diff editor tab (side-by-side before/after), fetched on demand from Bitbucket.
- **Inline comments**: comment directly in the diff editor gutter (VS Code's native Comments API — click the "+" next to a line) and post them to Bitbucket as inline PR comments, attached to the correct file/line on either side of the diff.
- **AI review**: sends the PR diff to OpenAI, gets back a risk level, key changes, potential issues, test suggestions, and a draft Bitbucket-flavored markdown summary.
- **Edit before posting**: the draft summary is editable in place; nothing reaches Bitbucket until you click Post Summary and confirm.
- **Multi-repo support**: if your VS Code workspace has more than one Bitbucket repo open, you're prompted to pick one (remembered per workspace; switch anytime).
- **Settings tab**: configure comment formatting, a custom review prompt, specialized review passes (security/bugs/performance/style) with their own prompts, code-quality prompt, and file-exclusion/trivial-file rules — all backed by real VS Code settings (`bitbucketReviewer.*`), editable here or in the standard Settings UI.
- **Integrations tab**: store API keys/tokens for Claude, Gemini, GitHub, GitLab, and Jira in VS Code's encrypted SecretStorage, alongside the OpenAI and Bitbucket connection status.
- **Changelog tab**: browse the full release history in-panel; the same content also ships as `CHANGELOG.md`, shown in VS Code's Extensions view.
- **Batch Review tab**: review pull requests across every Bitbucket repo in your workspace at once — pick which repos to include, multi-select PRs from the combined list, and batch-generate AI summaries in one action. Posting is still per-PR: each summary requires its own confirmation before it reaches Bitbucket.
- **Activity Bar view**: a dedicated icon in the left-hand Activity Bar opens the same app (PR list/detail, review panel, Settings, Integrations, Changelog, Batch Review) docked in the sidebar, with a responsive layout for narrow widths — independent of, and in addition to, the editor-tab panel opened via "Open Reviewer".

> **Current scope note:** the Settings and Integrations tabs persist your preferences and credentials, but the review pipeline itself still only uses **Bitbucket + OpenAI** (a single review pass → one summary comment). The specialized passes, comment template, file-exclusion rules, and the Claude/Gemini/GitHub/GitLab/Jira credentials are not yet wired into the review/posting flow — that's tracked as follow-up work.

## Requirements

- VS Code 1.85+
- A git repository open in VS Code whose `origin` (or another) remote points at `bitbucket.org`
- A Bitbucket Cloud account with either:
  - an Atlassian account email + [API token](https://id.atlassian.com/manage-profile/security/api-tokens) (fastest setup), or
  - a Bitbucket OAuth 2.0 consumer (`clientId` + `clientSecret`)
- An OpenAI API key (you'll be prompted for it the first time you run a review)

## Installation

### Option A — Run from source (development)

```
npm install
```

Then in VS Code: press **F5** (or Run → Start Debugging) to launch an Extension Development Host window with the extension loaded. Run `npm run watch` in a terminal to rebuild on save; reload the dev host window (`Cmd+R` / "Developer: Reload Window") to pick up changes.

### Option B — Install as a real extension via `.vsix`

```
npx @vscode/vsce package
```

This produces `bitbucket-pr-reviewer-<version>.vsix` in the project root. Install it with either:

- VS Code UI: Extensions view (`Cmd+Shift+X`) → `...` menu → **Install from VSIX...** → select the file.
- CLI: `code --install-extension bitbucket-pr-reviewer-0.1.0.vsix`

Reload VS Code when prompted. To pick up further changes, repackage and reinstall (bump `version` in `package.json` first if you want VS Code to treat it as an update rather than a reinstall of the same version).

## Getting started

1. `Cmd+Shift+P` → **Bitbucket PR Reviewer: Connect to Bitbucket**
   - Default auth method is `apiToken`: enter your Atlassian email, then your API token.
   - To use OAuth instead, first set `bitbucketReviewer.authMethod` to `oauth` and fill in `bitbucketReviewer.oauth.clientId` / `clientSecret` in Settings, and configure your Bitbucket OAuth consumer's callback URL to `http://127.0.0.1:51763/callback`.
2. `Cmd+Shift+P` → **Bitbucket PR Reviewer: Open Reviewer** to open the webview.
   - If multiple Bitbucket repos are open in your workspace, you'll be prompted to pick one; use **Switch Repository** (button in the panel header, or its own command) to change your choice later.
3. Select a PR from the list, then click **Run AI Review**.
   - First time only: you'll be prompted for an OpenAI API key (stored in SecretStorage).
4. Review the risk level, key changes, potential issues, and test suggestions. Optionally **Edit Summary** and **Save Edit**.
5. Click **Post Summary**, confirm in the dialog, and it's posted as a real comment on the PR.

## Commands

| Command | Description |
|---|---|
| `Bitbucket PR Reviewer: Connect to Bitbucket` | Runs the interactive auth flow for the configured auth method |
| `Bitbucket PR Reviewer: Sign Out` | Clears stored Bitbucket credentials |
| `Bitbucket PR Reviewer: Open Reviewer` | Opens (or focuses) the main webview panel |
| `Bitbucket PR Reviewer: Refresh Pull Requests` | Reloads the open PR list |
| `Bitbucket PR Reviewer: Switch Repository` | Forgets the remembered repo choice and re-prompts if multiple candidates exist |
| `Bitbucket PR Reviewer: Run AI Review` | Runs a review for a PR ID you enter, opening the panel if needed |
| `Bitbucket PR Reviewer: Post Summary to Bitbucket` | Posts the current draft summary for a PR ID you enter |
| `Bitbucket PR Reviewer: Open Settings` | Opens the panel's Settings tab |
| `Bitbucket PR Reviewer: Open Integrations` | Opens the panel's Integrations tab |
| `Bitbucket PR Reviewer: Open Changelog` | Opens the panel's Changelog tab |
| `Bitbucket PR Reviewer: Open Batch Review` | Opens the panel's Batch Review tab |

## Settings

All settings live under `bitbucketReviewer.*` in VS Code settings (editable via the Settings tab in the panel, or the standard Settings UI — multiline fields render as textareas there too). Key groups:

- **Auth**: `authMethod`, `oauth.clientId`, `oauth.clientSecret`
- **Review**: `openai.model`, `review.maxDiffBytes`
- **Comment format**: `commentFormat.showSeverity` / `showCategory` / `showFooter` / `template`
- **Prompts**: `reviewPrompt.custom`, `passPrompts.security` / `bugs` / `performance` / `style`, `codeQuality.customPrompt`
- **Review passes**: `enhancedSecurityScan.enabled`, `reviewPasses.security` / `bugs` / `performance` / `style`
- **File rules**: `excludedFiles.customPatterns`, `fileRules.alwaysReview` / `treatAsTrivial`, and 13 `builtInRules.*` toggles (lock files, minified files, source maps, generated code, build output, vendor directories, snapshot tests, binary assets, compiled binaries, generated API clients, changelog & license, editor config, localization files)

API keys/tokens (OpenAI, Claude, Gemini, GitHub, GitLab, Jira) are **not** settings — they're stored in VS Code's encrypted SecretStorage via the Integrations tab or the first-run prompts, and are never written to `settings.json`.

## Development

```
npm install
npm run watch          # esbuild in watch mode (extension.js + webview.js/css)
npm run typecheck       # tsc --noEmit
npm run lint             # eslint
npm run test:unit        # vitest — unit + controller-driven integration tests
npm run test:integration # @vscode/test-electron smoke test (downloads a VS Code test binary)
npm run build            # production build (also runs automatically before packaging)
```

### Project layout

```
src/
  auth/        SecretStorage wrapper, API-token auth, OAuth 2.0 flow, AuthManager
  bitbucket/   Remote URL parsing, REST client (list/detail/diff/comments)
  git/         Git remote discovery + multi-repo picker
  openai/      Responses API client, prompt builder, structured-output parsing
  review/      Review orchestration (diff -> prompt -> OpenAI -> ReviewResult)
  settings/    Settings + Integrations read/write services
  panel/       ReviewerPanelController + BatchReviewController (message protocol logic) + ReviewerPanel (vscode wrapper)
  webview/     React app: PR list/detail, review panel, Settings/Integrations/Changelog/Batch Review tabs
  extension.ts Command registration / activation
  test/        vitest unit tests + a minimal @vscode/test-electron smoke test
```

## Known limitations

- Settings/Integrations tabs are UI + storage only; the specialized review passes and additional provider credentials aren't yet used by the review pipeline (see scope note above).
- OAuth requires a Bitbucket OAuth consumer you provide; API-token auth has no such prerequisite and is the faster path to get started.
