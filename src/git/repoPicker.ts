import * as vscode from "vscode";
import { BitbucketRemoteInfo } from "../types";
import { BitbucketRepoCandidate, findBitbucketRepositories, NoBitbucketRemoteError } from "./gitRepo";

const REMEMBERED_REPO_KEY = "bitbucketReviewer.selectedRepoRootPath";

export interface ResolveBitbucketRepositoryOptions {
  /** Forces showing the repository picker even if a remembered repository exists. */
  forcePrompt?: boolean;
}

/**
 * Resolves which Bitbucket repository the panel should target.
 * - Zero candidates: throws.
 * - One candidate: used automatically.
 * - Multiple candidates: uses the previously remembered choice for this workspace
 *   if it's still present, otherwise prompts with a Quick Pick and remembers the answer.
 */
export async function resolveBitbucketRepository(
  workspaceState: vscode.Memento,
  options: ResolveBitbucketRepositoryOptions = {},
): Promise<BitbucketRemoteInfo> {
  const candidates = await findBitbucketRepositories();
  if (candidates.length === 0) {
    throw new NoBitbucketRemoteError();
  }
  if (candidates.length === 1) {
    return candidates[0].remote;
  }

  if (!options.forcePrompt) {
    const rememberedPath = workspaceState.get<string>(REMEMBERED_REPO_KEY);
    const remembered = candidates.find((c) => c.rootPath === rememberedPath);
    if (remembered) {
      return remembered.remote;
    }
  }

  const picked = await promptForRepository(candidates);
  await workspaceState.update(REMEMBERED_REPO_KEY, picked.rootPath);
  return picked.remote;
}

/** Clears the remembered repo choice for this workspace, forcing a re-prompt next time. */
export async function forgetRememberedRepository(workspaceState: vscode.Memento): Promise<void> {
  await workspaceState.update(REMEMBERED_REPO_KEY, undefined);
}

async function promptForRepository(candidates: BitbucketRepoCandidate[]): Promise<BitbucketRepoCandidate> {
  const items = candidates.map((candidate) => ({
    label: `${candidate.remote.workspace}/${candidate.remote.repoSlug}`,
    description: candidate.rootPath,
    candidate,
  }));

  const picked = await vscode.window.showQuickPick(items, {
    title: "Select the Bitbucket repository to review",
    placeHolder: "Multiple Bitbucket repositories are open in this workspace",
    ignoreFocusOut: true,
  });

  if (!picked) {
    throw new NoBitbucketRemoteError("No repository selected.");
  }
  return picked.candidate;
}
