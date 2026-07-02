import * as vscode from "vscode";
import { AuthManager } from "./auth/authManager";
import { registerCommentController } from "./panel/bitbucketCommentController";
import { BITBUCKET_DIFF_SCHEME, getFileContentProvider } from "./panel/bitbucketFileContentProvider";
import { ReviewerPanel } from "./panel/reviewerPanel";
import { ReviewerViewProvider } from "./panel/reviewerViewProvider";

export function activate(context: vscode.ExtensionContext): void {
  const authManager = new AuthManager(context.secrets);
  registerCommentController(context, authManager);

  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(BITBUCKET_DIFF_SCHEME, getFileContentProvider()),

    vscode.window.registerWebviewViewProvider(
      ReviewerViewProvider.viewType,
      new ReviewerViewProvider(context, authManager),
      { webviewOptions: { retainContextWhenHidden: true } },
    ),

    vscode.commands.registerCommand("bitbucketReviewer.connect", async () => {
      try {
        await authManager.connect();
        void vscode.window.showInformationMessage("Connected to Bitbucket.");
      } catch (err) {
        void vscode.window.showErrorMessage(describeError(err));
      }
    }),

    vscode.commands.registerCommand("bitbucketReviewer.signOut", async () => {
      await authManager.signOut();
      void vscode.window.showInformationMessage("Signed out of Bitbucket.");
    }),

    vscode.commands.registerCommand("bitbucketReviewer.openReviewer", async () => {
      await ReviewerPanel.createOrShow(context, authManager);
    }),

    vscode.commands.registerCommand("bitbucketReviewer.refreshPullRequests", async () => {
      const panel = await ReviewerPanel.createOrShow(context, authManager);
      await panel.refresh();
    }),

    vscode.commands.registerCommand("bitbucketReviewer.switchRepository", async () => {
      await ReviewerPanel.switchRepositoryFor(context, authManager);
    }),

    vscode.commands.registerCommand("bitbucketReviewer.openSettings", async () => {
      await ReviewerPanel.openSettingsFor(context, authManager);
    }),

    vscode.commands.registerCommand("bitbucketReviewer.openIntegrations", async () => {
      await ReviewerPanel.openIntegrationsFor(context, authManager);
    }),

    vscode.commands.registerCommand("bitbucketReviewer.openChangelog", async () => {
      await ReviewerPanel.openChangelogFor(context, authManager);
    }),

    vscode.commands.registerCommand("bitbucketReviewer.openBatchReview", async () => {
      await ReviewerPanel.openBatchReviewFor(context, authManager);
    }),

    vscode.commands.registerCommand("bitbucketReviewer.runReview", async () => {
      const prId = await promptForPrId("Run AI Review");
      if (prId !== undefined) {
        await ReviewerPanel.runReviewFor(context, authManager, prId);
      }
    }),

    vscode.commands.registerCommand("bitbucketReviewer.postSummary", async () => {
      const prId = await promptForPrId("Post Summary");
      if (prId !== undefined) {
        await ReviewerPanel.postSummaryFor(context, authManager, prId);
      }
    }),
  );
}

export function deactivate(): void {
  // No global resources to release beyond what's captured in context.subscriptions.
}

async function promptForPrId(actionLabel: string): Promise<number | undefined> {
  const input = await vscode.window.showInputBox({
    title: `Bitbucket PR Reviewer: ${actionLabel}`,
    prompt: "Pull request ID",
    validateInput: (value) => (/^\d+$/.test(value.trim()) ? undefined : "Enter a numeric PR ID"),
  });
  return input ? Number(input.trim()) : undefined;
}

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
