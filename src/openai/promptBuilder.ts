import { PullRequestDetail } from "../types";

export function buildReviewPrompt(
  detail: PullRequestDetail,
  diff: string,
  diffTruncated: boolean,
): string {
  const fileList = detail.changedFiles
    .map((f) => `- ${f.status.toUpperCase()} ${f.path} (+${f.linesAdded}/-${f.linesRemoved})`)
    .join("\n");

  const truncationNote = diffTruncated
    ? "\n\nNOTE: The diff below was truncated to fit size limits. Base findings only on what is shown, and mention in your summary that the review covers a truncated diff."
    : "";

  return `You are an expert code reviewer producing a pull request review for a Bitbucket Cloud PR.

## Pull Request
Title: ${detail.title}
Source branch: ${detail.sourceBranch} -> Destination branch: ${detail.destinationBranch}
Author: ${detail.author.displayName}
Description:
${detail.description || "(no description provided)"}

## Changed files (${detail.changedFiles.length})
${fileList || "(no file changes reported)"}

## Diff${truncationNote}
\`\`\`diff
${diff}
\`\`\`

## Instructions
Review the diff for correctness bugs, security issues, and design/maintainability concerns. Then produce:
1. An executive summary of what the PR does and your overall assessment.
2. An overall risk level (low, medium, or high) based on blast radius and the severity of issues found.
3. A short list of key changes (bullet points, plain language).
4. Potential bugs or issues you found, each with a severity (info, warning, or critical), the file it relates to if applicable, and a concise detail.
5. Suggested test focus areas — what a reviewer or QA engineer should specifically verify before merging.
6. A final Bitbucket-ready markdown summary suitable for posting as a PR comment: concise, well-formatted with headings/bullets, written for the PR author and reviewers.`;
}
