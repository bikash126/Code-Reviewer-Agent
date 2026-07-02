import { beforeEach, describe, expect, it, vi } from "vitest";

// settingsService.ts reads/writes via vscode.workspace.getConfiguration. This fake mirrors the
// subset of the real WorkspaceConfiguration API it uses: `get(key, default)` and `update(key, value, target)`.
const store = new Map<string, unknown>();
const updateSpy = vi.fn(async (key: string, value: unknown) => {
  if (value === undefined) {
    store.delete(key);
  } else {
    store.set(key, value);
  }
});

vi.mock("vscode", () => ({
  ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 },
  workspace: {
    getConfiguration: () => ({
      get: (key: string, defaultValue: unknown) => (store.has(key) ? store.get(key) : defaultValue),
      update: updateSpy,
    }),
  },
}));

const { getReviewSettings, updateReviewSetting, resetReviewSetting } = await import(
  "../../settings/settingsService"
);

describe("settingsService", () => {
  beforeEach(() => {
    store.clear();
    updateSpy.mockClear();
  });

  it("returns schema defaults when nothing has been overridden", () => {
    const settings = getReviewSettings();

    expect(settings.commentFormat.showSeverity).toBe(true);
    expect(settings.reviewPrompt).toBe("");
    expect(settings.enhancedSecurityScan).toBe(false);
    expect(settings.reviewPasses).toEqual({ security: true, bugs: true, performance: true, style: true });
    expect(settings.builtInRules.lockFiles).toBe(true);
    expect(Object.keys(settings.builtInRules)).toHaveLength(13);
  });

  it("reflects overridden values for nested setting paths", async () => {
    await updateReviewSetting("commentFormat.showSeverity", false);
    await updateReviewSetting("passPrompts.security", "custom security prompt");
    await updateReviewSetting("builtInRules.lockFiles", false);

    const settings = getReviewSettings();

    expect(settings.commentFormat.showSeverity).toBe(false);
    expect(settings.passPrompts.security).toBe("custom security prompt");
    expect(settings.builtInRules.lockFiles).toBe(false);
  });

  it("updateReviewSetting writes through to the underlying configuration with the Global target", async () => {
    await updateReviewSetting("reviewPrompt.custom", "focus on auth code");

    expect(updateSpy).toHaveBeenCalledWith("reviewPrompt.custom", "focus on auth code", 1);
  });

  it("resetReviewSetting clears the override by updating with undefined", async () => {
    await updateReviewSetting("commentFormat.showFooter", false);
    expect(getReviewSettings().commentFormat.showFooter).toBe(false);

    await resetReviewSetting("commentFormat.showFooter");

    expect(updateSpy).toHaveBeenLastCalledWith("commentFormat.showFooter", undefined, 1);
    expect(getReviewSettings().commentFormat.showFooter).toBe(true);
  });
});
