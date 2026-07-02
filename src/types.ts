// Shared types used across the extension host and the webview UI.
// Kept dependency-free (no `vscode` imports) so it can be bundled into the webview too.

export interface BitbucketRemoteInfo {
  workspace: string;
  repoSlug: string;
}

export type PullRequestState = "OPEN" | "MERGED" | "DECLINED" | "SUPERSEDED";

export interface PullRequestSummary {
  id: number;
  title: string;
  state: PullRequestState;
  author: {
    displayName: string;
    accountId?: string;
    avatarUrl?: string;
  };
  sourceBranch: string;
  destinationBranch: string;
  createdOn: string;
  updatedOn: string;
  commentCount: number;
  taskCount: number;
  webUrl: string;
}

export interface ChangedFile {
  path: string;
  status: "added" | "removed" | "modified" | "renamed";
  linesAdded: number;
  linesRemoved: number;
  oldPath?: string;
}

export interface PullRequestDetail extends PullRequestSummary {
  description: string;
  changedFiles: ChangedFile[];
  reviewers: { displayName: string; approved: boolean }[];
  sourceCommitHash: string;
  destinationCommitHash: string;
}

export type RiskLevel = "low" | "medium" | "high";

export interface PotentialIssue {
  severity: "info" | "warning" | "critical";
  file?: string;
  detail: string;
}

export interface ReviewResult {
  summaryMarkdown: string;
  riskLevel: RiskLevel;
  keyChanges: string[];
  potentialIssues: PotentialIssue[];
  testSuggestions: string[];
  generatedAt: string;
  model: string;
}

/** Per-PR review workflow state tracked by the extension host and mirrored to the webview. */
export type ReviewStatus =
  | "idle"
  | "loading-detail"
  | "reviewing"
  | "review-ready"
  | "editing"
  | "posting"
  | "posted"
  | "error";

export interface ConnectionState {
  connected: boolean;
  authMethod?: "apiToken" | "oauth";
  accountLabel?: string;
  workspace?: string;
  repoSlug?: string;
}

// ---- Integrations (API keys / tokens for AI + Git + Jira providers) ----
// Unlike ReviewSettings, these are secrets: persisted in vscode.SecretStorage, never
// settings.json. The webview only ever learns whether a credential is `configured`;
// the secret value itself is never sent back out of the extension host.

export type AiProviderId = "claude" | "gemini" | "openai";
export type GitProviderId = "bitbucket" | "github" | "gitlab";

export interface IntegrationsState {
  claude: { configured: boolean };
  gemini: { configured: boolean };
  openai: { configured: boolean };
  bitbucket: { configured: boolean };
  github: { configured: boolean };
  gitlab: { configured: boolean; instanceUrl: string };
  jira: { configured: boolean; siteUrl: string; email: string };
}

// ---- Review settings ----
// These map 1:1 to `bitbucketReviewer.*` entries in package.json's `contributes.configuration`,
// which remains the source of truth (edits persist to VS Code settings.json). The dotted `key`
// used in update/reset messages is the setting's path with the `bitbucketReviewer.` prefix removed,
// e.g. "commentFormat.showSeverity" or "builtInRules.lockFiles".

export type ReviewPassId = "security" | "bugs" | "performance" | "style";

export const REVIEW_PASS_IDS: ReviewPassId[] = ["security", "bugs", "performance", "style"];

export type BuiltInRuleId =
  | "lockFiles"
  | "minifiedFiles"
  | "sourceMaps"
  | "generatedCode"
  | "buildOutput"
  | "vendorDirectories"
  | "snapshotTests"
  | "binaryAssets"
  | "compiledBinaries"
  | "generatedApiClients"
  | "changelogAndLicense"
  | "editorConfig"
  | "localizationFiles";

export interface BuiltInRuleMeta {
  id: BuiltInRuleId;
  label: string;
  pattern: string;
}

/** Dependency-free metadata for the 13 built-in trivial/exclusion rules, shared by extension + webview. */
export const BUILT_IN_RULES: BuiltInRuleMeta[] = [
  { id: "lockFiles", label: "Lock files", pattern: "package-lock.json, yarn.lock, pnpm-lock.yaml, Gemfile.lock, poetry.lock, composer.lock" },
  { id: "minifiedFiles", label: "Minified files", pattern: "*.min.js, *.min.css" },
  { id: "sourceMaps", label: "Source maps", pattern: "*.map" },
  { id: "generatedCode", label: "Generated code", pattern: "*.generated.*, *_pb2.py, *.g.dart" },
  { id: "buildOutput", label: "Build output", pattern: "dist/, build/, out/" },
  { id: "vendorDirectories", label: "Vendor directories", pattern: "vendor/, third_party/" },
  { id: "snapshotTests", label: "Snapshot tests", pattern: "__snapshots__/, *.snap" },
  { id: "binaryAssets", label: "Binary assets", pattern: "*.png, *.jpg, *.gif, *.ico, *.woff, *.woff2" },
  { id: "compiledBinaries", label: "Compiled binaries", pattern: "*.wasm, *.dll, *.so, *.dylib" },
  { id: "generatedApiClients", label: "Generated API clients", pattern: "*.pb.go, openapi-generated/" },
  { id: "changelogAndLicense", label: "Changelog & license", pattern: "CHANGELOG.md, LICENSE*" },
  { id: "editorConfig", label: "Editor config", pattern: ".vscode/, .idea/" },
  { id: "localizationFiles", label: "Localization files", pattern: "locales/, *.i18n.json, *.po" },
];

export interface ReviewSettings {
  commentFormat: {
    showSeverity: boolean;
    showCategory: boolean;
    showFooter: boolean;
    template: string;
  };
  reviewPrompt: string;
  enhancedSecurityScan: boolean;
  reviewPasses: Record<ReviewPassId, boolean>;
  passPrompts: Record<ReviewPassId, string>;
  codeQuality: {
    customPrompt: string;
  };
  excludedFiles: {
    customPatterns: string;
  };
  fileRules: {
    alwaysReview: string;
    treatAsTrivial: string;
  };
  builtInRules: Record<BuiltInRuleId, boolean>;
}

// ---- Batch review (cross-repo / multi-workspace) ----

export interface BatchPullRequestItem extends PullRequestSummary {
  workspace: string;
  repoSlug: string;
}

export type BatchReviewItemStatus =
  | "queued"
  | "reviewing"
  | "review-ready"
  | "posting"
  | "posted"
  | "error";

export interface BatchReviewTarget {
  workspace: string;
  repoSlug: string;
  prId: number;
}

/** Shared key format identifying a PR across repos, used by both the extension host and the webview. */
export function batchItemKey(workspace: string, repoSlug: string, prId: number): string {
  return `${workspace}/${repoSlug}#${prId}`;
}

// ---- Webview <-> Extension message protocol ----

export type WebviewToExtensionMessage =
  | { type: "ready" }
  | { type: "connect" }
  | { type: "signOut" }
  | { type: "refreshPullRequests" }
  | { type: "switchRepository" }
  | { type: "selectPullRequest"; prId: number }
  | { type: "runReview"; prId: number }
  | { type: "regenerateReview"; prId: number }
  | { type: "editSummary"; prId: number; summaryMarkdown: string }
  | { type: "postSummary"; prId: number }
  | { type: "getSettings" }
  | { type: "updateSetting"; key: string; value: boolean | string }
  | { type: "resetSetting"; key: string }
  | { type: "getIntegrations" }
  | { type: "saveAiProviderKey"; provider: "claude" | "gemini"; apiKey: string }
  | { type: "saveGithubToken"; token: string }
  | { type: "saveGitlabCredentials"; token: string; instanceUrl: string }
  | { type: "saveJiraCredentials"; siteUrl: string; email: string; apiToken: string }
  | { type: "openFileDiff"; prId: number; path: string }
  | { type: "getBatchRepos" }
  | { type: "loadBatchPullRequests"; repos: BitbucketRemoteInfo[] }
  | { type: "runBatchReview"; items: BatchReviewTarget[] }
  | { type: "editBatchSummary"; target: BatchReviewTarget; summaryMarkdown: string }
  | { type: "postBatchSummary"; target: BatchReviewTarget };

export type FileDiffOpenStatus = "loading" | "done" | "error";

export type ExtensionToWebviewMessage =
  | { type: "connectionState"; state: ConnectionState }
  | { type: "pullRequestList"; pullRequests: PullRequestSummary[]; loading: boolean }
  | { type: "pullRequestDetail"; prId: number; detail: PullRequestDetail }
  | { type: "reviewStatus"; prId: number; status: ReviewStatus; error?: string }
  | { type: "reviewResult"; prId: number; result: ReviewResult }
  | { type: "postSummaryResult"; prId: number; success: boolean; error?: string; commentUrl?: string }
  | { type: "settings"; settings: ReviewSettings }
  | { type: "focusSettingsTab" }
  | { type: "focusIntegrationsTab" }
  | { type: "focusChangelogTab" }
  | { type: "focusBatchReviewTab" }
  | { type: "integrations"; integrations: IntegrationsState }
  | { type: "fileDiffOpenStatus"; prId: number; path: string; status: FileDiffOpenStatus; error?: string }
  | { type: "batchRepos"; repos: BitbucketRemoteInfo[] }
  | { type: "batchPullRequestList"; items: BatchPullRequestItem[]; loading: boolean }
  | { type: "batchReviewStatus"; target: BatchReviewTarget; status: BatchReviewItemStatus; error?: string }
  | { type: "batchReviewResult"; target: BatchReviewTarget; result: ReviewResult }
  | { type: "batchPostResult"; target: BatchReviewTarget; success: boolean; error?: string; commentUrl?: string };

/** Shared status-map key format for per-file diff opens, used by both the extension host and the webview. */
export function fileDiffKey(prId: number, path: string): string {
  return `${prId}::${path}`;
}
