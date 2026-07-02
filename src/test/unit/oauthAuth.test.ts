import { beforeEach, describe, expect, it, vi } from "vitest";

// oauthAuth.ts imports `vscode` for configuration + interactive UI APIs. Only
// `workspace.getConfiguration` is exercised by the code paths under test here
// (getAuthHeader / token refresh), so the mock only needs to cover that surface.
vi.mock("vscode", () => {
  const settings: Record<string, string> = {
    "bitbucketReviewer.oauth.clientId": "client-123",
    "bitbucketReviewer.oauth.clientSecret": "secret-456",
  };
  return {
    workspace: {
      getConfiguration: (section: string) => ({
        get: (key: string, defaultValue: string) => settings[`${section}.${key}`] ?? defaultValue,
      }),
    },
  };
});

const { OAuthAuthProvider } = await import("../../auth/oauthAuth");
const { SecretStore } = await import("../../auth/secretStorage");
import type { FetchLike } from "../../auth/oauthAuth";

function makeInMemorySecretStorage() {
  const store = new Map<string, string>();
  return {
    get: async (key: string) => store.get(key),
    store: async (key: string, value: string) => {
      store.set(key, value);
    },
    delete: async (key: string) => {
      store.delete(key);
    },
  } as unknown as ConstructorParameters<typeof SecretStore>[0];
}

describe("OAuthAuthProvider.getAuthHeader", () => {
  let secretStore: InstanceType<typeof SecretStore>;

  beforeEach(() => {
    secretStore = new SecretStore(makeInMemorySecretStorage());
  });

  it("returns the stored access token without refreshing when it isn't near expiry", async () => {
    await secretStore.setOAuthTokens({
      accessToken: "access-1",
      refreshToken: "refresh-1",
      expiresAt: Date.now() + 10 * 60_000,
    });
    const fetchFn = vi.fn<Parameters<FetchLike>, ReturnType<FetchLike>>();
    const provider = new OAuthAuthProvider(secretStore, fetchFn);

    const header = await provider.getAuthHeader();

    expect(header).toBe("Bearer access-1");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("refreshes an expired token using the refresh_token grant and persists the new tokens", async () => {
    await secretStore.setOAuthTokens({
      accessToken: "expired-access",
      refreshToken: "refresh-1",
      expiresAt: Date.now() - 1000,
    });
    const fetchFn = vi.fn<Parameters<FetchLike>, ReturnType<FetchLike>>().mockResolvedValue(
      new Response(
        JSON.stringify({ access_token: "new-access", refresh_token: "new-refresh", expires_in: 3600, token_type: "bearer" }),
        { status: 200 },
      ),
    );
    const provider = new OAuthAuthProvider(secretStore, fetchFn);

    const header = await provider.getAuthHeader();

    expect(header).toBe("Bearer new-access");
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://bitbucket.org/site/oauth2/access_token");
    const reqInit = init as RequestInit;
    expect((reqInit.headers as Record<string, string>).Authorization).toBe(
      `Basic ${Buffer.from("client-123:secret-456").toString("base64")}`,
    );
    expect(reqInit.body).toBe("grant_type=refresh_token&refresh_token=refresh-1");

    const persisted = await secretStore.getOAuthTokens();
    expect(persisted).toMatchObject({ accessToken: "new-access", refreshToken: "new-refresh" });
  });

  it("falls back to the previous refresh token when Bitbucket doesn't rotate it", async () => {
    await secretStore.setOAuthTokens({
      accessToken: "expired-access",
      refreshToken: "refresh-1",
      expiresAt: Date.now() - 1000,
    });
    const fetchFn = vi.fn<Parameters<FetchLike>, ReturnType<FetchLike>>().mockResolvedValue(
      new Response(JSON.stringify({ access_token: "new-access", expires_in: 3600, token_type: "bearer" }), {
        status: 200,
      }),
    );
    const provider = new OAuthAuthProvider(secretStore, fetchFn);

    await provider.getAuthHeader();

    const persisted = await secretStore.getOAuthTokens();
    expect(persisted?.refreshToken).toBe("refresh-1");
  });

  it("throws when no tokens have been stored yet", async () => {
    const provider = new OAuthAuthProvider(secretStore, vi.fn<Parameters<FetchLike>, ReturnType<FetchLike>>());
    await expect(provider.getAuthHeader()).rejects.toThrow(/Not connected/);
  });
});
