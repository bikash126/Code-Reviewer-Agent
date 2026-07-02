import * as vscode from "vscode";
import { SecretStore } from "./secretStorage";
import { AuthProvider } from "./authProvider";
import { ApiTokenAuthProvider } from "./apiTokenAuth";
import { OAuthAuthProvider } from "./oauthAuth";
import { ConnectionState } from "../types";

export class AuthManager {
  private readonly apiTokenProvider: ApiTokenAuthProvider;
  private readonly oauthProvider: OAuthAuthProvider;
  private readonly onDidChangeConnectionEmitter = new vscode.EventEmitter<void>();
  readonly onDidChangeConnection = this.onDidChangeConnectionEmitter.event;

  constructor(secrets: vscode.SecretStorage) {
    const secretStore = new SecretStore(secrets);
    this.apiTokenProvider = new ApiTokenAuthProvider(secretStore);
    this.oauthProvider = new OAuthAuthProvider(secretStore);
  }

  /** Returns the provider selected by `bitbucketReviewer.authMethod`. */
  getActiveProvider(): AuthProvider {
    const method = vscode.workspace.getConfiguration("bitbucketReviewer").get<string>("authMethod", "apiToken");
    return method === "oauth" ? this.oauthProvider : this.apiTokenProvider;
  }

  async connect(): Promise<void> {
    await this.getActiveProvider().connect();
    this.onDidChangeConnectionEmitter.fire();
  }

  async signOut(): Promise<void> {
    // Sign out of both providers so switching authMethod doesn't leave stale credentials behind.
    await Promise.all([this.apiTokenProvider.signOut(), this.oauthProvider.signOut()]);
    this.onDidChangeConnectionEmitter.fire();
  }

  async getAuthHeader(): Promise<string> {
    return this.getActiveProvider().getAuthHeader();
  }

  async getConnectionState(workspace?: string, repoSlug?: string): Promise<ConnectionState> {
    const provider = this.getActiveProvider();
    const connected = await provider.isConnected();
    if (!connected) {
      return { connected: false };
    }
    const accountLabel = await provider.getAccountLabel();
    return { connected: true, authMethod: provider.method, accountLabel, workspace, repoSlug };
  }
}
