import * as vscode from "vscode";
import { AuthManager } from "../auth/authManager";
import { BitbucketClient } from "../bitbucket/client";
import { resolveBitbucketRepository } from "../git/repoPicker";
import { BITBUCKET_DIFF_SCHEME, parseDiffUri } from "./bitbucketFileContentProvider";

/**
 * Wires up VS Code's native Comments API against the `bitbucket-pr-diff:` documents opened by
 * `openFileDiffInEditor`, so users can add per-line comments directly in the diff editor gutter
 * and post them to Bitbucket as inline PR comments. Entirely separate from the webview — this is
 * a native VS Code UI surface, registered once for the whole extension host.
 */
export function registerCommentController(
  context: vscode.ExtensionContext,
  authManager: AuthManager,
): vscode.CommentController {
  const controller = vscode.comments.createCommentController("bitbucketReviewer.comments", "Bitbucket PR Reviewer");
  controller.commentingRangeProvider = {
    provideCommentingRanges(document) {
      if (document.uri.scheme !== BITBUCKET_DIFF_SCHEME || document.lineCount === 0) {
        return null;
      }
      return [new vscode.Range(0, 0, document.lineCount - 1, 0)];
    },
  };

  context.subscriptions.push(
    controller,

    vscode.commands.registerCommand("bitbucketReviewer.postInlineComment", async (reply: vscode.CommentReply) => {
      const text = reply.text.trim();
      if (!text) {
        return;
      }
      const info = parseDiffUri(reply.thread.uri);
      if (!info || !reply.thread.range) {
        void vscode.window.showErrorMessage("Could not determine which PR file/line this comment belongs to.");
        return;
      }
      const line = reply.thread.range.start.line + 1; // VS Code ranges are 0-indexed; Bitbucket lines are 1-indexed.

      try {
        const remote = await resolveBitbucketRepository(context.workspaceState);
        const client = new BitbucketClient({
          workspace: remote.workspace,
          repoSlug: remote.repoSlug,
          getAuthHeader: () => authManager.getAuthHeader(),
        });
        await client.postInlineComment(info.prId, info.path, line, info.side, text);

        const connectionState = await authManager.getConnectionState();
        reply.thread.comments = [
          ...reply.thread.comments,
          {
            body: new vscode.MarkdownString(text),
            mode: vscode.CommentMode.Preview,
            author: { name: connectionState.accountLabel ?? "You" },
            label: "Posted to Bitbucket",
          },
        ];
      } catch (err) {
        void vscode.window.showErrorMessage(
          `Failed to post comment to Bitbucket: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }),

    vscode.commands.registerCommand("bitbucketReviewer.disposeCommentThread", (thread: vscode.CommentThread) => {
      thread.dispose();
    }),
  );

  return controller;
}
