export interface AuthProvider {
  readonly method: "apiToken" | "oauth";
  /** Returns true if credentials are already stored (does not validate them against the API). */
  isConnected(): Promise<boolean>;
  /** Runs the interactive connect flow (prompting, or the OAuth browser round-trip) and persists credentials. */
  connect(): Promise<void>;
  /** Returns the value for the HTTP `Authorization` header, refreshing tokens if necessary. */
  getAuthHeader(): Promise<string>;
  /** A human readable label for the connected account, if known. */
  getAccountLabel(): Promise<string | undefined>;
  signOut(): Promise<void>;
}

export class AuthError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "AuthError";
  }
}
