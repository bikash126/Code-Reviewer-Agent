// Structured changelog data, rendered natively by the webview's Changelog tab.
// Kept in sync by hand with CHANGELOG.md (shown in the Extensions view's "Changelog" tab) —
// the wording here is the source of truth; CHANGELOG.md mirrors it in plain markdown.

export interface ChangelogItem {
  title: string;
  description: string;
}

export interface ChangelogSection {
  heading: "New" | "Improved" | "Fixed" | "Coming Soon";
  items: ChangelogItem[];
}

export interface ChangelogRelease {
  version: string;
  date?: string;
  sections: ChangelogSection[];
}

export const CHANGELOG: ChangelogRelease[] = [
  {
    version: "Unreleased",
    sections: [
      {
        heading: "Coming Soon",
        items: [
          {
            title: "Wired-up review passes",
            description:
              "The Settings tab's specialized Security/Bugs/Performance/Style passes, comment template, and file-exclusion rules will actually drive the review pipeline instead of just being stored.",
          },
          {
            title: "Multi-provider reviews",
            description:
              "Use the Claude/Gemini/GitHub/GitLab/Jira credentials already stored in the Integrations tab for real reviews and cross-provider PRs.",
          },
        ],
      },
    ],
  },
  {
    version: "0.1.8",
    date: "2026-07-02",
    sections: [
      {
        heading: "New",
        items: [
          {
            title: "Batch Review",
            description:
              "Review pull requests across every Bitbucket repo in your workspace at once: pick repos, multi-select PRs, and batch-generate AI summaries. Posting still requires its own confirmation per PR.",
          },
        ],
      },
    ],
  },
  {
    version: "0.1.7",
    date: "2026-07-02",
    sections: [
      {
        heading: "New",
        items: [
          {
            title: "Changelog tab",
            description: "This tab — browse the full release history without leaving the panel.",
          },
        ],
      },
    ],
  },
  {
    version: "0.1.6",
    date: "2026-07-02",
    sections: [
      {
        heading: "New",
        items: [
          {
            title: "Inline comments",
            description:
              "Comment directly in the diff editor gutter (VS Code's native Comments API) and post them to Bitbucket as inline PR comments, attached to the correct file/line on either side of the diff.",
          },
          {
            title: "Changelog",
            description: "Extension changelog is now tracked and shown in the Extensions view's Changelog tab.",
          },
        ],
      },
    ],
  },
  {
    version: "0.1.5",
    date: "2026-07-02",
    sections: [
      {
        heading: "New",
        items: [
          {
            title: "Changed files tree",
            description:
              "Changed files are now grouped into a folder tree, with single-child folder chains compressed like VS Code's own Explorer, instead of a flat list.",
          },
        ],
      },
    ],
  },
  {
    version: "0.1.4",
    date: "2026-07-02",
    sections: [
      {
        heading: "Improved",
        items: [
          {
            title: "Native diff editor",
            description:
              "Clicking a changed file now opens a native VS Code diff editor tab (side-by-side before/after) instead of an inline unified-diff block.",
          },
        ],
      },
    ],
  },
  {
    version: "0.1.3",
    date: "2026-07-02",
    sections: [
      {
        heading: "New",
        items: [
          {
            title: "Per-file diffs",
            description: "Click a changed file to view its diff (later replaced in 0.1.4 by a native diff editor tab).",
          },
        ],
      },
    ],
  },
  {
    version: "0.1.2",
    date: "2026-07-02",
    sections: [
      {
        heading: "New",
        items: [
          {
            title: "Activity Bar view",
            description:
              "A dedicated icon in the Activity Bar opens the same PR list/detail/review/settings/integrations app docked in the sidebar, with a responsive layout for narrow widths.",
          },
        ],
      },
    ],
  },
  {
    version: "0.1.1",
    date: "2026-07-02",
    sections: [
      {
        heading: "New",
        items: [
          { title: "Project README", description: "Setup, usage, settings reference, and development instructions." },
        ],
      },
    ],
  },
  {
    version: "0.1.0",
    date: "2026-07-02",
    sections: [
      {
        heading: "New",
        items: [
          {
            title: "Initial release",
            description:
              "List Bitbucket Cloud pull requests, run an AI-assisted review via the OpenAI Responses API, edit the draft summary, and post it as a PR comment only on explicit approval.",
          },
          {
            title: "Bitbucket authentication",
            description: "API-token and OAuth 2.0 authentication for Bitbucket Cloud.",
          },
          {
            title: "Multi-repo support",
            description: "Workspace repo picker with a remembered choice per workspace.",
          },
          {
            title: "Settings & Integrations tabs",
            description:
              "Comment format, review prompt, specialized review passes, file-exclusion rules, and Claude/Gemini/GitHub/GitLab/Jira credential storage.",
          },
        ],
      },
    ],
  },
];
