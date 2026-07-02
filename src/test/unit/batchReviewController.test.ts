import { describe, expect, it, vi } from "vitest";
import { BitbucketClient, FetchLike as BbFetchLike } from "../../bitbucket/client";
import { OpenAiClient, FetchLike as OaFetchLike } from "../../openai/client";
import { BatchReviewController, BatchReviewDeps } from "../../panel/batchReviewController";
import { BatchReviewTarget, BitbucketRemoteInfo, ExtensionToWebviewMessage } from "../../types";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function makePrJson(id: number) {
  return {
    id,
    title: `PR ${id}`,
    state: "OPEN",
    author: { display_name: "Alice" },
    source: { branch: { name: "feature" }, commit: { hash: "src-hash" } },
    destination: { branch: { name: "main" }, commit: { hash: "dst-hash" } },
    created_on: "2026-01-01T00:00:00Z",
    updated_on: "2026-01-02T00:00:00Z",
    comment_count: 0,
    task_count: 0,
    participants: [],
    links: { html: { href: `https://bitbucket.org/ws/repo/pull-requests/${id}` } },
  };
}

function reviewJsonBody(summary: string) {
  return JSON.stringify({
    summaryMarkdown: summary,
    riskLevel: "low",
    keyChanges: [],
    potentialIssues: [],
    testSuggestions: [],
  });
}

function setupHarness(repos: BitbucketRemoteInfo[] = []) {
  const posted: ExtensionToWebviewMessage[] = [];
  const fetchByRepo = new Map<string, ReturnType<typeof vi.fn<Parameters<BbFetchLike>, ReturnType<BbFetchLike>>>>();
  const oaFetch = vi.fn<Parameters<OaFetchLike>, ReturnType<OaFetchLike>>();
  const confirmPost = vi.fn<Parameters<BatchReviewDeps["confirmPost"]>, ReturnType<BatchReviewDeps["confirmPost"]>>(
    async () => true,
  );

  function fetchFor(remote: BitbucketRemoteInfo) {
    const key = `${remote.workspace}/${remote.repoSlug}`;
    let fn = fetchByRepo.get(key);
    if (!fn) {
      fn = vi.fn<Parameters<BbFetchLike>, ReturnType<BbFetchLike>>();
      fetchByRepo.set(key, fn);
    }
    return fn;
  }

  const deps: BatchReviewDeps = {
    listRepos: async () => repos,
    createBitbucketClient: (remote) =>
      new BitbucketClient({
        workspace: remote.workspace,
        repoSlug: remote.repoSlug,
        getAuthHeader: async () => "Bearer t",
        fetchFn: fetchFor(remote),
      }),
    ensureOpenAiApiKey: async () => "sk-test",
    createOpenAiClient: (apiKey) => new OpenAiClient(apiKey, oaFetch),
    getReviewConfig: () => ({ model: "gpt-5", maxDiffBytes: 200000 }),
    confirmPost,
    showError: vi.fn(),
    post: (message) => posted.push(message),
  };

  const controller = new BatchReviewController(deps);
  return { controller, posted, fetchByRepo, fetchFor, oaFetch, deps };
}

describe("BatchReviewController", () => {
  it("getBatchRepos posts the discovered repos", async () => {
    const repos: BitbucketRemoteInfo[] = [
      { workspace: "acme", repoSlug: "api" },
      { workspace: "acme", repoSlug: "web" },
    ];
    const { controller, posted } = setupHarness(repos);

    await controller.handleMessage({ type: "getBatchRepos" });

    expect(posted).toContainEqual({ type: "batchRepos", repos });
  });

  it("loadBatchPullRequests aggregates PRs from multiple repos and tags each with its repo", async () => {
    const repoA: BitbucketRemoteInfo = { workspace: "acme", repoSlug: "api" };
    const repoB: BitbucketRemoteInfo = { workspace: "acme", repoSlug: "web" };
    const { controller, posted, fetchFor } = setupHarness([repoA, repoB]);

    fetchFor(repoA).mockResolvedValue(jsonResponse({ values: [makePrJson(1)], next: undefined }));
    fetchFor(repoB).mockResolvedValue(jsonResponse({ values: [makePrJson(9)], next: undefined }));

    await controller.loadPullRequests([repoA, repoB]);

    const finalMsg = posted.filter((m) => m.type === "batchPullRequestList").at(-1);
    expect(finalMsg).toMatchObject({
      type: "batchPullRequestList",
      loading: false,
      items: expect.arrayContaining([
        expect.objectContaining({ id: 1, workspace: "acme", repoSlug: "api" }),
        expect.objectContaining({ id: 9, workspace: "acme", repoSlug: "web" }),
      ]),
    });
  });

  it("loadBatchPullRequests still returns results from repos that succeeded when another repo fails", async () => {
    const repoA: BitbucketRemoteInfo = { workspace: "acme", repoSlug: "api" };
    const repoB: BitbucketRemoteInfo = { workspace: "acme", repoSlug: "broken" };
    const { controller, posted, fetchFor, deps } = setupHarness([repoA, repoB]);

    fetchFor(repoA).mockResolvedValue(jsonResponse({ values: [makePrJson(1)], next: undefined }));
    fetchFor(repoB).mockResolvedValue(jsonResponse({ error: { message: "Repository access denied" } }, 403));

    await controller.loadPullRequests([repoA, repoB]);

    const finalMsg = posted.filter((m) => m.type === "batchPullRequestList").at(-1);
    expect(finalMsg).toMatchObject({ items: [expect.objectContaining({ id: 1, repoSlug: "api" })] });
    expect(deps.showError).toHaveBeenCalledWith(expect.stringContaining("1 repo(s)"));
  });

  it("runBatchReview marks every item queued up front, then reviews sequentially", async () => {
    const repo: BitbucketRemoteInfo = { workspace: "acme", repoSlug: "api" };
    const { controller, posted, fetchFor, oaFetch } = setupHarness([repo]);

    fetchFor(repo).mockImplementation(async (url) => {
      const u = String(url);
      if (u.endsWith("/pullrequests/1")) return jsonResponse(makePrJson(1));
      if (u.endsWith("/pullrequests/2")) return jsonResponse(makePrJson(2));
      if (u.includes("/diffstat")) return jsonResponse({ values: [], next: undefined });
      if (u.endsWith("/diff")) return new Response("diff", { status: 200 });
      throw new Error(`Unexpected URL ${u}`);
    });
    oaFetch.mockImplementation(async () => jsonResponse({ output_text: reviewJsonBody("Looks good") }));

    const targets: BatchReviewTarget[] = [
      { workspace: "acme", repoSlug: "api", prId: 1 },
      { workspace: "acme", repoSlug: "api", prId: 2 },
    ];
    await controller.handleMessage({ type: "runBatchReview", items: targets });

    const statusMsgs = posted.filter((m) => m.type === "batchReviewStatus");
    // Both should have been queued before either finished reviewing.
    expect(statusMsgs[0]).toMatchObject({ target: targets[0], status: "queued" });
    expect(statusMsgs[1]).toMatchObject({ target: targets[1], status: "queued" });

    const resultMsgs = posted.filter((m) => m.type === "batchReviewResult");
    expect(resultMsgs).toHaveLength(2);
    expect(resultMsgs[0]).toMatchObject({ target: targets[0], result: { summaryMarkdown: "Looks good" } });
    expect(resultMsgs[1]).toMatchObject({ target: targets[1], result: { summaryMarkdown: "Looks good" } });

    const readyMsgs = statusMsgs.filter((m) => m.status === "review-ready");
    expect(readyMsgs).toHaveLength(2);
  });

  it("runBatchReview isolates failures: one PR erroring doesn't stop the others", async () => {
    const repo: BitbucketRemoteInfo = { workspace: "acme", repoSlug: "api" };
    const { controller, posted, fetchFor, oaFetch } = setupHarness([repo]);

    fetchFor(repo).mockImplementation(async (url) => {
      const u = String(url);
      if (u.endsWith("/pullrequests/1")) return jsonResponse({ error: { message: "PR not found" } }, 404);
      if (u.endsWith("/pullrequests/2")) return jsonResponse(makePrJson(2));
      if (u.includes("/diffstat")) return jsonResponse({ values: [], next: undefined });
      if (u.endsWith("/diff")) return new Response("diff", { status: 200 });
      throw new Error(`Unexpected URL ${u}`);
    });
    oaFetch.mockResolvedValue(jsonResponse({ output_text: reviewJsonBody("Looks good") }));

    await controller.runBatchReview([
      { workspace: "acme", repoSlug: "api", prId: 1 },
      { workspace: "acme", repoSlug: "api", prId: 2 },
    ]);

    const statusMsgs = posted.filter((m) => m.type === "batchReviewStatus");
    expect(statusMsgs).toContainEqual({
      type: "batchReviewStatus",
      target: { workspace: "acme", repoSlug: "api", prId: 1 },
      status: "error",
      error: "PR not found",
    });
    expect(statusMsgs).toContainEqual({
      type: "batchReviewStatus",
      target: { workspace: "acme", repoSlug: "api", prId: 2 },
      status: "review-ready",
    });
  });

  it("postBatchSummary requires a prior review", async () => {
    const { controller, deps } = setupHarness([]);
    await controller.postSummary({ workspace: "acme", repoSlug: "api", prId: 1 });
    expect(deps.showError).toHaveBeenCalledWith("Run a review before posting a summary.");
  });

  it("postBatchSummary posts the edited draft to the correct repo and skips when the user cancels", async () => {
    const repo: BitbucketRemoteInfo = { workspace: "acme", repoSlug: "api" };
    const { controller, posted, fetchFor, oaFetch, deps } = setupHarness([repo]);
    const target: BatchReviewTarget = { workspace: "acme", repoSlug: "api", prId: 1 };

    fetchFor(repo).mockImplementation(async (url) => {
      const u = String(url);
      if (u.endsWith("/pullrequests/1")) return jsonResponse(makePrJson(1));
      if (u.includes("/diffstat")) return jsonResponse({ values: [], next: undefined });
      if (u.endsWith("/diff")) return new Response("diff", { status: 200 });
      if (u.includes("/comments")) return jsonResponse({ links: { html: { href: "https://bitbucket.org/comment/1" } } });
      throw new Error(`Unexpected URL ${u}`);
    });
    oaFetch.mockResolvedValue(jsonResponse({ output_text: reviewJsonBody("Original summary") }));

    await controller.runBatchReview([target]);
    await controller.handleMessage({ type: "editBatchSummary", target, summaryMarkdown: "Edited summary" });

    (deps.confirmPost as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);
    await controller.postSummary(target);
    expect(posted.find((m) => m.type === "batchPostResult")).toBeUndefined();

    (deps.confirmPost as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);
    await controller.postSummary(target);

    const commentCall = fetchFor(repo).mock.calls.find(([url]) => String(url).includes("/comments"));
    expect(commentCall).toBeDefined();
    const body = JSON.parse((commentCall![1] as RequestInit).body as string);
    expect(body).toEqual({ content: { raw: "Edited summary" } });
    expect(posted).toContainEqual({
      type: "batchPostResult",
      target,
      success: true,
      commentUrl: "https://bitbucket.org/comment/1",
    });
  });
});
