import * as vscode from "vscode";
import { BUILT_IN_RULES, REVIEW_PASS_IDS, ReviewSettings } from "../types";

const SECTION = "bitbucketReviewer";
// All settings edits go to the user (Global) scope, keeping behavior predictable and
// consistent across whichever repo/workspace happens to be open.
const TARGET = vscode.ConfigurationTarget.Global;

export function getReviewSettings(): ReviewSettings {
  const config = vscode.workspace.getConfiguration(SECTION);

  return {
    commentFormat: {
      showSeverity: config.get<boolean>("commentFormat.showSeverity", true),
      showCategory: config.get<boolean>("commentFormat.showCategory", true),
      showFooter: config.get<boolean>("commentFormat.showFooter", true),
      template: config.get<string>("commentFormat.template", ""),
    },
    reviewPrompt: config.get<string>("reviewPrompt.custom", ""),
    enhancedSecurityScan: config.get<boolean>("enhancedSecurityScan.enabled", false),
    reviewPasses: Object.fromEntries(
      REVIEW_PASS_IDS.map((id) => [id, config.get<boolean>(`reviewPasses.${id}`, true)]),
    ) as ReviewSettings["reviewPasses"],
    passPrompts: Object.fromEntries(
      REVIEW_PASS_IDS.map((id) => [id, config.get<string>(`passPrompts.${id}`, "")]),
    ) as ReviewSettings["passPrompts"],
    codeQuality: {
      customPrompt: config.get<string>("codeQuality.customPrompt", ""),
    },
    excludedFiles: {
      customPatterns: config.get<string>("excludedFiles.customPatterns", ""),
    },
    fileRules: {
      alwaysReview: config.get<string>("fileRules.alwaysReview", ""),
      treatAsTrivial: config.get<string>("fileRules.treatAsTrivial", ""),
    },
    builtInRules: Object.fromEntries(
      BUILT_IN_RULES.map((rule) => [rule.id, config.get<boolean>(`builtInRules.${rule.id}`, true)]),
    ) as ReviewSettings["builtInRules"],
  };
}

/** `key` is the setting path under `bitbucketReviewer.`, e.g. "commentFormat.showSeverity". */
export async function updateReviewSetting(key: string, value: boolean | string): Promise<void> {
  await vscode.workspace.getConfiguration(SECTION).update(key, value, TARGET);
}

/** Clears any override for `key`, reverting it to the schema default declared in package.json. */
export async function resetReviewSetting(key: string): Promise<void> {
  await vscode.workspace.getConfiguration(SECTION).update(key, undefined, TARGET);
}
