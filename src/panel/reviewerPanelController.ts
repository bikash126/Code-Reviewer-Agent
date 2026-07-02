import { BitbucketClient } from "../bitbucket/client";
import { OpenAiClient } from "../openai/client";
import { ReviewService } from "../review/reviewService";
import {
  BitbucketRemoteInfo,
  ChangedFile,
  ConnectionState,
  ExtensionToWebviewMessage,
  IntegrationsState,
  PullRequestDetail,
  ReviewResult,
  ReviewSettings,
  WebviewToExtensionMessage,
} from "../types";

/**
 * All dependencies the controller needs, factored out so the message-handling
 * logic below can be driven in tests without a real VS Code host, webview,
 * Bitbucket, or OpenAI backend.
 */
export interface ReviewerPanelDeps {
  resolveRemote: () => Promise<BitbucketRemoteInfo>;
  /** Clears any remembered repository choice so the next `resolveRemote()` re-prompts. */
  forgetRemote: () => Promise<void>;
  getConnectionState: (workspace?: string, repoSlug?: string) => Promise<ConnectionState>;
  connectAuth: () => Promise<void>;
  signOutAuth: () => Promise<void>;
  createBitbucketClient: (remote: BitbucketRemoteInfo) => BitbucketClient;
  ensureOpenAiApiKey: () => Promise<string>;
  createOpenAiClient: (apiKey: string) => OpenAiClient;
  getReviewConfig: () => { model: string; maxDiffBytes: number };
  /** Returns true if the user confirmed posting; false if they cancelled. */
  confirmPost: (prId: number) => Promise<boolean>;
  showError: (message: string) => void;
  post: (message: ExtensionToWebviewMessage) => void;
  getSettings: () => ReviewSettings;
  /** `key` is the setting path under `bitbucketReviewer.`, e.g. "commentFormat.showSeverity". */
  updateSetting: (key: string, value: boolean | string) => Promise<void>;
  resetSetting: (key: string) => Promise<void>;
  getIntegrations: () => Promise<IntegrationsState>;
  saveAiProviderKey: (provider: "claude" | "gemini", apiKey: string) => Promise<void>;
  saveGithubToken: (token: string) => Promise<void>;
  saveGitlabCredentials: (token: string, instanceUrl: string) => Promise<void>;
  saveJiraCredentials: (siteUrl: string, email: string, apiToken: string) => Promise<void>;
  /** Fetches before/after content (via `client`) and opens a native VS Code diff editor tab for the given file. */
  openFileDiff: (client: BitbucketClient, prId: number, detail: PullRequestDetail, file: ChangedFile) => Promise<void>;
}

/**
 * Owns the webview <-> extension message protocol for the reviewer panel.
 * Framework-agnostic: `ReviewerPanel` wires this up to a real `vscode.WebviewPanel`;
 * tests wire it up to fakes.
 */
export class ReviewerPanelController {
  private remoteInfo: BitbucketRemoteInfo | undefined;
  private bitbucketClient: BitbucketClient | undefined;
  private detailCache = new Map<number, PullRequestDetail>();
  private reviewCache = new Map<number, ReviewResult>();
  private draftSummaryCache = new Map<number, string>();

  constructor(private readonly deps: ReviewerPanelDeps) {}

  async handleMessage(message: WebviewToExtensionMessage): Promise<void> {
    try {
      switch (message.type) {
        case "ready":
          await this.sendConnectionState();
          await this.refreshPullRequests();
          this.sendSettings();
          await this.sendIntegrations();
          break;
        case "connect":
          await this.deps.connectAuth();
          await this.sendConnectionState();
          await this.refreshPullRequests();
          break;
        case "signOut":
          await this.deps.signOutAuth();
          this.bitbucketClient = undefined;
          await this.sendConnectionState();
          break;
        case "refreshPullRequests":
          await this.refreshPullRequests();
          break;
        case "switchRepository":
          await this.switchRepository();
          break;
        case "selectPullRequest":
          await this.loadPullRequestDetail(message.prId);
          break;
        case "runReview":
          await this.runReview(message.prId, false);
          break;
        case "regenerateReview":
          await this.runReview(message.prId, true);
          break;
        case "editSummary":
          this.draftSummaryCache.set(message.prId, message.summaryMarkdown);
          break;
        case "postSummary":
          await this.postSummary(message.prId);
          break;
        case "getSettings":
          this.sendSettings();
          break;
        case "updateSetting":
          await this.deps.updateSetting(message.key, message.value);
          this.sendSettings();
          break;
        case "resetSetting":
          await this.deps.resetSetting(message.key);
          this.sendSettings();
          break;
        case "getIntegrations":
          await this.sendIntegrations();
          break;
        case "saveAiProviderKey":
          await this.deps.saveAiProviderKey(message.provider, message.apiKey);
          await this.sendIntegrations();
          break;
        case "saveGithubToken":
          await this.deps.saveGithubToken(message.token);
          await this.sendIntegrations();
          break;
        case "saveGitlabCredentials":
          await this.deps.saveGitlabCredentials(message.token, message.instanceUrl);
          await this.sendIntegrations();
          break;
        case "saveJiraCredentials":
          await this.deps.saveJiraCredentials(message.siteUrl, message.email, message.apiToken);
          await this.sendIntegrations();
          break;
        case "openFileDiff":
          await this.openFileDiff(message.prId, message.path);
          break;
      }
    } catch (err) {
      this.deps.showError(describeError(err));
    }
  }

  async sendConnectionState(): Promise<void> {
    if (!this.remoteInfo) {
      try {
        this.remoteInfo = await this.deps.resolveRemote();
      } catch {
        // No Bitbucket remote found yet; connection state is still reportable without workspace/repo.
      }
    }
    const state = await this.deps.getConnectionState(this.remoteInfo?.workspace, this.remoteInfo?.repoSlug);
    this.deps.post({ type: "connectionState", state });
  }

  /** Forgets the currently resolved repository, re-prompts if multiple candidates exist, and reloads. */
  async switchRepository(): Promise<void> {
    await this.deps.forgetRemote();
    this.remoteInfo = undefined;
    this.bitbucketClient = undefined;
    this.detailCache.clear();
    this.reviewCache.clear();
    this.draftSummaryCache.clear();
    await this.sendConnectionState();
    await this.refreshPullRequests();
  }

  async refreshPullRequests(): Promise<void> {
    this.deps.post({ type: "pullRequestList", pullRequests: [], loading: true });
    try {
      const client = await this.getClient();
      const pullRequests = await client.listPullRequests("OPEN");
      this.deps.post({ type: "pullRequestList", pullRequests, loading: false });
    } catch (err) {
      this.deps.post({ type: "pullRequestList", pullRequests: [], loading: false });
      this.deps.showError(describeError(err));
    }
  }

  async loadPullRequestDetail(prId: number): Promise<void> {
    this.deps.post({ type: "reviewStatus", prId, status: "loading-detail" });
    try {
      const client = await this.getClient();
      const cached = this.detailCache.get(prId);
      const detail = cached ?? (await client.getPullRequestDetail(prId));
      this.detailCache.set(prId, detail);
      this.deps.post({ type: "pullRequestDetail", prId, detail });

      const cachedReview = this.reviewCache.get(prId);
      if (cachedReview) {
        this.deps.post({ type: "reviewResult", prId, result: this.withDraftSummary(prId, cachedReview) });
        this.deps.post({ type: "reviewStatus", prId, status: "review-ready" });
      } else {
        this.deps.post({ type: "reviewStatus", prId, status: "idle" });
      }
    } catch (err) {
      this.deps.post({ type: "reviewStatus", prId, status: "error", error: describeError(err) });
    }
  }

  async runReview(prId: number, forceRegenerate: boolean): Promise<void> {
    if (!forceRegenerate && this.reviewCache.has(prId)) {
      const result = this.withDraftSummary(prId, this.reviewCache.get(prId)!);
      this.deps.post({ type: "reviewResult", prId, result });
      this.deps.post({ type: "reviewStatus", prId, status: "review-ready" });
      return;
    }

    this.deps.post({ type: "reviewStatus", prId, status: "reviewing" });
    try {
      const client = await this.getClient();
      const detail = this.detailCache.get(prId) ?? (await client.getPullRequestDetail(prId));
      this.detailCache.set(prId, detail);

      const apiKey = await this.deps.ensureOpenAiApiKey();
      const { model, maxDiffBytes } = this.deps.getReviewConfig();

      const reviewService = new ReviewService(client, this.deps.createOpenAiClient(apiKey), model, maxDiffBytes);
      const result = await reviewService.reviewPullRequest(detail);

      this.reviewCache.set(prId, result);
      this.draftSummaryCache.delete(prId);
      this.deps.post({ type: "reviewResult", prId, result });
      this.deps.post({ type: "reviewStatus", prId, status: "review-ready" });
    } catch (err) {
      this.deps.post({ type: "reviewStatus", prId, status: "error", error: describeError(err) });
    }
  }

  async postSummary(prId: number): Promise<void> {
    const review = this.reviewCache.get(prId);
    if (!review) {
      this.deps.showError("Run an AI review before posting a summary.");
      return;
    }
    const markdown = this.draftSummaryCache.get(prId) ?? review.summaryMarkdown;

    const confirmed = await this.deps.confirmPost(prId);
    if (!confirmed) {
      return;
    }

    this.deps.post({ type: "reviewStatus", prId, status: "posting" });
    try {
      const client = await this.getClient();
      const { commentUrl } = await client.postSummaryComment(prId, markdown);
      this.deps.post({ type: "postSummaryResult", prId, success: true, commentUrl });
      this.deps.post({ type: "reviewStatus", prId, status: "posted" });
    } catch (err) {
      const message = describeError(err);
      this.deps.post({ type: "postSummaryResult", prId, success: false, error: message });
      this.deps.post({ type: "reviewStatus", prId, status: "error", error: message });
    }
  }

  async openFileDiff(prId: number, path: string): Promise<void> {
    this.deps.post({ type: "fileDiffOpenStatus", prId, path, status: "loading" });
    try {
      const client = await this.getClient();
      const detail = this.detailCache.get(prId) ?? (await client.getPullRequestDetail(prId));
      this.detailCache.set(prId, detail);

      const file = detail.changedFiles.find((f) => f.path === path);
      if (!file) {
        throw new Error(`File not found in PR #${prId}: ${path}`);
      }

      await this.deps.openFileDiff(client, prId, detail, file);
      this.deps.post({ type: "fileDiffOpenStatus", prId, path, status: "done" });
    } catch (err) {
      this.deps.post({ type: "fileDiffOpenStatus", prId, path, status: "error", error: describeError(err) });
    }
  }

  private async getClient(): Promise<BitbucketClient> {
    if (this.bitbucketClient) {
      return this.bitbucketClient;
    }
    if (!this.remoteInfo) {
      this.remoteInfo = await this.deps.resolveRemote();
    }
    this.bitbucketClient = this.deps.createBitbucketClient(this.remoteInfo);
    return this.bitbucketClient;
  }

  private sendSettings(): void {
    this.deps.post({ type: "settings", settings: this.deps.getSettings() });
  }

  private async sendIntegrations(): Promise<void> {
    const integrations = await this.deps.getIntegrations();
    this.deps.post({ type: "integrations", integrations });
  }

  private withDraftSummary(prId: number, review: ReviewResult): ReviewResult {
    const draft = this.draftSummaryCache.get(prId);
    return draft !== undefined ? { ...review, summaryMarkdown: draft } : review;
  }
}

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
