import * as vscode from "vscode";
import { AuthManager } from "../auth/authManager";
import { SecretStore } from "../auth/secretStorage";
import { BitbucketClient } from "../bitbucket/client";
import { forgetRememberedRepository, resolveBitbucketRepository } from "../git/repoPicker";
import { OpenAiClient } from "../openai/client";
import { ensureOpenAiApiKey } from "../openai/apiKey";
import { getReviewSettings, resetReviewSetting, updateReviewSetting } from "../settings/settingsService";
import {
  getIntegrationsState,
  saveAiProviderKey,
  saveGithubToken,
  saveGitlabCredentials,
  saveJiraCredentials,
} from "../settings/integrationsService";
import { ExtensionToWebviewMessage } from "../types";
import { getFileContentProvider, openFileDiffInEditor } from "./bitbucketFileContentProvider";
import { ReviewerPanelDeps } from "./reviewerPanelController";

/**
 * Builds the full `ReviewerPanelDeps` wiring against real vscode/Bitbucket/OpenAI backends.
 * Shared by both the editor-tab `ReviewerPanel` and the Activity Bar `ReviewerViewProvider`,
 * which otherwise each own an independent `ReviewerPanelController` instance/cache.
 */
export function createReviewerPanelDeps(
  context: vscode.ExtensionContext,
  authManager: AuthManager,
  post: (message: ExtensionToWebviewMessage) => void,
): ReviewerPanelDeps {
  const secretStore = new SecretStore(context.secrets);

  return {
    resolveRemote: (options) => resolveBitbucketRepository(context.workspaceState, options),
    forgetRemote: () => forgetRememberedRepository(context.workspaceState),
    getConnectionState: (workspace, repoSlug) => authManager.getConnectionState(workspace, repoSlug),
    connectAuth: () => authManager.connect(),
    signOutAuth: () => authManager.signOut(),
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
    confirmPost: async (prId) => {
      const confirmed = await vscode.window.showWarningMessage(
        `Post the AI-generated summary as a comment on PR #${prId}?`,
        { modal: true },
        "Post Summary",
      );
      return confirmed === "Post Summary";
    },
    showError: (message) => void vscode.window.showErrorMessage(message),
    post,
    getSettings: () => getReviewSettings(),
    updateSetting: (key, value) => updateReviewSetting(key, value),
    resetSetting: (key) => resetReviewSetting(key),
    getIntegrations: async () => {
      const [connectionState, openaiApiKey] = await Promise.all([
        authManager.getConnectionState(),
        secretStore.getOpenAiApiKey(),
      ]);
      return getIntegrationsState(secretStore, connectionState.connected, Boolean(openaiApiKey));
    },
    saveAiProviderKey: (provider, apiKey) => saveAiProviderKey(secretStore, provider, apiKey),
    saveGithubToken: (token) => saveGithubToken(secretStore, token),
    saveGitlabCredentials: (token, instanceUrl) => saveGitlabCredentials(secretStore, token, instanceUrl),
    saveJiraCredentials: (siteUrl, email, apiToken) => saveJiraCredentials(secretStore, siteUrl, email, apiToken),
    openFileDiff: (client, prId, detail, file) =>
      openFileDiffInEditor(
        getFileContentProvider(),
        client,
        prId,
        file,
        detail.sourceCommitHash,
        detail.destinationCommitHash,
      ),
  };
}
