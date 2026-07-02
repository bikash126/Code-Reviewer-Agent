import { describe, expect, it } from "vitest";
import { parseBitbucketRemote } from "../../bitbucket/remote";

describe("parseBitbucketRemote", () => {
  it("parses HTTPS remotes", () => {
    expect(parseBitbucketRemote("https://bitbucket.org/my-workspace/my-repo.git")).toEqual({
      workspace: "my-workspace",
      repoSlug: "my-repo",
    });
  });

  it("parses HTTPS remotes without a .git suffix", () => {
    expect(parseBitbucketRemote("https://bitbucket.org/my-workspace/my-repo")).toEqual({
      workspace: "my-workspace",
      repoSlug: "my-repo",
    });
  });

  it("parses HTTPS remotes with embedded credentials", () => {
    expect(parseBitbucketRemote("https://someuser@bitbucket.org/my-workspace/my-repo.git")).toEqual({
      workspace: "my-workspace",
      repoSlug: "my-repo",
    });
  });

  it("parses SSH scp-like remotes", () => {
    expect(parseBitbucketRemote("git@bitbucket.org:my-workspace/my-repo.git")).toEqual({
      workspace: "my-workspace",
      repoSlug: "my-repo",
    });
  });

  it("parses ssh:// remotes", () => {
    expect(parseBitbucketRemote("ssh://git@bitbucket.org/my-workspace/my-repo.git")).toEqual({
      workspace: "my-workspace",
      repoSlug: "my-repo",
    });
  });

  it("returns undefined for non-Bitbucket hosts", () => {
    expect(parseBitbucketRemote("https://github.com/my-workspace/my-repo.git")).toBeUndefined();
  });

  it("returns undefined for malformed input", () => {
    expect(parseBitbucketRemote("not a url")).toBeUndefined();
    expect(parseBitbucketRemote("")).toBeUndefined();
  });

  it("returns undefined when the path is missing a repo slug", () => {
    expect(parseBitbucketRemote("https://bitbucket.org/my-workspace")).toBeUndefined();
  });
});
