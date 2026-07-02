import * as vscode from "vscode";
import { BitbucketClient } from "../bitbucket/client";
import { ChangedFile } from "../types";

export const BITBUCKET_DIFF_SCHEME = "bitbucket-pr-diff";

/** Which half of the diff a `bitbucket-pr-diff:` document represents. */
export type DiffSide = "old" | "new";

export interface DiffUriInfo {
  prId: number;
  commitHash: string;
  path: string;
  side: DiffSide;
}

/** Builds the virtual document URI for one half of a file's diff. */
export function buildDiffUri(prId: number, commitHash: string, path: string, side: DiffSide): vscode.Uri {
  return vscode.Uri.from({
    scheme: BITBUCKET_DIFF_SCHEME,
    path: `/${prId}/${commitHash}/${path}`,
    query: `side=${side}`,
  });
}

/** Inverse of `buildDiffUri`. Returns `undefined` for any URI not in our scheme/shape. */
export function parseDiffUri(uri: vscode.Uri): DiffUriInfo | undefined {
  if (uri.scheme !== BITBUCKET_DIFF_SCHEME) {
    return undefined;
  }
  const [, prIdStr, commitHash, ...pathParts] = uri.path.split("/");
  const path = pathParts.join("/");
  const prId = Number(prIdStr);
  const side = new URLSearchParams(uri.query).get("side");

  if (!prIdStr || !Number.isFinite(prId) || !commitHash || !path || (side !== "old" && side !== "new")) {
    return undefined;
  }
  return { prId, commitHash, path, side };
}

/**
 * Serves virtual document content for the `bitbucket-pr-diff:` scheme so
 * `vscode.diff` can render a native side-by-side diff editor without writing
 * anything to disk. `setContent` must be called before the URI is opened.
 */
class BitbucketFileContentProvider implements vscode.TextDocumentContentProvider {
  private readonly content = new Map<string, string>();
  private readonly onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this.onDidChangeEmitter.event;

  setContent(uri: vscode.Uri, text: string): void {
    this.content.set(uri.toString(), text);
    this.onDidChangeEmitter.fire(uri);
  }

  provideTextDocumentContent(uri: vscode.Uri): string {
    return this.content.get(uri.toString()) ?? "";
  }
}

// Module-level singleton: the scheme can only be registered once per extension host,
// and every caller (editor-tab panel, sidebar view, comment controller) needs to share it.
let singleton: BitbucketFileContentProvider | undefined;

export function getFileContentProvider(): BitbucketFileContentProvider {
  if (!singleton) {
    singleton = new BitbucketFileContentProvider();
  }
  return singleton;
}

/** Fetches before/after content for `file` and opens it in VS Code's native diff editor. */
export async function openFileDiffInEditor(
  provider: BitbucketFileContentProvider,
  client: BitbucketClient,
  prId: number,
  file: ChangedFile,
  sourceCommitHash: string,
  destinationCommitHash: string,
): Promise<void> {
  const oldPath = file.oldPath ?? file.path;

  const [oldContent, newContent] = await Promise.all([
    file.status === "added" ? Promise.resolve("") : client.getFileContent(destinationCommitHash, oldPath).then((c) => c ?? ""),
    file.status === "removed" ? Promise.resolve("") : client.getFileContent(sourceCommitHash, file.path).then((c) => c ?? ""),
  ]);

  const leftUri = buildDiffUri(prId, destinationCommitHash, oldPath, "old");
  const rightUri = buildDiffUri(prId, sourceCommitHash, file.path, "new");
  provider.setContent(leftUri, oldContent);
  provider.setContent(rightUri, newContent);

  const title = `${file.path} (PR #${prId})`;
  await vscode.commands.executeCommand("vscode.diff", leftUri, rightUri, title);
}
