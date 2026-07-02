import { describe, expect, it, vi } from "vitest";
import { BitbucketClient, FetchLike as BbFetchLike } from "../../bitbucket/client";
import { OpenAiClient, FetchLike as OaFetchLike } from "../../openai/client";
import { ReviewerPanelController, ReviewerPanelDeps } from "../../panel/reviewerPanelController";
import { BUILT_IN_RULES, ConnectionState, ExtensionToWebviewMessage, IntegrationsState, ReviewSettings } from "../../types";

function defaultIntegrationsState(): IntegrationsState {
  return {
    claude: { configured: false },
    gemini: { configured: false },
    openai: { configured: false },
    bitbucket: { configured: false },
    github: { configured: false },
    gitlab: { configured: false, instanceUrl: "https://gitlab.com" },
    jira: { configured: false, siteUrl: "", email: "" },
  };
}

function defaultReviewSettings(): ReviewSettings {
  return {
    commentFormat: { showSeverity: true, showCategory: true, showFooter: true, template: "default-template" },
    reviewPrompt: "",
    enhancedSecurityScan: false,
    reviewPasses: { security: true, bugs: true, performance: true, style: true },
    passPrompts: { security: "sec-default", bugs: "bugs-default", performance: "perf-default", style: "style-default" },
    codeQuality: { customPrompt: "" },
    excludedFiles: { customPatterns: "" },
    fileRules: { alwaysReview: "", treatAsTrivial: "" },
    builtInRules: Object.fromEntries(BUILT_IN_RULES.map((r) => [r.id, true])) as ReviewSettings["builtInRules"],
  };
}

function getByPath(obj: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, part) => (acc as Record<string, unknown>)?.[part], obj);
}

function setByPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split(".");
  const last = parts.pop()!;
  const target = parts.reduce<Record<string, unknown>>((acc, part) => acc[part] as Record<string, unknown>, obj);
  target[last] = value;
}

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
    comment_count: 1,
    task_count: 0,
    participants: [{ role: "REVIEWER", approved: true, user: { display_name: "Bob" } }],
    links: { html: { href: `https://bitbucket.org/ws/repo/pull-requests/${id}` } },
  };
}

/**
 * Drives the full webview <-> extension message protocol (the same
 * ReviewerPanelController the real WebviewPanel uses) against a fake Bitbucket
 * API and a fake OpenAI Responses API, asserting on the sequence of messages
 * that would be posted back to the webview.
 */
function setupHarness() {
  const posted: ExtensionToWebviewMessage[] = [];
  const bbFetch = vi.fn<Parameters<BbFetchLike>, ReturnType<BbFetchLike>>();
  const oaFetch = vi.fn<Parameters<OaFetchLike>, ReturnType<OaFetchLike>>();
  let connected = false;

  const connectionState: ConnectionState = {
    connected: false,
  };

  // Simulates a workspace with two Bitbucket repos. `resolveRemote({ forcePrompt: true })` switches to the other repo.
  const repoCandidates = [
    { workspace: "my-workspace", repoSlug: "my-repo" },
    { workspace: "my-workspace", repoSlug: "other-repo" },
  ];
  let repoIndex = 0;
  const forgetRemote = vi.fn(async () => {});
  const resolveRemote = vi.fn(async (options?: { forcePrompt?: boolean }) => {
    if (options?.forcePrompt) {
      repoIndex = (repoIndex + 1) % repoCandidates.length;
    }
    return repoCandidates[repoIndex];
  });

  const defaults = defaultReviewSettings();
  const settings = defaultReviewSettings();
  const integrations = defaultIntegrationsState();

  const deps: ReviewerPanelDeps = {
    resolveRemote,
    forgetRemote,
    getConnectionState: async (workspace, repoSlug) =>
      connected
        ? { connected: true, authMethod: "apiToken", accountLabel: "dev@example.com", workspace, repoSlug }
        : { connected: false },
    connectAuth: async () => {
      connected = true;
    },
    signOutAuth: async () => {
      connected = false;
    },
    createBitbucketClient: (remote) =>
      new BitbucketClient({ workspace: remote.workspace, repoSlug: remote.repoSlug, getAuthHeader: async () => "Bearer t", fetchFn: bbFetch }),
    ensureOpenAiApiKey: async () => "sk-test",
    createOpenAiClient: (apiKey) => new OpenAiClient(apiKey, oaFetch),
    getReviewConfig: () => ({ model: "gpt-5", maxDiffBytes: 200000 }),
    confirmPost: async () => true,
    showError: vi.fn(),
    post: (message) => posted.push(message),
    getSettings: () => settings,
    updateSetting: async (key, value) => {
      setByPath(settings as unknown as Record<string, unknown>, key, value);
    },
    resetSetting: async (key) => {
      setByPath(settings as unknown as Record<string, unknown>, key, getByPath(defaults as unknown as Record<string, unknown>, key));
    },
    getIntegrations: async () => integrations,
    saveAiProviderKey: async (provider, apiKey) => {
      integrations[provider].configured = apiKey.trim().length > 0;
    },
    saveGithubToken: async (token) => {
      integrations.github.configured = token.trim().length > 0;
    },
    saveGitlabCredentials: async (token, instanceUrl) => {
      integrations.gitlab = { configured: token.trim().length > 0, instanceUrl: instanceUrl.trim() || "https://gitlab.com" };
    },
    saveJiraCredentials: async (siteUrl, email, apiToken) => {
      integrations.jira = { configured: apiToken.trim().length > 0, siteUrl, email };
    },
    openFileDiff: vi.fn(async () => {}),
  };

  const controller = new ReviewerPanelController(deps);
  return { controller, posted, bbFetch, oaFetch, deps, connectionStateRef: connectionState, integrations, resolveRemote };
}

describe("ReviewerPanelController message flow", () => {
  it("reports disconnected state and does not list PRs before connecting", async () => {
    const { controller, posted } = setupHarness();

    await controller.handleMessage({ type: "ready" });

    expect(posted[0]).toEqual({ type: "connectionState", state: { connected: false } });
  });

  it("connects, lists pull requests, loads detail, runs a review, edits, then posts the summary", async () => {
    const { controller, posted, bbFetch, oaFetch } = setupHarness();

    bbFetch.mockImplementation(async (url) => {
      const u = String(url);
      if (u.includes("/pullrequests?")) {
        return jsonResponse({ values: [makePrJson(1)], next: undefined });
      }
      if (u.endsWith("/pullrequests/1")) {
        return jsonResponse(makePrJson(1));
      }
      if (u.includes("/diffstat")) {
        return jsonResponse({ values: [], next: undefined });
      }
      if (u.endsWith("/pullrequests/1/diff")) {
        return new Response("diff --git a/x b/x\n+added line", { status: 200 });
      }
      if (u.includes("/comments")) {
        return jsonResponse({ links: { html: { href: "https://bitbucket.org/ws/repo/pull-requests/1/comment/9" } } });
      }
      throw new Error(`Unexpected Bitbucket URL: ${u}`);
    });

    oaFetch.mockResolvedValue(
      jsonResponse({
        output_text: JSON.stringify({
          summaryMarkdown: "## Summary\nInitial AI summary.",
          riskLevel: "low",
          keyChanges: ["Added a line"],
          potentialIssues: [],
          testSuggestions: ["Check the new line renders"],
        }),
      }),
    );

    // 1. connect
    await controller.handleMessage({ type: "connect" });
    expect(posted.find((m) => m.type === "connectionState")).toMatchObject({
      type: "connectionState",
      state: { connected: true },
    });

    // 2. PR list should have been fetched as part of connect
    const listMessages = posted.filter((m) => m.type === "pullRequestList");
    expect(listMessages.at(-1)).toMatchObject({ type: "pullRequestList", loading: false, pullRequests: [{ id: 1 }] });

    // 3. select PR -> loads detail
    posted.length = 0;
    await controller.handleMessage({ type: "selectPullRequest", prId: 1 });
    const detailMsg = posted.find((m) => m.type === "pullRequestDetail");
    expect(detailMsg).toMatchObject({ type: "pullRequestDetail", prId: 1, detail: { title: "PR 1" } });
    expect(posted.filter((m) => m.type === "reviewStatus").at(-1)).toMatchObject({ status: "idle" });

    // 4. run AI review
    posted.length = 0;
    await controller.handleMessage({ type: "runReview", prId: 1 });
    const reviewMsg = posted.find((m) => m.type === "reviewResult");
    expect(reviewMsg).toMatchObject({
      type: "reviewResult",
      prId: 1,
      result: { riskLevel: "low", summaryMarkdown: "## Summary\nInitial AI summary." },
    });
    expect(posted.filter((m) => m.type === "reviewStatus").at(-1)).toMatchObject({ status: "review-ready" });

    // 5. edit the summary
    posted.length = 0;
    await controller.handleMessage({ type: "editSummary", prId: 1, summaryMarkdown: "## Summary\nEdited by human." });
    expect(posted).toEqual([]); // editSummary doesn't post back to the webview by itself

    // 6. post the (edited) summary
    posted.length = 0;
    await controller.handleMessage({ type: "postSummary", prId: 1 });
    expect(posted).toContainEqual({
      type: "postSummaryResult",
      prId: 1,
      success: true,
      commentUrl: "https://bitbucket.org/ws/repo/pull-requests/1/comment/9",
    });
    expect(posted).toContainEqual({ type: "reviewStatus", prId: 1, status: "posted" });

    const commentCall = bbFetch.mock.calls.find(([url]) => String(url).includes("/comments"));
    expect(commentCall).toBeDefined();
    const body = JSON.parse((commentCall![1] as RequestInit).body as string);
    expect(body).toEqual({ content: { raw: "## Summary\nEdited by human." } });
  });

  it("regenerating a review re-runs OpenAI even if a cached result exists", async () => {
    const { controller, posted, bbFetch, oaFetch } = setupHarness();
    bbFetch.mockImplementation(async (url) => {
      const u = String(url);
      if (u.includes("/pullrequests/1/diffstat")) return jsonResponse({ values: [], next: undefined });
      if (u.endsWith("/pullrequests/1")) return jsonResponse(makePrJson(1));
      if (u.endsWith("/pullrequests/1/diff")) return new Response("diff", { status: 200 });
      throw new Error(`Unexpected URL ${u}`);
    });
    let call = 0;
    oaFetch.mockImplementation(async () => {
      call += 1;
      return jsonResponse({
        output_text: JSON.stringify({
          summaryMarkdown: `Summary v${call}`,
          riskLevel: "low",
          keyChanges: [],
          potentialIssues: [],
          testSuggestions: [],
        }),
      });
    });

    await controller.runReview(1, false);
    await controller.runReview(1, false); // cached, should not call OpenAI again
    expect(oaFetch).toHaveBeenCalledTimes(1);

    await controller.runReview(1, true); // forced regenerate
    expect(oaFetch).toHaveBeenCalledTimes(2);

    const lastResult = posted.filter((m) => m.type === "reviewResult").at(-1);
    expect(lastResult).toMatchObject({ result: { summaryMarkdown: "Summary v2" } });
  });

  it("surfaces an error and does not post when posting a summary before any review has run", async () => {
    const { controller, deps } = setupHarness();
    await controller.postSummary(1);
    expect(deps.showError).toHaveBeenCalledWith("Run an AI review before posting a summary.");
  });

  it("does not post the summary if the user cancels the confirmation dialog", async () => {
    const { controller, posted, bbFetch, oaFetch, deps } = setupHarness();
    (deps.confirmPost as unknown as () => Promise<boolean>) = async () => false;
    bbFetch.mockImplementation(async (url) => {
      const u = String(url);
      if (u.includes("diffstat")) return jsonResponse({ values: [], next: undefined });
      if (u.endsWith("/pullrequests/1")) return jsonResponse(makePrJson(1));
      if (u.endsWith("/diff")) return new Response("diff", { status: 200 });
      throw new Error(`Unexpected URL ${u}`);
    });
    oaFetch.mockResolvedValue(
      jsonResponse({
        output_text: JSON.stringify({
          summaryMarkdown: "s",
          riskLevel: "low",
          keyChanges: [],
          potentialIssues: [],
          testSuggestions: [],
        }),
      }),
    );

    await controller.runReview(1, false);
    posted.length = 0;
    await controller.postSummary(1);

    expect(posted.find((m) => m.type === "postSummaryResult")).toBeUndefined();
    expect(bbFetch.mock.calls.some(([url]) => String(url).includes("/comments"))).toBe(false);
  });

  it("switching repository prompts for repository and reloads the new repo's PR list", async () => {
    const { controller, posted, bbFetch, resolveRemote } = setupHarness();
    bbFetch.mockImplementation(async (url) => {
      const u = String(url);
      if (u.includes("my-repo/pullrequests?")) return jsonResponse({ values: [makePrJson(1)], next: undefined });
      if (u.includes("other-repo/pullrequests?")) return jsonResponse({ values: [makePrJson(2)], next: undefined });
      throw new Error(`Unexpected URL ${u}`);
    });

    await controller.handleMessage({ type: "connect" });
    expect(posted.filter((m) => m.type === "pullRequestList").at(-1)).toMatchObject({
      pullRequests: [{ id: 1 }],
    });

    posted.length = 0;
    await controller.handleMessage({ type: "switchRepository" });

    expect(posted.find((m) => m.type === "connectionState")).toMatchObject({
      state: { connected: true, repoSlug: "other-repo" },
    });
    expect(posted.filter((m) => m.type === "pullRequestList").at(-1)).toMatchObject({
      pullRequests: [{ id: 2 }],
    });

    const lastResolveCall = resolveRemote.mock.calls.at(-1);
    expect(lastResolveCall?.[0]).toEqual({ forcePrompt: true });
  });

  it("sends a settings snapshot on ready", async () => {
    const { controller, posted } = setupHarness();
    await controller.handleMessage({ type: "ready" });

    const settingsMsg = posted.find((m) => m.type === "settings");
    expect(settingsMsg).toMatchObject({ type: "settings", settings: { enhancedSecurityScan: false } });
  });

  it("updateSetting persists the value and echoes back a fresh settings snapshot", async () => {
    const { controller, posted, deps } = setupHarness();

    await controller.handleMessage({ type: "updateSetting", key: "commentFormat.showSeverity", value: false });

    expect(deps.getSettings().commentFormat.showSeverity).toBe(false);
    const settingsMsg = posted.find((m) => m.type === "settings");
    expect(settingsMsg).toMatchObject({ settings: { commentFormat: { showSeverity: false } } });
  });

  it("resetSetting reverts a field to its default and echoes back a fresh settings snapshot", async () => {
    const { controller, posted, deps } = setupHarness();
    await controller.handleMessage({ type: "updateSetting", key: "passPrompts.security", value: "custom" });

    posted.length = 0;
    await controller.handleMessage({ type: "resetSetting", key: "passPrompts.security" });

    expect(deps.getSettings().passPrompts.security).toBe("sec-default");
    const settingsMsg = posted.find((m) => m.type === "settings");
    expect(settingsMsg).toMatchObject({ settings: { passPrompts: { security: "sec-default" } } });
  });

  it("toggling a built-in rule is reflected in the settings snapshot", async () => {
    const { controller, posted, deps } = setupHarness();

    await controller.handleMessage({ type: "updateSetting", key: "builtInRules.lockFiles", value: false });

    expect(deps.getSettings().builtInRules.lockFiles).toBe(false);
    const settingsMsg = posted.find((m) => m.type === "settings");
    expect(settingsMsg).toMatchObject({ settings: { builtInRules: { lockFiles: false } } });
  });

  it("sends an integrations snapshot on ready", async () => {
    const { controller, posted } = setupHarness();
    await controller.handleMessage({ type: "ready" });

    const integrationsMsg = posted.find((m) => m.type === "integrations");
    expect(integrationsMsg).toMatchObject({
      type: "integrations",
      integrations: { claude: { configured: false }, gitlab: { instanceUrl: "https://gitlab.com" } },
    });
  });

  it("saving an AI provider key persists it and echoes back a fresh integrations snapshot", async () => {
    const { controller, posted } = setupHarness();

    await controller.handleMessage({ type: "saveAiProviderKey", provider: "claude", apiKey: "sk-ant-123" });

    const integrationsMsg = posted.find((m) => m.type === "integrations");
    expect(integrationsMsg).toMatchObject({ integrations: { claude: { configured: true } } });
  });

  it("saving a GitHub token updates the integrations snapshot", async () => {
    const { controller, posted } = setupHarness();

    await controller.handleMessage({ type: "saveGithubToken", token: "ghp_abc" });

    const integrationsMsg = posted.find((m) => m.type === "integrations");
    expect(integrationsMsg).toMatchObject({ integrations: { github: { configured: true } } });
  });

  it("saving GitLab credentials updates configured status and instance URL", async () => {
    const { controller, posted } = setupHarness();

    await controller.handleMessage({
      type: "saveGitlabCredentials",
      token: "glpat-xyz",
      instanceUrl: "https://gitlab.internal.example.com",
    });

    const integrationsMsg = posted.find((m) => m.type === "integrations");
    expect(integrationsMsg).toMatchObject({
      integrations: { gitlab: { configured: true, instanceUrl: "https://gitlab.internal.example.com" } },
    });
  });

  it("saving Jira credentials updates the integrations snapshot", async () => {
    const { controller, posted } = setupHarness();

    await controller.handleMessage({
      type: "saveJiraCredentials",
      siteUrl: "https://team.atlassian.net",
      email: "dev@example.com",
      apiToken: "jira-token",
    });

    const integrationsMsg = posted.find((m) => m.type === "integrations");
    expect(integrationsMsg).toMatchObject({
      integrations: { jira: { configured: true, siteUrl: "https://team.atlassian.net", email: "dev@example.com" } },
    });
  });

  it("openFileDiff posts a loading status, invokes deps.openFileDiff with the resolved file, then a done status", async () => {
    const { controller, posted, bbFetch, deps } = setupHarness();
    bbFetch.mockImplementation(async (url) => {
      const u = String(url);
      if (u.endsWith("/pullrequests/1")) return jsonResponse(makePrJson(1));
      if (u.includes("/diffstat")) {
        return jsonResponse({
          values: [{ status: "modified", lines_added: 1, lines_removed: 0, old: { path: "src/foo.ts" }, new: { path: "src/foo.ts" } }],
          next: undefined,
        });
      }
      throw new Error(`Unexpected URL ${u}`);
    });

    await controller.handleMessage({ type: "openFileDiff", prId: 1, path: "src/foo.ts" });

    expect(posted).toContainEqual({ type: "fileDiffOpenStatus", prId: 1, path: "src/foo.ts", status: "loading" });
    expect(posted).toContainEqual({ type: "fileDiffOpenStatus", prId: 1, path: "src/foo.ts", status: "done" });
    expect(deps.openFileDiff).toHaveBeenCalledTimes(1);
    const [, prId, detail, file] = (deps.openFileDiff as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(prId).toBe(1);
    expect(detail).toMatchObject({ sourceCommitHash: "src-hash", destinationCommitHash: "dst-hash" });
    expect(file).toMatchObject({ path: "src/foo.ts", status: "modified" });
  });

  it("openFileDiff reuses the cached PR detail instead of refetching it", async () => {
    const { controller, bbFetch } = setupHarness();
    bbFetch.mockImplementation(async (url) => {
      const u = String(url);
      if (u.endsWith("/pullrequests/1")) return jsonResponse(makePrJson(1));
      if (u.includes("/diffstat")) {
        return jsonResponse({
          values: [{ status: "modified", lines_added: 1, lines_removed: 0, old: { path: "src/foo.ts" }, new: { path: "src/foo.ts" } }],
          next: undefined,
        });
      }
      throw new Error(`Unexpected URL ${u}`);
    });

    await controller.loadPullRequestDetail(1);
    const callsAfterDetailLoad = bbFetch.mock.calls.length;

    await controller.openFileDiff(1, "src/foo.ts");

    expect(bbFetch.mock.calls.length).toBe(callsAfterDetailLoad);
  });

  it("openFileDiff posts an error status when the path isn't among the PR's changed files", async () => {
    const { controller, posted, bbFetch } = setupHarness();
    bbFetch.mockImplementation(async (url) => {
      const u = String(url);
      if (u.endsWith("/pullrequests/1")) return jsonResponse(makePrJson(1));
      if (u.includes("/diffstat")) return jsonResponse({ values: [], next: undefined });
      throw new Error(`Unexpected URL ${u}`);
    });

    await controller.handleMessage({ type: "openFileDiff", prId: 1, path: "not-in-pr.ts" });

    const statusMsgs = posted.filter((m) => m.type === "fileDiffOpenStatus");
    expect(statusMsgs.at(-1)).toMatchObject({ status: "error", error: expect.stringContaining("not-in-pr.ts") });
  });

  it("openFileDiff posts an error status when deps.openFileDiff rejects", async () => {
    const { controller, posted, bbFetch, deps } = setupHarness();
    bbFetch.mockImplementation(async (url) => {
      const u = String(url);
      if (u.endsWith("/pullrequests/1")) return jsonResponse(makePrJson(1));
      if (u.includes("/diffstat")) {
        return jsonResponse({
          values: [{ status: "modified", lines_added: 1, lines_removed: 0, old: { path: "src/foo.ts" }, new: { path: "src/foo.ts" } }],
          next: undefined,
        });
      }
      throw new Error(`Unexpected URL ${u}`);
    });
    (deps.openFileDiff as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("Could not fetch file content"));

    await controller.handleMessage({ type: "openFileDiff", prId: 1, path: "src/foo.ts" });

    const statusMsgs = posted.filter((m) => m.type === "fileDiffOpenStatus");
    expect(statusMsgs.at(-1)).toMatchObject({ status: "error", error: "Could not fetch file content" });
  });
});
