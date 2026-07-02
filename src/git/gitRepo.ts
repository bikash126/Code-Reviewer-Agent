import * as vscode from "vscode";
import { BitbucketRemoteInfo } from "../types";
import { parseBitbucketRemote } from "../bitbucket/remote";

// Minimal shape of the built-in `vscode.git` extension API that we rely on.
interface GitExtensionExports {
  getAPI(version: 1): GitAPI;
}
interface GitAPI {
  repositories: GitRepository[];
  onDidOpenRepository: vscode.Event<GitRepository>;
}
interface GitRepository {
  rootUri: vscode.Uri;
  state: {
    remotes: { name: string; fetchUrl?: string; pushUrl?: string }[];
  };
}

export class NoBitbucketRemoteError extends Error {
  constructor(message = "No Bitbucket Cloud remote was found in any open workspace folder.") {
    super(message);
    this.name = "NoBitbucketRemoteError";
  }
}

export interface BitbucketRepoCandidate {
  remote: BitbucketRemoteInfo;
  /** Filesystem path of the repository root, used to identify + display the candidate. */
  rootPath: string;
}

/**
 * Scans every open git repository (relevant when the VS Code workspace has multiple
 * root folders) and returns the ones whose `origin` remote (or, failing that, any
 * remote) points at bitbucket.org.
 */
export async function findBitbucketRepositories(): Promise<BitbucketRepoCandidate[]> {
  const gitExtension = vscode.extensions.getExtension<GitExtensionExports>("vscode.git");
  if (!gitExtension) {
    throw new NoBitbucketRemoteError("The built-in Git extension is not available.");
  }
  const gitExports = gitExtension.isActive ? gitExtension.exports : await gitExtension.activate();
  const api = gitExports.getAPI(1);

  const repositories = api.repositories.length > 0 ? api.repositories : await waitForFirstRepository(api);

  const candidates: BitbucketRepoCandidate[] = [];
  for (const repo of repositories) {
    const remote = findBitbucketRemote(repo);
    if (remote) {
      candidates.push({ remote, rootPath: repo.rootUri.fsPath });
    }
  }
  return candidates;
}

function findBitbucketRemote(repo: GitRepository): BitbucketRemoteInfo | undefined {
  const remotes = repo.state.remotes;
  const origin = remotes.find((r) => r.name === "origin");
  const ordered = origin ? [origin, ...remotes.filter((r) => r !== origin)] : remotes;

  for (const remote of ordered) {
    const url = remote.fetchUrl ?? remote.pushUrl;
    if (!url) {
      continue;
    }
    const parsed = parseBitbucketRemote(url);
    if (parsed) {
      return parsed;
    }
  }
  return undefined;
}

function waitForFirstRepository(api: GitAPI, timeoutMs = 5000): Promise<GitRepository[]> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      disposable.dispose();
      resolve(api.repositories);
    }, timeoutMs);
    const disposable = api.onDidOpenRepository(() => {
      clearTimeout(timeout);
      disposable.dispose();
      resolve(api.repositories);
    });
  });
}
