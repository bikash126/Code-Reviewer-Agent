import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BitbucketRepoCandidate } from "../../git/gitRepo";

const showQuickPick = vi.fn();
vi.mock("vscode", () => ({
  window: { showQuickPick: (...args: unknown[]) => showQuickPick(...args) },
}));

let candidates: BitbucketRepoCandidate[] = [];
vi.mock("../../git/gitRepo", async () => {
  const actual = await vi.importActual<typeof import("../../git/gitRepo")>("../../git/gitRepo");
  return {
    ...actual,
    findBitbucketRepositories: () => Promise.resolve(candidates),
  };
});

const { resolveBitbucketRepository, forgetRememberedRepository } = await import("../../git/repoPicker");
const { NoBitbucketRemoteError } = await import("../../git/gitRepo");

function makeMemento() {
  const store = new Map<string, unknown>();
  return {
    get: (key: string, defaultValue?: unknown) => (store.has(key) ? store.get(key) : defaultValue),
    update: async (key: string, value: unknown) => {
      if (value === undefined) {
        store.delete(key);
      } else {
        store.set(key, value);
      }
    },
    keys: () => [...store.keys()],
  };
}

const repoA: BitbucketRepoCandidate = { remote: { workspace: "ws", repoSlug: "repo-a" }, rootPath: "/repos/a" };
const repoB: BitbucketRepoCandidate = { remote: { workspace: "ws", repoSlug: "repo-b" }, rootPath: "/repos/b" };

describe("resolveBitbucketRepository", () => {
  beforeEach(() => {
    showQuickPick.mockReset();
    candidates = [];
  });

  it("throws when no Bitbucket repository is found", async () => {
    candidates = [];
    await expect(resolveBitbucketRepository(makeMemento() as never)).rejects.toBeInstanceOf(NoBitbucketRemoteError);
    expect(showQuickPick).not.toHaveBeenCalled();
  });

  it("returns the only candidate without prompting", async () => {
    candidates = [repoA];
    const result = await resolveBitbucketRepository(makeMemento() as never);
    expect(result).toEqual(repoA.remote);
    expect(showQuickPick).not.toHaveBeenCalled();
  });

  it("prompts when multiple candidates exist and remembers the choice", async () => {
    candidates = [repoA, repoB];
    showQuickPick.mockResolvedValue({ label: "ws/repo-b", description: "/repos/b", candidate: repoB });
    const memento = makeMemento();

    const result = await resolveBitbucketRepository(memento as never);

    expect(result).toEqual(repoB.remote);
    expect(showQuickPick).toHaveBeenCalledTimes(1);
    expect(memento.get("bitbucketReviewer.selectedRepoRootPath")).toBe("/repos/b");
  });

  it("reuses a remembered choice without re-prompting", async () => {
    candidates = [repoA, repoB];
    const memento = makeMemento();
    await memento.update("bitbucketReviewer.selectedRepoRootPath", "/repos/a");

    const result = await resolveBitbucketRepository(memento as never);

    expect(result).toEqual(repoA.remote);
    expect(showQuickPick).not.toHaveBeenCalled();
  });

  it("re-prompts on force even when a remembered choice exists", async () => {
    candidates = [repoA, repoB];
    const memento = makeMemento();
    await memento.update("bitbucketReviewer.selectedRepoRootPath", "/repos/a");
    showQuickPick.mockResolvedValue({ label: "ws/repo-b", description: "/repos/b", candidate: repoB });

    const result = await resolveBitbucketRepository(memento as never, { forcePrompt: true });

    expect(result).toEqual(repoB.remote);
    expect(showQuickPick).toHaveBeenCalledTimes(1);
    expect(memento.get("bitbucketReviewer.selectedRepoRootPath")).toBe("/repos/b");
  });

  it("re-prompts when the remembered repo is no longer among the candidates", async () => {
    candidates = [repoA, repoB];
    const memento = makeMemento();
    await memento.update("bitbucketReviewer.selectedRepoRootPath", "/repos/stale");
    showQuickPick.mockResolvedValue({ label: "ws/repo-a", description: "/repos/a", candidate: repoA });

    const result = await resolveBitbucketRepository(memento as never);

    expect(result).toEqual(repoA.remote);
    expect(showQuickPick).toHaveBeenCalledTimes(1);
  });

  it("throws when the user cancels the picker", async () => {
    candidates = [repoA, repoB];
    showQuickPick.mockResolvedValue(undefined);

    await expect(resolveBitbucketRepository(makeMemento() as never)).rejects.toBeInstanceOf(NoBitbucketRemoteError);
  });
});

describe("forgetRememberedRepository", () => {
  it("clears the remembered repo root path", async () => {
    const memento = makeMemento();
    await memento.update("bitbucketReviewer.selectedRepoRootPath", "/repos/a");

    await forgetRememberedRepository(memento as never);

    expect(memento.get("bitbucketReviewer.selectedRepoRootPath")).toBeUndefined();
  });
});
