import { describe, expect, it, vi } from "vitest";
import { BitbucketApiError, BitbucketClient, FetchLike } from "../../bitbucket/client";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function makePr(id: number) {
  return {
    id,
    title: `PR ${id}`,
    state: "OPEN",
    author: { display_name: "Alice" },
    source: { branch: { name: "feature" } },
    destination: { branch: { name: "main" } },
    created_on: "2026-01-01T00:00:00Z",
    updated_on: "2026-01-02T00:00:00Z",
    comment_count: 2,
    task_count: 0,
    links: { html: { href: `https://bitbucket.org/ws/repo/pull-requests/${id}` } },
  };
}

describe("BitbucketClient", () => {
  it("sends the resolved auth header on every request", async () => {
    const fetchFn = vi.fn<Parameters<FetchLike>, ReturnType<FetchLike>>().mockResolvedValue(jsonResponse({ values: [], next: undefined }));
    const getAuthHeader = vi.fn().mockResolvedValue("Bearer test-token");

    const client = new BitbucketClient({ workspace: "ws", repoSlug: "repo", getAuthHeader, fetchFn });
    await client.listPullRequests();

    expect(getAuthHeader).toHaveBeenCalled();
    const [, init] = fetchFn.mock.calls[0];
    expect((init as RequestInit).headers).toMatchObject({ Authorization: "Bearer test-token" });
  });

  it("follows the `next` cursor across pages until exhausted", async () => {
    const page1 = { values: [makePr(1), makePr(2)], next: "https://api.bitbucket.org/2.0/page2" };
    const page2 = { values: [makePr(3)], next: undefined };

    const fetchFn = vi.fn<Parameters<FetchLike>, ReturnType<FetchLike>>().mockResolvedValueOnce(jsonResponse(page1)).mockResolvedValueOnce(jsonResponse(page2));

    const client = new BitbucketClient({
      workspace: "ws",
      repoSlug: "repo",
      getAuthHeader: async () => "Bearer t",
      fetchFn,
    });

    const prs = await client.listPullRequests();

    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(fetchFn.mock.calls[1][0]).toBe("https://api.bitbucket.org/2.0/page2");
    expect(prs.map((p) => p.id)).toEqual([1, 2, 3]);
  });

  it("normalizes non-2xx responses into BitbucketApiError with the API's error message", async () => {
    const fetchFn = vi
      .fn<Parameters<FetchLike>, ReturnType<FetchLike>>()
      .mockResolvedValue(jsonResponse({ error: { message: "Repository not found" } }, 404));

    const client = new BitbucketClient({
      workspace: "ws",
      repoSlug: "missing-repo",
      getAuthHeader: async () => "Bearer t",
      fetchFn,
    });

    await expect(client.listPullRequests()).rejects.toMatchObject(
      new BitbucketApiError("Repository not found", 404),
    );
  });

  it("falls back to a generic message when the error body isn't JSON", async () => {
    const fetchFn = vi.fn<Parameters<FetchLike>, ReturnType<FetchLike>>().mockResolvedValue(new Response("<html>gateway timeout</html>", { status: 502 }));

    const client = new BitbucketClient({
      workspace: "ws",
      repoSlug: "repo",
      getAuthHeader: async () => "Bearer t",
      fetchFn,
    });

    await expect(client.listPullRequests()).rejects.toThrow(/status 502/);
  });

  it("maps source/destination commit hashes onto PullRequestDetail", async () => {
    const fetchFn = vi.fn<Parameters<FetchLike>, ReturnType<FetchLike>>().mockImplementation(async (url) => {
      const u = String(url);
      if (u.includes("/diffstat")) {
        return jsonResponse({ values: [], next: undefined });
      }
      return jsonResponse({
        ...makePr(5),
        source: { branch: { name: "feature" }, commit: { hash: "src-hash-1" } },
        destination: { branch: { name: "main" }, commit: { hash: "dst-hash-1" } },
        participants: [],
      });
    });

    const client = new BitbucketClient({
      workspace: "ws",
      repoSlug: "repo",
      getAuthHeader: async () => "Bearer t",
      fetchFn,
    });

    const detail = await client.getPullRequestDetail(5);

    expect(detail.sourceCommitHash).toBe("src-hash-1");
    expect(detail.destinationCommitHash).toBe("dst-hash-1");
  });

  it("maps diffstat entries into ChangedFile objects", async () => {
    const fetchFn = vi.fn<Parameters<FetchLike>, ReturnType<FetchLike>>().mockResolvedValue(
      jsonResponse({
        values: [
          { status: "modified", lines_added: 5, lines_removed: 2, old: { path: "a.ts" }, new: { path: "a.ts" } },
          { status: "renamed", lines_added: 0, lines_removed: 0, old: { path: "old.ts" }, new: { path: "new.ts" } },
        ],
        next: undefined,
      }),
    );

    const client = new BitbucketClient({
      workspace: "ws",
      repoSlug: "repo",
      getAuthHeader: async () => "Bearer t",
      fetchFn,
    });

    const files = await client.getChangedFiles(42);
    expect(files).toEqual([
      { path: "a.ts", status: "modified", linesAdded: 5, linesRemoved: 2, oldPath: undefined },
      { path: "new.ts", status: "renamed", linesAdded: 0, linesRemoved: 0, oldPath: "old.ts" },
    ]);
  });

  it("truncates the diff when it exceeds maxBytes", async () => {
    const bigDiff = "a".repeat(100);
    const fetchFn = vi.fn<Parameters<FetchLike>, ReturnType<FetchLike>>().mockResolvedValue(new Response(bigDiff, { status: 200 }));

    const client = new BitbucketClient({
      workspace: "ws",
      repoSlug: "repo",
      getAuthHeader: async () => "Bearer t",
      fetchFn,
    });

    const { diff, truncated } = await client.getDiff(1, 10);
    expect(truncated).toBe(true);
    expect(diff).toHaveLength(10);
  });

  it("posts the summary comment with the expected body", async () => {
    const fetchFn = vi
      .fn<Parameters<FetchLike>, ReturnType<FetchLike>>()
      .mockResolvedValue(jsonResponse({ links: { html: { href: "https://bitbucket.org/comment/1" } } }));

    const client = new BitbucketClient({
      workspace: "ws",
      repoSlug: "repo",
      getAuthHeader: async () => "Bearer t",
      fetchFn,
    });

    const { commentUrl } = await client.postSummaryComment(7, "## Summary\nLooks good.");

    expect(commentUrl).toBe("https://bitbucket.org/comment/1");
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toContain("/pullrequests/7/comments");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      content: { raw: "## Summary\nLooks good." },
    });
  });

  it("posts an inline comment on the 'new' side using Bitbucket's `to` line field", async () => {
    const fetchFn = vi
      .fn<Parameters<FetchLike>, ReturnType<FetchLike>>()
      .mockResolvedValue(jsonResponse({ links: { html: { href: "https://bitbucket.org/comment/2" } } }));

    const client = new BitbucketClient({
      workspace: "ws",
      repoSlug: "repo",
      getAuthHeader: async () => "Bearer t",
      fetchFn,
    });

    const { commentUrl } = await client.postInlineComment(7, "src/foo.ts", 42, "new", "Consider a null check here.");

    expect(commentUrl).toBe("https://bitbucket.org/comment/2");
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toContain("/pullrequests/7/comments");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      content: { raw: "Consider a null check here." },
      inline: { path: "src/foo.ts", to: 42 },
    });
  });

  it("posts an inline comment on the 'old' side using Bitbucket's `from` line field", async () => {
    const fetchFn = vi
      .fn<Parameters<FetchLike>, ReturnType<FetchLike>>()
      .mockResolvedValue(jsonResponse({ links: { html: { href: "https://bitbucket.org/comment/3" } } }));

    const client = new BitbucketClient({
      workspace: "ws",
      repoSlug: "repo",
      getAuthHeader: async () => "Bearer t",
      fetchFn,
    });

    await client.postInlineComment(7, "src/foo.ts", 10, "old", "This branch used to handle nulls.");

    const [, init] = fetchFn.mock.calls[0];
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      content: { raw: "This branch used to handle nulls." },
      inline: { path: "src/foo.ts", from: 10 },
    });
  });

  it("fetches a file's raw content at a specific commit", async () => {
    const fileContent = "export const x = 1;\n";
    const fetchFn = vi.fn<Parameters<FetchLike>, ReturnType<FetchLike>>().mockResolvedValue(
      new Response(fileContent, { status: 200 }),
    );

    const client = new BitbucketClient({
      workspace: "ws",
      repoSlug: "repo",
      getAuthHeader: async () => "Bearer t",
      fetchFn,
    });

    const content = await client.getFileContent("abc123", "src/foo.ts");

    expect(content).toBe(fileContent);
    const [url] = fetchFn.mock.calls[0];
    expect(String(url)).toBe("https://api.bitbucket.org/2.0/repositories/ws/repo/src/abc123/src/foo.ts");
  });

  it("returns undefined (not an error) when the file doesn't exist at that commit", async () => {
    const fetchFn = vi.fn<Parameters<FetchLike>, ReturnType<FetchLike>>().mockResolvedValue(
      new Response("not found", { status: 404 }),
    );

    const client = new BitbucketClient({
      workspace: "ws",
      repoSlug: "repo",
      getAuthHeader: async () => "Bearer t",
      fetchFn,
    });

    const content = await client.getFileContent("abc123", "was-added-later.ts");

    expect(content).toBeUndefined();
  });

  it("normalizes a non-404 failed getFileContent request into a BitbucketApiError", async () => {
    const fetchFn = vi.fn<Parameters<FetchLike>, ReturnType<FetchLike>>().mockResolvedValue(
      jsonResponse({ error: { message: "Repository access denied" } }, 403),
    );

    const client = new BitbucketClient({
      workspace: "ws",
      repoSlug: "repo",
      getAuthHeader: async () => "Bearer t",
      fetchFn,
    });

    await expect(client.getFileContent("abc123", "src/foo.ts")).rejects.toMatchObject(
      new BitbucketApiError("Repository access denied", 403),
    );
  });
});
