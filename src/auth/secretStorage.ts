import type * as vscode from "vscode";

// Centralized SecretStorage key names + typed accessors so auth providers
// don't hand-roll string keys in multiple places.
const KEYS = {
  apiTokenEmail: "bitbucketReviewer.apiToken.email",
  apiTokenSecret: "bitbucketReviewer.apiToken.secret",
  oauthAccessToken: "bitbucketReviewer.oauth.accessToken",
  oauthRefreshToken: "bitbucketReviewer.oauth.refreshToken",
  oauthExpiresAt: "bitbucketReviewer.oauth.expiresAt",
  oauthAccountLabel: "bitbucketReviewer.oauth.accountLabel",
  openaiApiKey: "bitbucketReviewer.openai.apiKey",
  claudeApiKey: "bitbucketReviewer.claude.apiKey",
  geminiApiKey: "bitbucketReviewer.gemini.apiKey",
  githubToken: "bitbucketReviewer.github.token",
  gitlabToken: "bitbucketReviewer.gitlab.token",
  gitlabInstanceUrl: "bitbucketReviewer.gitlab.instanceUrl",
  jiraSiteUrl: "bitbucketReviewer.jira.siteUrl",
  jiraEmail: "bitbucketReviewer.jira.email",
  jiraApiToken: "bitbucketReviewer.jira.apiToken",
} as const;

export class SecretStore {
  constructor(private readonly secrets: vscode.SecretStorage) {}

  async getApiToken(): Promise<{ email: string; token: string } | undefined> {
    const [email, token] = await Promise.all([
      this.secrets.get(KEYS.apiTokenEmail),
      this.secrets.get(KEYS.apiTokenSecret),
    ]);
    if (!email || !token) {
      return undefined;
    }
    return { email, token };
  }

  async setApiToken(email: string, token: string): Promise<void> {
    await Promise.all([
      this.secrets.store(KEYS.apiTokenEmail, email),
      this.secrets.store(KEYS.apiTokenSecret, token),
    ]);
  }

  async clearApiToken(): Promise<void> {
    await Promise.all([this.secrets.delete(KEYS.apiTokenEmail), this.secrets.delete(KEYS.apiTokenSecret)]);
  }

  async getOAuthTokens(): Promise<
    { accessToken: string; refreshToken: string; expiresAt: number; accountLabel?: string } | undefined
  > {
    const [accessToken, refreshToken, expiresAt, accountLabel] = await Promise.all([
      this.secrets.get(KEYS.oauthAccessToken),
      this.secrets.get(KEYS.oauthRefreshToken),
      this.secrets.get(KEYS.oauthExpiresAt),
      this.secrets.get(KEYS.oauthAccountLabel),
    ]);
    if (!accessToken || !refreshToken || !expiresAt) {
      return undefined;
    }
    return { accessToken, refreshToken, expiresAt: Number(expiresAt), accountLabel };
  }

  async setOAuthTokens(tokens: {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    accountLabel?: string;
  }): Promise<void> {
    await Promise.all([
      this.secrets.store(KEYS.oauthAccessToken, tokens.accessToken),
      this.secrets.store(KEYS.oauthRefreshToken, tokens.refreshToken),
      this.secrets.store(KEYS.oauthExpiresAt, String(tokens.expiresAt)),
      tokens.accountLabel
        ? this.secrets.store(KEYS.oauthAccountLabel, tokens.accountLabel)
        : Promise.resolve(),
    ]);
  }

  async clearOAuthTokens(): Promise<void> {
    await Promise.all([
      this.secrets.delete(KEYS.oauthAccessToken),
      this.secrets.delete(KEYS.oauthRefreshToken),
      this.secrets.delete(KEYS.oauthExpiresAt),
      this.secrets.delete(KEYS.oauthAccountLabel),
    ]);
  }

  async getOpenAiApiKey(): Promise<string | undefined> {
    return this.secrets.get(KEYS.openaiApiKey);
  }

  async setOpenAiApiKey(apiKey: string): Promise<void> {
    await this.secrets.store(KEYS.openaiApiKey, apiKey);
  }

  async clearOpenAiApiKey(): Promise<void> {
    await this.secrets.delete(KEYS.openaiApiKey);
  }

  async getClaudeApiKey(): Promise<string | undefined> {
    return this.secrets.get(KEYS.claudeApiKey);
  }

  async setClaudeApiKey(apiKey: string): Promise<void> {
    await this.secrets.store(KEYS.claudeApiKey, apiKey);
  }

  async clearClaudeApiKey(): Promise<void> {
    await this.secrets.delete(KEYS.claudeApiKey);
  }

  async getGeminiApiKey(): Promise<string | undefined> {
    return this.secrets.get(KEYS.geminiApiKey);
  }

  async setGeminiApiKey(apiKey: string): Promise<void> {
    await this.secrets.store(KEYS.geminiApiKey, apiKey);
  }

  async clearGeminiApiKey(): Promise<void> {
    await this.secrets.delete(KEYS.geminiApiKey);
  }

  async getGithubToken(): Promise<string | undefined> {
    return this.secrets.get(KEYS.githubToken);
  }

  async setGithubToken(token: string): Promise<void> {
    await this.secrets.store(KEYS.githubToken, token);
  }

  async clearGithubToken(): Promise<void> {
    await this.secrets.delete(KEYS.githubToken);
  }

  async getGitlabCredentials(): Promise<{ token: string; instanceUrl: string } | undefined> {
    const [token, instanceUrl] = await Promise.all([
      this.secrets.get(KEYS.gitlabToken),
      this.secrets.get(KEYS.gitlabInstanceUrl),
    ]);
    if (!token) {
      return undefined;
    }
    return { token, instanceUrl: instanceUrl || "https://gitlab.com" };
  }

  async setGitlabCredentials(token: string, instanceUrl: string): Promise<void> {
    await Promise.all([
      this.secrets.store(KEYS.gitlabToken, token),
      this.secrets.store(KEYS.gitlabInstanceUrl, instanceUrl),
    ]);
  }

  async clearGitlabCredentials(): Promise<void> {
    await Promise.all([this.secrets.delete(KEYS.gitlabToken), this.secrets.delete(KEYS.gitlabInstanceUrl)]);
  }

  async getJiraCredentials(): Promise<{ siteUrl: string; email: string; apiToken: string } | undefined> {
    const [siteUrl, email, apiToken] = await Promise.all([
      this.secrets.get(KEYS.jiraSiteUrl),
      this.secrets.get(KEYS.jiraEmail),
      this.secrets.get(KEYS.jiraApiToken),
    ]);
    if (!apiToken) {
      return undefined;
    }
    return { siteUrl: siteUrl ?? "", email: email ?? "", apiToken };
  }

  async setJiraCredentials(siteUrl: string, email: string, apiToken: string): Promise<void> {
    await Promise.all([
      this.secrets.store(KEYS.jiraSiteUrl, siteUrl),
      this.secrets.store(KEYS.jiraEmail, email),
      this.secrets.store(KEYS.jiraApiToken, apiToken),
    ]);
  }

  async clearJiraCredentials(): Promise<void> {
    await Promise.all([
      this.secrets.delete(KEYS.jiraSiteUrl),
      this.secrets.delete(KEYS.jiraEmail),
      this.secrets.delete(KEYS.jiraApiToken),
    ]);
  }
}
