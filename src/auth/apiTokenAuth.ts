import * as vscode from "vscode";
import { SecretStore } from "./secretStorage";
import { AuthError, AuthProvider } from "./authProvider";

/**
 * Auth via an Atlassian account email + API token (https://id.atlassian.com/manage-profile/security/api-tokens),
 * sent as HTTP Basic auth. This is the fastest-to-set-up auth method and does not require an OAuth consumer.
 */
export class ApiTokenAuthProvider implements AuthProvider {
  readonly method = "apiToken" as const;

  constructor(private readonly secretStore: SecretStore) {}

  async isConnected(): Promise<boolean> {
    return (await this.secretStore.getApiToken()) !== undefined;
  }

  async connect(): Promise<void> {
    const email = await vscode.window.showInputBox({
      title: "Bitbucket PR Reviewer: Connect",
      prompt: "Atlassian account email",
      placeHolder: "you@example.com",
      ignoreFocusOut: true,
      validateInput: (value) => (value.includes("@") ? undefined : "Enter a valid email address"),
    });
    if (!email) {
      throw new AuthError("Connection cancelled: no email provided.");
    }

    const token = await vscode.window.showInputBox({
      title: "Bitbucket PR Reviewer: Connect",
      prompt: "Atlassian API token (id.atlassian.com/manage-profile/security/api-tokens)",
      password: true,
      ignoreFocusOut: true,
      validateInput: (value) => (value.length > 0 ? undefined : "Enter your API token"),
    });
    if (!token) {
      throw new AuthError("Connection cancelled: no API token provided.");
    }

    await this.secretStore.setApiToken(email, token);
  }

  async getAuthHeader(): Promise<string> {
    const stored = await this.secretStore.getApiToken();
    if (!stored) {
      throw new AuthError("Not connected to Bitbucket. Run 'Bitbucket PR Reviewer: Connect' first.");
    }
    const encoded = Buffer.from(`${stored.email}:${stored.token}`).toString("base64");
    return `Basic ${encoded}`;
  }

  async getAccountLabel(): Promise<string | undefined> {
    const stored = await this.secretStore.getApiToken();
    return stored?.email;
  }

  async signOut(): Promise<void> {
    await this.secretStore.clearApiToken();
  }
}
