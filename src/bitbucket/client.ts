import { BbDiffStatEntry, BbErrorBody, BbPaginated, BbPullRequest } from "./apiTypes";
import { ChangedFile, PullRequestDetail, PullRequestSummary } from "../types";

const API_BASE = "https://api.bitbucket.org/2.0";

export class BitbucketApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly bodySnippet?: string,
  ) {
    super(message);
    this.name = "BitbucketApiError";
  }
}

export type FetchLike = typeof fetch;

export interface BitbucketClientOptions {
  workspace: string;
  repoSlug: string;
  getAuthHeader: () => Promise<string>;
  fetchFn?: FetchLike;
}

export class BitbucketClient {
  private readonly workspace: string;
  private readonly repoSlug: string;
  private readonly getAuthHeader: () => Promise<string>;
  private readonly fetchFn: FetchLike;

  constructor(options: BitbucketClientOptions) {
    this.workspace = options.workspace;
    this.repoSlug = options.repoSlug;
    this.getAuthHeader = options.getAuthHeader;
    this.fetchFn = options.fetchFn ?? fetch;
  }

  async listPullRequests(state: "OPEN" | "MERGED" | "DECLINED" | "SUPERSEDED" = "OPEN"): Promise<PullRequestSummary[]> {
    const initialUrl = `${API_BASE}/repositories/${this.workspace}/${this.repoSlug}/pullrequests?state=${state}&pagelen=50&sort=-created_on`;
    const raw = await this.getAllPages<BbPullRequest>(initialUrl);
    return raw.map(mapPullRequestSummary);
  }

  async getPullRequestDetail(prId: number): Promise<PullRequestDetail> {
    const [pr, changedFiles] = await Promise.all([
      this.request<BbPullRequest>(`${API_BASE}/repositories/${this.workspace}/${this.repoSlug}/pullrequests/${prId}`),
      this.getChangedFiles(prId),
    ]);

    return {
      ...mapPullRequestSummary(pr),
      description: pr.description ?? "",
      changedFiles,
      reviewers: (pr.participants ?? [])
        .filter((p) => p.role === "REVIEWER")
        .map((p) => ({ displayName: p.user.display_name, approved: p.approved })),
      sourceCommitHash: pr.source.commit?.hash ?? "",
      destinationCommitHash: pr.destination.commit?.hash ?? "",
    };
  }

  async getChangedFiles(prId: number): Promise<ChangedFile[]> {
    const url = `${API_BASE}/repositories/${this.workspace}/${this.repoSlug}/pullrequests/${prId}/diffstat?pagelen=100`;
    const entries = await this.getAllPages<BbDiffStatEntry>(url);
    return entries.map((entry) => ({
      path: entry.new?.path ?? entry.old?.path ?? "",
      status: entry.status,
      linesAdded: entry.lines_added,
      linesRemoved: entry.lines_removed,
      oldPath: entry.status === "renamed" ? entry.old?.path : undefined,
    }));
  }

  async getDiff(prId: number, maxBytes: number): Promise<{ diff: string; truncated: boolean }> {
    const url = `${API_BASE}/repositories/${this.workspace}/${this.repoSlug}/pullrequests/${prId}/diff`;
    const authHeader = await this.getAuthHeader();
    const response = await this.fetchFn(url, { headers: { Authorization: authHeader } });
    if (!response.ok) {
      await this.throwNormalizedError(response);
    }
    const fullDiff = await response.text();
    if (fullDiff.length <= maxBytes) {
      return { diff: fullDiff, truncated: false };
    }
    return { diff: fullDiff.slice(0, maxBytes), truncated: true };
  }

  /**
   * Fetches a file's raw content at a specific commit, for building a before/after
   * comparison in a native diff editor. Returns `undefined` if the file doesn't exist
   * at that commit (e.g. the file was added or removed by the PR).
   */
  async getFileContent(commitHash: string, path: string): Promise<string | undefined> {
    const encodedPath = path.split("/").map(encodeURIComponent).join("/");
    const url = `${API_BASE}/repositories/${this.workspace}/${this.repoSlug}/src/${commitHash}/${encodedPath}`;
    const authHeader = await this.getAuthHeader();
    const response = await this.fetchFn(url, { headers: { Authorization: authHeader } });
    if (response.status === 404) {
      return undefined;
    }
    if (!response.ok) {
      await this.throwNormalizedError(response);
    }
    return response.text();
  }

  async postSummaryComment(prId: number, markdown: string): Promise<{ commentUrl?: string }> {
    return this.postComment(prId, markdown);
  }

  /**
   * Posts an inline (per-line) PR comment. `side: "new"` attaches it to a line in the PR's
   * source content (Bitbucket's `to`); `side: "old"` attaches it to a line in the destination
   * (base) content (Bitbucket's `from`) — matching which half of the diff editor the comment
   * was authored against.
   */
  async postInlineComment(
    prId: number,
    path: string,
    line: number,
    side: "old" | "new",
    markdown: string,
  ): Promise<{ commentUrl?: string }> {
    const inline = side === "new" ? { path, to: line } : { path, from: line };
    return this.postComment(prId, markdown, inline);
  }

  private async postComment(
    prId: number,
    markdown: string,
    inline?: { path: string; to?: number; from?: number },
  ): Promise<{ commentUrl?: string }> {
    const url = `${API_BASE}/repositories/${this.workspace}/${this.repoSlug}/pullrequests/${prId}/comments`;
    const authHeader = await this.getAuthHeader();
    const response = await this.fetchFn(url, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(inline ? { content: { raw: markdown }, inline } : { content: { raw: markdown } }),
    });
    if (!response.ok) {
      await this.throwNormalizedError(response);
    }
    const body = (await response.json().catch(() => undefined)) as { links?: { html?: { href: string } } } | undefined;
    return { commentUrl: body?.links?.html?.href };
  }

  private async getAllPages<T>(initialUrl: string): Promise<T[]> {
    const results: T[] = [];
    let url: string | undefined = initialUrl;
    while (url) {
      const page: BbPaginated<T> = await this.request<BbPaginated<T>>(url);
      results.push(...page.values);
      url = page.next;
    }
    return results;
  }

  private async request<T>(url: string): Promise<T> {
    const authHeader = await this.getAuthHeader();
    const response = await this.fetchFn(url, { headers: { Authorization: authHeader } });
    if (!response.ok) {
      await this.throwNormalizedError(response);
    }
    return (await response.json()) as T;
  }

  private async throwNormalizedError(response: Response): Promise<never> {
    let message = `Bitbucket API request failed with status ${response.status}`;
    let snippet: string | undefined;
    try {
      const text = await response.text();
      snippet = text.slice(0, 500);
      const body = JSON.parse(text) as BbErrorBody;
      if (body.error?.message) {
        message = body.error.message;
      }
    } catch {
      // Body wasn't JSON (or was empty) — keep the generic message.
    }
    throw new BitbucketApiError(message, response.status, snippet);
  }
}

function mapPullRequestSummary(pr: BbPullRequest): PullRequestSummary {
  return {
    id: pr.id,
    title: pr.title,
    state: pr.state,
    author: {
      displayName: pr.author.display_name,
      accountId: pr.author.account_id,
      avatarUrl: pr.author.links?.avatar?.href,
    },
    sourceBranch: pr.source.branch.name,
    destinationBranch: pr.destination.branch.name,
    createdOn: pr.created_on,
    updatedOn: pr.updated_on,
    commentCount: pr.comment_count ?? 0,
    taskCount: pr.task_count ?? 0,
    webUrl: pr.links.html.href,
  };
}
