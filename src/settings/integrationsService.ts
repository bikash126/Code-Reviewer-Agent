import { SecretStore } from "../auth/secretStorage";
import { IntegrationsState } from "../types";

export async function getIntegrationsState(
  secretStore: SecretStore,
  bitbucketConfigured: boolean,
  openaiConfigured: boolean,
): Promise<IntegrationsState> {
  const [claude, gemini, github, gitlab, jira] = await Promise.all([
    secretStore.getClaudeApiKey(),
    secretStore.getGeminiApiKey(),
    secretStore.getGithubToken(),
    secretStore.getGitlabCredentials(),
    secretStore.getJiraCredentials(),
  ]);

  return {
    claude: { configured: Boolean(claude) },
    gemini: { configured: Boolean(gemini) },
    openai: { configured: openaiConfigured },
    bitbucket: { configured: bitbucketConfigured },
    github: { configured: Boolean(github) },
    gitlab: { configured: Boolean(gitlab), instanceUrl: gitlab?.instanceUrl ?? "https://gitlab.com" },
    jira: { configured: Boolean(jira), siteUrl: jira?.siteUrl ?? "", email: jira?.email ?? "" },
  };
}

/** An empty/whitespace-only value clears the stored credential rather than saving an empty secret. */
export async function saveAiProviderKey(
  secretStore: SecretStore,
  provider: "claude" | "gemini",
  apiKey: string,
): Promise<void> {
  const trimmed = apiKey.trim();
  if (provider === "claude") {
    await (trimmed ? secretStore.setClaudeApiKey(trimmed) : secretStore.clearClaudeApiKey());
  } else {
    await (trimmed ? secretStore.setGeminiApiKey(trimmed) : secretStore.clearGeminiApiKey());
  }
}

export async function saveGithubToken(secretStore: SecretStore, token: string): Promise<void> {
  const trimmed = token.trim();
  await (trimmed ? secretStore.setGithubToken(trimmed) : secretStore.clearGithubToken());
}

export async function saveGitlabCredentials(
  secretStore: SecretStore,
  token: string,
  instanceUrl: string,
): Promise<void> {
  const trimmedToken = token.trim();
  const url = instanceUrl.trim() || "https://gitlab.com";
  await (trimmedToken ? secretStore.setGitlabCredentials(trimmedToken, url) : secretStore.clearGitlabCredentials());
}

export async function saveJiraCredentials(
  secretStore: SecretStore,
  siteUrl: string,
  email: string,
  apiToken: string,
): Promise<void> {
  const trimmedToken = apiToken.trim();
  await (trimmedToken
    ? secretStore.setJiraCredentials(siteUrl.trim(), email.trim(), trimmedToken)
    : secretStore.clearJiraCredentials());
}
