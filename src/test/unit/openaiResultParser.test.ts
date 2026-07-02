import { describe, expect, it } from "vitest";
import { OpenAiResultParseError, parseReviewJson } from "../../openai/resultParser";

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    summaryMarkdown: "## Summary\nLooks good.",
    riskLevel: "medium",
    keyChanges: ["Added retry logic"],
    potentialIssues: [{ severity: "warning", file: "src/foo.ts", detail: "Possible race condition" }],
    testSuggestions: ["Verify retries stop after 3 attempts"],
    ...overrides,
  };
}

describe("parseReviewJson", () => {
  it("parses a well-formed structured-output payload", () => {
    const result = parseReviewJson(JSON.stringify(validPayload()));
    expect(result.riskLevel).toBe("medium");
    expect(result.potentialIssues).toEqual([
      { severity: "warning", file: "src/foo.ts", detail: "Possible race condition" },
    ]);
  });

  it("treats an empty-string file as undefined", () => {
    const payload = validPayload({
      potentialIssues: [{ severity: "info", file: "", detail: "General note" }],
    });
    const result = parseReviewJson(JSON.stringify(payload));
    expect(result.potentialIssues[0].file).toBeUndefined();
  });

  it("throws OpenAiResultParseError on invalid JSON", () => {
    expect(() => parseReviewJson("{not json")).toThrow(OpenAiResultParseError);
  });

  it("throws when riskLevel is not one of the allowed values", () => {
    const payload = validPayload({ riskLevel: "extreme" });
    expect(() => parseReviewJson(JSON.stringify(payload))).toThrow(/riskLevel/);
  });

  it("throws when a required array field is missing", () => {
    const payload = validPayload();
    delete (payload as Record<string, unknown>).keyChanges;
    expect(() => parseReviewJson(JSON.stringify(payload))).toThrow(/keyChanges/);
  });

  it("throws when an issue has an invalid severity", () => {
    const payload = validPayload({ potentialIssues: [{ severity: "urgent", file: "a.ts", detail: "x" }] });
    expect(() => parseReviewJson(JSON.stringify(payload))).toThrow(/severity/);
  });

  it("throws when summaryMarkdown is empty", () => {
    const payload = validPayload({ summaryMarkdown: "   " });
    expect(() => parseReviewJson(JSON.stringify(payload))).toThrow(/summaryMarkdown/);
  });
});
