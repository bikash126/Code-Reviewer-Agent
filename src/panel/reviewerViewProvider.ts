import * as vscode from "vscode";
import { AuthManager } from "../auth/authManager";
import { WebviewToExtensionMessage } from "../types";
import { BatchReviewController } from "./batchReviewController";
import { createBatchReviewDeps } from "./createBatchReviewDeps";
import { createReviewerPanelDeps } from "./createReviewerDeps";
import { ReviewerPanelController } from "./reviewerPanelController";
import { getWebviewHtml } from "./webviewHtml";

/**
 * Renders the same React app as `ReviewerPanel`, but docked in the Activity Bar sidebar
 * instead of an editor tab. Owns its own `ReviewerPanelController`/`BatchReviewController`
 * (and therefore its own PR/review cache) independent of any open editor-tab panel.
 */
export class ReviewerViewProvider implements vscode.WebviewViewProvider {
  static readonly viewType = "bitbucketReviewer.sidebarView";

  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly authManager: AuthManager,
  ) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, "dist")],
    };
    webviewView.webview.html = getWebviewHtml(webviewView.webview, this.context.extensionUri);

    const controller = new ReviewerPanelController(
      createReviewerPanelDeps(this.context, this.authManager, (message) => void webviewView.webview.postMessage(message)),
    );
    const batchController = new BatchReviewController(
      createBatchReviewDeps(this.context, this.authManager, (message) => void webviewView.webview.postMessage(message)),
    );

    this.disposables.push(
      webviewView.webview.onDidReceiveMessage((message: WebviewToExtensionMessage) => {
        void controller.handleMessage(message);
        void batchController.handleMessage(message);
      }),
      this.authManager.onDidChangeConnection(() => void controller.sendConnectionState()),
      webviewView.onDidDispose(() => {
        while (this.disposables.length) {
          this.disposables.pop()?.dispose();
        }
      }),
    );
  }
}
