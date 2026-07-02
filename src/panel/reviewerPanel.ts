import * as vscode from "vscode";
import { AuthManager } from "../auth/authManager";
import { ExtensionToWebviewMessage, WebviewToExtensionMessage } from "../types";
import { BatchReviewController } from "./batchReviewController";
import { createBatchReviewDeps } from "./createBatchReviewDeps";
import { createReviewerPanelDeps } from "./createReviewerDeps";
import { ReviewerPanelController } from "./reviewerPanelController";
import { getWebviewHtml } from "./webviewHtml";

export class ReviewerPanel {
  private static current: ReviewerPanel | undefined;

  private readonly panel: vscode.WebviewPanel;
  private readonly disposables: vscode.Disposable[] = [];
  private readonly controller: ReviewerPanelController;
  private readonly batchController: BatchReviewController;

  static async createOrShow(context: vscode.ExtensionContext, authManager: AuthManager): Promise<ReviewerPanel> {
    if (ReviewerPanel.current) {
      ReviewerPanel.current.panel.reveal();
      return ReviewerPanel.current;
    }
    const panel = vscode.window.createWebviewPanel(
      "bitbucketReviewer",
      "Bitbucket PR Reviewer",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "dist")],
      },
    );
    const instance = new ReviewerPanel(panel, context, authManager);
    ReviewerPanel.current = instance;
    await instance.controller.sendConnectionState();
    return instance;
  }

  /** Triggers a review for `prId` if the panel is open, opening it first if needed. */
  static async runReviewFor(context: vscode.ExtensionContext, authManager: AuthManager, prId: number): Promise<void> {
    const instance = await ReviewerPanel.createOrShow(context, authManager);
    await instance.controller.runReview(prId, false);
  }

  static async postSummaryFor(context: vscode.ExtensionContext, authManager: AuthManager, prId: number): Promise<void> {
    const instance = await ReviewerPanel.createOrShow(context, authManager);
    await instance.controller.postSummary(prId);
  }

  static async switchRepositoryFor(context: vscode.ExtensionContext, authManager: AuthManager): Promise<void> {
    const instance = await ReviewerPanel.createOrShow(context, authManager);
    await instance.controller.switchRepository();
  }

  static async openSettingsFor(context: vscode.ExtensionContext, authManager: AuthManager): Promise<void> {
    const instance = await ReviewerPanel.createOrShow(context, authManager);
    instance.post({ type: "focusSettingsTab" });
  }

  static async openIntegrationsFor(context: vscode.ExtensionContext, authManager: AuthManager): Promise<void> {
    const instance = await ReviewerPanel.createOrShow(context, authManager);
    instance.post({ type: "focusIntegrationsTab" });
  }

  static async openChangelogFor(context: vscode.ExtensionContext, authManager: AuthManager): Promise<void> {
    const instance = await ReviewerPanel.createOrShow(context, authManager);
    instance.post({ type: "focusChangelogTab" });
  }

  static async openBatchReviewFor(context: vscode.ExtensionContext, authManager: AuthManager): Promise<void> {
    const instance = await ReviewerPanel.createOrShow(context, authManager);
    instance.post({ type: "focusBatchReviewTab" });
  }

  private constructor(
    panel: vscode.WebviewPanel,
    private readonly context: vscode.ExtensionContext,
    private readonly authManager: AuthManager,
  ) {
    this.panel = panel;
    this.controller = new ReviewerPanelController(
      createReviewerPanelDeps(context, authManager, (message) => this.post(message)),
    );
    this.batchController = new BatchReviewController(
      createBatchReviewDeps(context, authManager, (message) => this.post(message)),
    );

    this.panel.webview.html = getWebviewHtml(this.panel.webview, this.context.extensionUri);

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.onDidReceiveMessage(
      (message: WebviewToExtensionMessage) => {
        void this.controller.handleMessage(message);
        void this.batchController.handleMessage(message);
      },
      null,
      this.disposables,
    );
    this.disposables.push(this.authManager.onDidChangeConnection(() => void this.controller.sendConnectionState()));
  }

  async refresh(): Promise<void> {
    await this.controller.refreshPullRequests();
  }

  async switchRepository(): Promise<void> {
    await this.controller.switchRepository();
  }

  private post(message: ExtensionToWebviewMessage): void {
    void this.panel.webview.postMessage(message);
  }

  private dispose(): void {
    ReviewerPanel.current = undefined;
    while (this.disposables.length) {
      this.disposables.pop()?.dispose();
    }
    this.panel.dispose();
  }
}
