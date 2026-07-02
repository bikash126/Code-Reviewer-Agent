import { BitbucketClient } from "../bitbucket/client";
import { OpenAiClient } from "../openai/client";
import { ReviewService } from "../review/reviewService";
import {
  batchItemKey,
  BatchPullRequestItem,
  BatchReviewTarget,
  BitbucketRemoteInfo,
  ExtensionToWebviewMessage,
  PullRequestDetail,
  ReviewResult,
  WebviewToExtensionMessage,
} from "../types";

/**
 * Dependencies for cross-repo batch review, factored out for testability the same way
 * `ReviewerPanelDeps` is. Deliberately independent of `ReviewerPanelController` — batch
 * review operates over many repos at once, not the single "currently selected" repo.
 */
export interface BatchReviewDeps {
  /** All Bitbucket repos discovered in the current VS Code workspace. */
  listRepos: () => Promise<BitbucketRemoteInfo[]>;
  createBitbucketClient: (remote: BitbucketRemoteInfo) => BitbucketClient;
  ensureOpenAiApiKey: () => Promise<string>;
  createOpenAiClient: (apiKey: string) => OpenAiClient;
  getReviewConfig: () => { model: string; maxDiffBytes: number };
  /** Returns true if the user confirmed posting that specific PR's summary. */
  confirmPost: (target: BatchReviewTarget) => Promise<boolean>;
  showError: (message: string) => void;
  post: (message: ExtensionToWebviewMessage) => void;
}

/**
 * Owns the cross-repo batch review message flow: list PRs across every Bitbucket repo in
 * the workspace, generate AI reviews for a user-selected batch of them, and post each
 * summary individually (still gated behind its own confirmation — batching only speeds up
 * drafting, never bypasses the "human approves every post" rule).
 */
export class BatchReviewController {
  private readonly clients = new Map<string, BitbucketClient>();
  private readonly detailCache = new Map<string, PullRequestDetail>();
  private readonly reviewCache = new Map<string, ReviewResult>();
  private readonly draftSummaryCache = new Map<string, string>();

  constructor(private readonly deps: BatchReviewDeps) {}

  async handleMessage(message: WebviewToExtensionMessage): Promise<void> {
    try {
      switch (message.type) {
        case "getBatchRepos":
          await this.sendRepos();
          break;
        case "loadBatchPullRequests":
          await this.loadPullRequests(message.repos);
          break;
        case "runBatchReview":
          await this.runBatchReview(message.items);
          break;
        case "editBatchSummary":
          this.draftSummaryCache.set(
            batchItemKey(message.target.workspace, message.target.repoSlug, message.target.prId),
            message.summaryMarkdown,
          );
          break;
        case "postBatchSummary":
          await this.postSummary(message.target);
          break;
      }
    } catch (err) {
      this.deps.showError(describeError(err));
    }
  }

  private async sendRepos(): Promise<void> {
    try {
      const repos = await this.deps.listRepos();
      this.deps.post({ type: "batchRepos", repos });
    } catch (err) {
      this.deps.showError(describeError(err));
    }
  }

  async loadPullRequests(repos: BitbucketRemoteInfo[]): Promise<void> {
    this.deps.post({ type: "batchPullRequestList", items: [], loading: true });

    const settled = await Promise.allSettled(
      repos.map(async (remote): Promise<BatchPullRequestItem[]> => {
        const client = this.getClientFor(remote);
        const prs = await client.listPullRequests("OPEN");
        return prs.map((pr) => ({ ...pr, workspace: remote.workspace, repoSlug: remote.repoSlug }));
      }),
    );

    const items = settled.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
    const failures = settled.filter((result): result is PromiseRejectedResult => result.status === "rejected");
    if (failures.length > 0) {
      this.deps.showError(
        `Failed to load pull requests from ${failures.length} repo(s): ${failures
          .map((f) => describeError(f.reason))
          .join("; ")}`,
      );
    }

    this.deps.post({ type: "batchPullRequestList", items, loading: false });
  }

  async runBatchReview(items: BatchReviewTarget[]): Promise<void> {
    for (const target of items) {
      this.deps.post({ type: "batchReviewStatus", target, status: "queued" });
    }
    for (const target of items) {
      await this.reviewOne(target);
    }
  }

  private async reviewOne(target: BatchReviewTarget): Promise<void> {
    const key = batchItemKey(target.workspace, target.repoSlug, target.prId);
    this.deps.post({ type: "batchReviewStatus", target, status: "reviewing" });
    try {
      const client = this.getClientFor(target);
      const detail = this.detailCache.get(key) ?? (await client.getPullRequestDetail(target.prId));
      this.detailCache.set(key, detail);

      const apiKey = await this.deps.ensureOpenAiApiKey();
      const { model, maxDiffBytes } = this.deps.getReviewConfig();

      const reviewService = new ReviewService(client, this.deps.createOpenAiClient(apiKey), model, maxDiffBytes);
      const result = await reviewService.reviewPullRequest(detail);

      this.reviewCache.set(key, result);
      this.draftSummaryCache.delete(key);
      this.deps.post({ type: "batchReviewResult", target, result });
      this.deps.post({ type: "batchReviewStatus", target, status: "review-ready" });
    } catch (err) {
      this.deps.post({ type: "batchReviewStatus", target, status: "error", error: describeError(err) });
    }
  }

  async postSummary(target: BatchReviewTarget): Promise<void> {
    const key = batchItemKey(target.workspace, target.repoSlug, target.prId);
    const review = this.reviewCache.get(key);
    if (!review) {
      this.deps.showError("Run a review before posting a summary.");
      return;
    }
    const markdown = this.draftSummaryCache.get(key) ?? review.summaryMarkdown;

    const confirmed = await this.deps.confirmPost(target);
    if (!confirmed) {
      return;
    }

    this.deps.post({ type: "batchReviewStatus", target, status: "posting" });
    try {
      const client = this.getClientFor(target);
      const { commentUrl } = await client.postSummaryComment(target.prId, markdown);
      this.deps.post({ type: "batchPostResult", target, success: true, commentUrl });
      this.deps.post({ type: "batchReviewStatus", target, status: "posted" });
    } catch (err) {
      const message = describeError(err);
      this.deps.post({ type: "batchPostResult", target, success: false, error: message });
      this.deps.post({ type: "batchReviewStatus", target, status: "error", error: message });
    }
  }

  private getClientFor(remote: BitbucketRemoteInfo): BitbucketClient {
    const key = `${remote.workspace}/${remote.repoSlug}`;
    let client = this.clients.get(key);
    if (!client) {
      client = this.deps.createBitbucketClient(remote);
      this.clients.set(key, client);
    }
    return client;
  }
}

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
