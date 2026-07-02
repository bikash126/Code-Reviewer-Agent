import { describe, expect, it, vi } from "vitest";

// buildDiffUri/parseDiffUri only touch vscode.Uri.from() and read scheme/path/query back off
// the result, so a minimal fake Uri (not real VS Code) is enough to round-trip through it.
vi.mock("vscode", () => ({
  Uri: {
    from: ({ scheme, path, query }: { scheme: string; path: string; query?: string }) => ({
      scheme,
      path,
      query: query ?? "",
    }),
  },
  EventEmitter: class {
    event = () => ({ dispose() {} });
    fire() {}
  },
}));

const { BITBUCKET_DIFF_SCHEME, buildDiffUri, parseDiffUri } = await import("../../panel/bitbucketFileContentProvider");

describe("buildDiffUri / parseDiffUri", () => {
  it("round-trips prId, commit hash, path, and side", () => {
    const uri = buildDiffUri(42, "abc123def", "src/components/Foo.tsx", "new");

    expect(uri.scheme).toBe(BITBUCKET_DIFF_SCHEME);
    const info = parseDiffUri(uri as never);

    expect(info).toEqual({ prId: 42, commitHash: "abc123def", path: "src/components/Foo.tsx", side: "new" });
  });

  it("round-trips the 'old' side distinctly from 'new'", () => {
    const uri = buildDiffUri(42, "abc123def", "src/foo.ts", "old");
    expect(parseDiffUri(uri as never)?.side).toBe("old");
  });

  it("preserves nested paths with multiple segments", () => {
    const uri = buildDiffUri(7, "hash1", "a/b/c/d.ts", "new");
    expect(parseDiffUri(uri as never)?.path).toBe("a/b/c/d.ts");
  });

  it("returns undefined for a URI with a different scheme", () => {
    const foreignUri = { scheme: "file", path: "/42/hash/foo.ts", query: "side=new" };
    expect(parseDiffUri(foreignUri as never)).toBeUndefined();
  });

  it("returns undefined when the side query param is missing or invalid", () => {
    const noSide = { scheme: BITBUCKET_DIFF_SCHEME, path: "/42/hash/foo.ts", query: "" };
    expect(parseDiffUri(noSide as never)).toBeUndefined();

    const badSide = { scheme: BITBUCKET_DIFF_SCHEME, path: "/42/hash/foo.ts", query: "side=sideways" };
    expect(parseDiffUri(badSide as never)).toBeUndefined();
  });
});
