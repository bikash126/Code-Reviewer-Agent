import { describe, expect, it, vi } from "vitest";
import { extractOutputText, OpenAiClient, OpenAiReviewError, FetchLike } from "../../openai/client";

function reviewJson() {
  return JSON.stringify({
    summaryMarkdown: "## Summary\nAll good.",
    riskLevel: "low",
    keyChanges: ["Refactored auth"],
    potentialIssues: [],
    testSuggestions: ["Run the auth test suite"],
  });
}

describe("extractOutputText", () => {
  it("prefers the output_text convenience field", () => {
    expect(extractOutputText({ output_text: "hello" })).toBe("hello");
  });

  it("falls back to walking the output array for a message item", () => {
    const text = extractOutputText({
      output: [{ type: "reasoning" }, { type: "message", content: [{ type: "output_text", text: "from output" }] }],
    });
    expect(text).toBe("from output");
  });

  it("returns undefined when no output text is present", () => {
    expect(extractOutputText({ output: [{ type: "reasoning" }] })).toBeUndefined();
  });
});

describe("OpenAiClient.runReview", () => {
  it("sends the API key, model, and structured output schema, then parses the result", async () => {
    const fetchFn = vi.fn<Parameters<FetchLike>, ReturnType<FetchLike>>().mockResolvedValue(
      new Response(JSON.stringify({ output_text: reviewJson() }), { status: 200 }),
    );

    const client = new OpenAiClient("sk-test", fetchFn);
    const result = await client.runReview("review this diff", "gpt-5");

    expect(result.riskLevel).toBe("low");
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/responses");
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer sk-test");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.model).toBe("gpt-5");
    expect(body.text.format.type).toBe("json_schema");
    expect(body.text.format.strict).toBe(true);
  });

  it("throws OpenAiReviewError on a non-2xx response", async () => {
    const fetchFn = vi.fn<Parameters<FetchLike>, ReturnType<FetchLike>>().mockResolvedValue(new Response("rate limited", { status: 429 }));
    const client = new OpenAiClient("sk-test", fetchFn);

    await expect(client.runReview("prompt", "gpt-5")).rejects.toBeInstanceOf(OpenAiReviewError);
  });

  it("throws OpenAiReviewError when the response has no output text", async () => {
    const fetchFn = vi.fn<Parameters<FetchLike>, ReturnType<FetchLike>>().mockResolvedValue(new Response(JSON.stringify({ output: [] }), { status: 200 }));
    const client = new OpenAiClient("sk-test", fetchFn);

    await expect(client.runReview("prompt", "gpt-5")).rejects.toBeInstanceOf(OpenAiReviewError);
  });
});
