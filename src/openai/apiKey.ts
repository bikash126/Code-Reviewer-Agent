import * as vscode from "vscode";
import { SecretStore } from "../auth/secretStorage";

export class MissingOpenAiApiKeyError extends Error {
  constructor() {
    super("OpenAI API key was not provided.");
    this.name = "MissingOpenAiApiKeyError";
  }
}

/** Returns the stored OpenAI API key, prompting the user to enter one (and persisting it) if missing. */
export async function ensureOpenAiApiKey(secretStore: SecretStore): Promise<string> {
  const existing = await secretStore.getOpenAiApiKey();
  if (existing) {
    return existing;
  }

  const entered = await vscode.window.showInputBox({
    title: "Bitbucket PR Reviewer: OpenAI API Key",
    prompt: "Enter your OpenAI API key (stored securely in VS Code SecretStorage)",
    password: true,
    ignoreFocusOut: true,
    validateInput: (value) => (value.trim().length > 0 ? undefined : "Enter an OpenAI API key"),
  });
  if (!entered) {
    throw new MissingOpenAiApiKeyError();
  }
  await secretStore.setOpenAiApiKey(entered.trim());
  return entered.trim();
}
