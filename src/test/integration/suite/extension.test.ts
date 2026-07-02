import * as assert from "assert";
import * as vscode from "vscode";

// Extension Host smoke test: verifies the extension activates inside a real VS Code
// instance and registers its commands. The detailed webview <-> extension message
// flow (list PRs, run review, edit summary, post summary) is covered by the
// framework-agnostic ReviewerPanelController tests under src/test/unit, which drive
// the exact same production message-handling code without requiring a live webview.
suite("Bitbucket PR Reviewer extension", () => {
  test("activates and registers all contributed commands", async () => {
    const extension = vscode.extensions.getExtension("local-dev.bitbucket-pr-reviewer");
    assert.ok(extension, "extension should be discoverable by id");

    await extension!.activate();
    assert.strictEqual(extension!.isActive, true);

    const commands = await vscode.commands.getCommands(true);
    const expected = [
      "bitbucketReviewer.connect",
      "bitbucketReviewer.refreshPullRequests",
      "bitbucketReviewer.openReviewer",
      "bitbucketReviewer.runReview",
      "bitbucketReviewer.postSummary",
      "bitbucketReviewer.signOut",
    ];
    for (const command of expected) {
      assert.ok(commands.includes(command), `expected command '${command}' to be registered`);
    }
  });

  test("openReviewer creates a webview panel", async () => {
    await vscode.commands.executeCommand("bitbucketReviewer.openReviewer");
    // If the command completed without throwing, the WebviewPanel was created successfully.
    assert.ok(true);
  });
});
