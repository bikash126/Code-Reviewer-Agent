// JSON Schema passed to the OpenAI Responses API structured-output config (`text.format`).
// Mirrors the ReviewResult contract (minus generatedAt/model, which we stamp locally).
export const REVIEW_RESULT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    summaryMarkdown: {
      type: "string",
      description: "Final Bitbucket-ready markdown summary suitable for posting as a PR comment.",
    },
    riskLevel: { type: "string", enum: ["low", "medium", "high"] },
    keyChanges: { type: "array", items: { type: "string" } },
    potentialIssues: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          severity: { type: "string", enum: ["info", "warning", "critical"] },
          file: { type: "string" },
          detail: { type: "string" },
        },
        required: ["severity", "detail", "file"],
      },
    },
    testSuggestions: { type: "array", items: { type: "string" } },
  },
  required: ["summaryMarkdown", "riskLevel", "keyChanges", "potentialIssues", "testSuggestions"],
} as const;
