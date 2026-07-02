import * as vscode from "vscode";
import { AuthManager } from "../auth/authManager";
import { SecretStore } from "../auth/secretStorage";
import { BitbucketClient } from "../bitbucket/client";
import { findBitbucketRepositories } from "../git/gitRepo";
import { OpenAiClient } from "../openai/client";
import { ensureOpenAiApiKey } from "../openai/apiKey";
import { ExtensionToWebviewMessage } from "../types";
import { BatchReviewDeps } from "./batchReviewController";

/** Builds `BatchReviewDeps` against real vscode/Bitbucket/OpenAI backends. */
export function createBatchReviewDeps(
  context: vscode.ExtensionContext,
  authManager: AuthManager,
  post: (message: ExtensionToWebviewMessage) => void,
): BatchReviewDeps {
  const secretStore = new SecretStore(context.secrets);

  return {
    listRepos: async () => {
      const candidates = await findBitbucketRepositories();
      return candidates.map((c) => c.remote);
    },
    createBitbucketClient: (remote) =>
      new BitbucketClient({
        workspace: remote.workspace,
        repoSlug: remote.repoSlug,
        getAuthHeader: () => authManager.getAuthHeader(),
      }),
    ensureOpenAiApiKey: () => ensureOpenAiApiKey(secretStore),
    createOpenAiClient: (apiKey) => new OpenAiClient(apiKey),
    getReviewConfig: () => {
      const config = vscode.workspace.getConfiguration("bitbucketReviewer");
      return {
        model: config.get<string>("openai.model", "gpt-5"),
        maxDiffBytes: config.get<number>("review.maxDiffBytes", 200000),
      };
    },
    confirmPost: async (target) => {
      const confirmed = await vscode.window.showWarningMessage(
        `Post the AI-generated summary as a comment on ${target.workspace}/${target.repoSlug} PR #${target.prId}?`,
        { modal: true },
        "Post Summary",
      );
      return confirmed === "Post Summary";
    },
    showError: (message) => void vscode.window.showErrorMessage(message),
    post,
  };
}
