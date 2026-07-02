import { describe, expect, it } from "vitest";
import { SecretStore } from "../../auth/secretStorage";
import {
  getIntegrationsState,
  saveAiProviderKey,
  saveGithubToken,
  saveGitlabCredentials,
  saveJiraCredentials,
} from "../../settings/integrationsService";

function makeSecretStore(): SecretStore {
  const store = new Map<string, string>();
  const fakeSecrets = {
    get: async (key: string) => store.get(key),
    store: async (key: string, value: string) => {
      store.set(key, value);
    },
    delete: async (key: string) => {
      store.delete(key);
    },
  };
  return new SecretStore(fakeSecrets as unknown as ConstructorParameters<typeof SecretStore>[0]);
}

describe("integrationsService", () => {
  it("reports everything as not configured initially, with bitbucket/openai reflecting the passed-in flags", async () => {
    const secretStore = makeSecretStore();
    const state = await getIntegrationsState(secretStore, false, false);

    expect(state.claude.configured).toBe(false);
    expect(state.gemini.configured).toBe(false);
    expect(state.github.configured).toBe(false);
    expect(state.gitlab).toEqual({ configured: false, instanceUrl: "https://gitlab.com" });
    expect(state.jira).toEqual({ configured: false, siteUrl: "", email: "" });
    expect(state.openai.configured).toBe(false);
    expect(state.bitbucket.configured).toBe(false);
  });

  it("reflects bitbucket/openai configured flags passed in by the caller", async () => {
    const secretStore = makeSecretStore();
    const state = await getIntegrationsState(secretStore, true, true);

    expect(state.bitbucket.configured).toBe(true);
    expect(state.openai.configured).toBe(true);
  });

  it("saveAiProviderKey stores Claude and Gemini keys independently", async () => {
    const secretStore = makeSecretStore();
    await saveAiProviderKey(secretStore, "claude", "sk-ant-123");
    await saveAiProviderKey(secretStore, "gemini", "AIza-456");

    const state = await getIntegrationsState(secretStore, false, false);
    expect(state.claude.configured).toBe(true);
    expect(state.gemini.configured).toBe(true);
    expect(await secretStore.getClaudeApiKey()).toBe("sk-ant-123");
    expect(await secretStore.getGeminiApiKey()).toBe("AIza-456");
  });

  it("saving an empty/whitespace value clears the credential instead of storing an empty secret", async () => {
    const secretStore = makeSecretStore();
    await saveAiProviderKey(secretStore, "claude", "sk-ant-123");
    expect((await getIntegrationsState(secretStore, false, false)).claude.configured).toBe(true);

    await saveAiProviderKey(secretStore, "claude", "   ");

    expect((await getIntegrationsState(secretStore, false, false)).claude.configured).toBe(false);
  });

  it("saveGithubToken trims and stores the token", async () => {
    const secretStore = makeSecretStore();
    await saveGithubToken(secretStore, "  ghp_abc123  ");

    expect(await secretStore.getGithubToken()).toBe("ghp_abc123");
  });

  it("saveGitlabCredentials defaults the instance URL to gitlab.com when blank", async () => {
    const secretStore = makeSecretStore();
    await saveGitlabCredentials(secretStore, "glpat-xyz", "  ");

    const state = await getIntegrationsState(secretStore, false, false);
    expect(state.gitlab).toEqual({ configured: true, instanceUrl: "https://gitlab.com" });
  });

  it("saveGitlabCredentials preserves a custom self-hosted instance URL", async () => {
    const secretStore = makeSecretStore();
    await saveGitlabCredentials(secretStore, "glpat-xyz", "https://gitlab.internal.example.com");

    const state = await getIntegrationsState(secretStore, false, false);
    expect(state.gitlab.instanceUrl).toBe("https://gitlab.internal.example.com");
  });

  it("saveJiraCredentials stores site URL, email, and token together and clears them when the token is blank", async () => {
    const secretStore = makeSecretStore();
    await saveJiraCredentials(secretStore, "https://team.atlassian.net", "dev@example.com", "jira-token");

    let state = await getIntegrationsState(secretStore, false, false);
    expect(state.jira).toEqual({ configured: true, siteUrl: "https://team.atlassian.net", email: "dev@example.com" });

    await saveJiraCredentials(secretStore, "https://team.atlassian.net", "dev@example.com", "");

    state = await getIntegrationsState(secretStore, false, false);
    expect(state.jira.configured).toBe(false);
  });
});
