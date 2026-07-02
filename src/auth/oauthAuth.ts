import * as http from "http";
import * as crypto from "crypto";
import * as vscode from "vscode";
import { SecretStore } from "./secretStorage";
import { AuthError, AuthProvider } from "./authProvider";

export type FetchLike = typeof fetch;

const AUTHORIZE_URL = "https://bitbucket.org/site/oauth2/authorize";
const TOKEN_URL = "https://bitbucket.org/site/oauth2/access_token";
const USER_URL = "https://api.bitbucket.org/2.0/user";

// Fixed loopback port used as the OAuth redirect target. Configure this exact URL
// (http://127.0.0.1:51763/callback) as the callback URL on the Bitbucket OAuth consumer.
const REDIRECT_PORT = 51763;
const REDIRECT_URI = `http://127.0.0.1:${REDIRECT_PORT}/callback`;

// Refresh a little before actual expiry to avoid racing a request against token expiration.
const EXPIRY_SAFETY_MARGIN_MS = 60_000;

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

/** Auth via Bitbucket OAuth 2.0 authorization-code flow using a configured consumer clientId/clientSecret. */
export class OAuthAuthProvider implements AuthProvider {
  readonly method = "oauth" as const;

  constructor(
    private readonly secretStore: SecretStore,
    private readonly fetchFn: FetchLike = fetch,
  ) {}

  async isConnected(): Promise<boolean> {
    return (await this.secretStore.getOAuthTokens()) !== undefined;
  }

  async connect(): Promise<void> {
    const { clientId, clientSecret } = this.getConsumerCredentials();
    const state = crypto.randomBytes(16).toString("hex");

    const code = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Waiting for Bitbucket authorization in your browser...",
        cancellable: true,
      },
      (_progress, cancellationToken) => this.waitForAuthorizationCode(clientId, state, cancellationToken),
    );

    const tokens = await this.exchangeCodeForTokens(code, clientId, clientSecret);
    const expiresAt = Date.now() + tokens.expires_in * 1000;
    await this.secretStore.setOAuthTokens({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt,
    });

    const accountLabel = await this.fetchAccountLabel(tokens.access_token);
    if (accountLabel) {
      const stored = await this.secretStore.getOAuthTokens();
      if (stored) {
        await this.secretStore.setOAuthTokens({ ...stored, accountLabel });
      }
    }
  }

  async getAuthHeader(): Promise<string> {
    const stored = await this.secretStore.getOAuthTokens();
    if (!stored) {
      throw new AuthError("Not connected to Bitbucket. Run 'Bitbucket PR Reviewer: Connect' first.");
    }

    if (Date.now() < stored.expiresAt - EXPIRY_SAFETY_MARGIN_MS) {
      return `Bearer ${stored.accessToken}`;
    }

    const { clientId, clientSecret } = this.getConsumerCredentials();
    const refreshed = await this.refreshTokens(stored.refreshToken, clientId, clientSecret);
    const expiresAt = Date.now() + refreshed.expires_in * 1000;
    await this.secretStore.setOAuthTokens({
      accessToken: refreshed.access_token,
      // Bitbucket may or may not rotate the refresh token; fall back to the previous one.
      refreshToken: refreshed.refresh_token ?? stored.refreshToken,
      expiresAt,
      accountLabel: stored.accountLabel,
    });
    return `Bearer ${refreshed.access_token}`;
  }

  async getAccountLabel(): Promise<string | undefined> {
    const stored = await this.secretStore.getOAuthTokens();
    return stored?.accountLabel;
  }

  async signOut(): Promise<void> {
    await this.secretStore.clearOAuthTokens();
  }

  private getConsumerCredentials(): { clientId: string; clientSecret: string } {
    const config = vscode.workspace.getConfiguration("bitbucketReviewer.oauth");
    const clientId = config.get<string>("clientId", "");
    const clientSecret = config.get<string>("clientSecret", "");
    if (!clientId || !clientSecret) {
      throw new AuthError(
        "OAuth is not configured. Set 'bitbucketReviewer.oauth.clientId' and 'bitbucketReviewer.oauth.clientSecret' in settings.",
      );
    }
    return { clientId, clientSecret };
  }

  private waitForAuthorizationCode(
    clientId: string,
    state: string,
    cancellationToken: vscode.CancellationToken,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => {
        const url = new URL(req.url ?? "/", REDIRECT_URI);
        if (url.pathname !== "/callback") {
          res.writeHead(404).end();
          return;
        }

        const returnedState = url.searchParams.get("state");
        const code = url.searchParams.get("code");
        const errorParam = url.searchParams.get("error");

        res.writeHead(200, { "Content-Type": "text/html" });
        if (errorParam) {
          res.end(`<html><body>Authorization failed: ${escapeHtml(errorParam)}. You can close this tab.</body></html>`);
          cleanup();
          reject(new AuthError(`Bitbucket authorization failed: ${errorParam}`));
          return;
        }
        if (returnedState !== state || !code) {
          res.end("<html><body>Invalid authorization response. You can close this tab.</body></html>");
          cleanup();
          reject(new AuthError("OAuth state mismatch or missing authorization code."));
          return;
        }

        res.end("<html><body>Bitbucket authorization complete. You can close this tab and return to VS Code.</body></html>");
        cleanup();
        resolve(code);
      });

      const cancelListener = cancellationToken.onCancellationRequested(() => {
        cleanup();
        reject(new AuthError("Bitbucket connection cancelled."));
      });

      function cleanup() {
        cancelListener.dispose();
        server.close();
      }

      server.on("error", (err) => reject(new AuthError(`Could not start local OAuth callback server: ${err.message}`, err)));

      server.listen(REDIRECT_PORT, "127.0.0.1", () => {
        const authorizeUrl = new URL(AUTHORIZE_URL);
        authorizeUrl.searchParams.set("client_id", clientId);
        authorizeUrl.searchParams.set("response_type", "code");
        authorizeUrl.searchParams.set("state", state);
        authorizeUrl.searchParams.set("redirect_uri", REDIRECT_URI);
        void vscode.env.openExternal(vscode.Uri.parse(authorizeUrl.toString()));
      });
    });
  }

  private async exchangeCodeForTokens(code: string, clientId: string, clientSecret: string): Promise<TokenResponse> {
    return this.postTokenRequest(
      new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: REDIRECT_URI }),
      clientId,
      clientSecret,
    );
  }

  private async refreshTokens(refreshToken: string, clientId: string, clientSecret: string): Promise<TokenResponse> {
    return this.postTokenRequest(
      new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
      clientId,
      clientSecret,
    );
  }

  private async postTokenRequest(
    body: URLSearchParams,
    clientId: string,
    clientSecret: string,
  ): Promise<TokenResponse> {
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const response = await this.fetchFn(TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new AuthError(`Bitbucket token request failed (${response.status}): ${text}`);
    }
    return (await response.json()) as TokenResponse;
  }

  private async fetchAccountLabel(accessToken: string): Promise<string | undefined> {
    try {
      const response = await this.fetchFn(USER_URL, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!response.ok) {
        return undefined;
      }
      const data = (await response.json()) as { display_name?: string; username?: string };
      return data.display_name ?? data.username;
    } catch {
      return undefined;
    }
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}
